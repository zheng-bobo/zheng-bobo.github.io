---
title: "Understanding GPT Pretraining Through nanochat: Model, Data, and Training Loop"
date: 2026-09-26 21:00:00 +0200
slug: "nanochat-gpt-pretraining-from-source"
categories: [Artificial Intelligence]
tags: [nanochat, GPT, Transformer, LLM Training, PyTorch]
mathjax: true
mathjaxEnableSingleDollar: true
---

A GPT training program connects much more than a Transformer forward pass. It closes an entire loop:

```text
documents → tokenizer and sequence packing → inputs/targets
          → GPT forward → cross-entropy loss
          → backward and gradient accumulation → optimizer step
          → evaluation, sampling, checkpointing, and resume
```

This article starts from my conceptual Transformer notes and follows nanochat's actual code to show how tensors move, how parameters are updated, and what engineering layers are needed around the model.

<!--more-->

> **Source version**
>
> This article is based on [karpathy/nanochat](https://github.com/karpathy/nanochat) commit [`92d63d4e8bb4df75c3b71618f31ddde2378b2bcd`](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd), committed on 2026-07-03 with the message `clean up fragile code`. The primary references are the pinned versions of [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py), [`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py), and [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py). nanochat evolves quickly, so conclusions should always be read against the pinned commit.

## 1. The three files that form the system

`base_train.py` is primarily an orchestrator rather than the model itself:

| File | Responsibility | Main output |
|---|---|---|
| `dataloader.py` | Read, tokenize, pack, and create next-token supervision | `x, y: (B, T)` |
| `gpt.py` | Embeddings, attention, MLP, LM head, and loss | scalar loss or `(B,T,V)` logits |
| `base_train.py` | Initialization, distributed execution, schedules, evaluation, and checkpoints | updated training state |

The irreducible training loop is:

```python
x, y = next(train_loader)
loss = model(x, y)
(loss / grad_accum).backward()
optimizer.step()
optimizer.zero_grad(set_to_none=True)
```

The production script surrounds these lines with distributed training, precision management, prefetching, dynamic hyperparameters, evaluation, sampling, and recovery.

## 2. From documents to next-token targets

For every row, the loader prepares $T+1$ tokens and creates shifted views:

$$
x=tokens[:, :-1],\qquad y=tokens[:, 1:]
$$

```text
full: <BOS>  I  like  AI  .
x:    <BOS>  I  like  AI
y:       I  like  AI   .
```

Both tensors have shape $(B,T)$. The token at position $t$ is trained to predict the token at $t+1$.

The BOS-aligned best-fit loader searches a document buffer for the longest document that fits in each remaining row segment. If none fits, it crops a document to fill the row exactly. This guarantees BOS alignment and no padding, at the cost of discarding some cropped tokens. Its state tracks the parquet file, row group, and epoch, which is essential for meaningful checkpoint resume.

## 3. How `depth` determines model size

nanochat treats depth as its main complexity dial. It starts with

$$
C_{base}=depth\times aspect\_ratio
$$

and rounds upward to a multiple of `head_dim`:

$$
C=\left\lceil\frac{C_{base}}{head\_dim}\right\rceil head\_dim,
\qquad H=C/head\_dim
$$

The model is created on the `meta` device, storage is allocated on the target device with `to_empty`, and `init_weights()` initializes all parameters. This avoids constructing a complete CPU model before copying it to the accelerator.

## 4. nanochat is not the textbook Transformer

My original notes use a pedagogical GPT: learned position embeddings, LayerNorm, and GELU. This nanochat commit uses a more modern and experimental stack:

| Textbook GPT | nanochat at this commit |
|---|---|
| Learned position embeddings | RoPE applied to Q and K |
| LayerNorm | parameter-free RMSNorm |
| GELU | ReLU² |
| Full attention in every layer | tiled `SSSL` sliding-window pattern; final layer is full |
| Possibly tied input/output embeddings | untied token embedding and LM head |
| Standard residual stream | x0 blending, residual scaling, and backout |

The conceptual notes still explain why a GPT block works. The source code shows that the concrete modules and engineering choices can differ substantially.

## 5. Forward pass, shape by shape

Let $B$ be batch size, $T$ sequence length, $C$ model width, $H$ query heads, $H_{kv}$ key/value heads, $D=C/H$ head dimension, and $V$ vocabulary size.

### 5.1 Embedding and Smear

Token lookup maps $(B,T)$ IDs to $(B,T,C)$ activations. nanochat then applies RMSNorm and a gated `Smear` operation that mixes the preceding token's embedding into the current position—a cheap bigram-like information path before attention begins.

### 5.2 Attention

Each layer projects the residual stream to:

$$
Q:(B,T,H,D),\qquad K,V:(B,T,H_{kv},D)
$$

The model supports Grouped-Query Attention, although `base_train.py` currently sets `n_kv_head = n_head`, so the default training configuration behaves as ordinary multi-head attention.

The layer then:

1. optionally mixes a gated Value Embedding into $V$;
2. applies RoPE to $Q$ and $K$;
3. normalizes $Q$ and $K$;
4. runs causal Flash Attention 3 or falls back to PyTorch SDPA;
5. merges heads and projects back to $(B,T,C)$.

The `SSSL` window pattern gives several layers local context followed by a full-context layer. The final layer is always full-context.

### 5.3 Block and MLP

The block remains pre-norm residual at its core:

$$
x\leftarrow x+Attention(RMSNorm(x))
$$

$$
x\leftarrow x+MLP(RMSNorm(x))
$$

The MLP expands $C\rightarrow4C\rightarrow C$ and uses

$$
ReLU^2(z)=\max(0,z)^2
$$

rather than GELU. Before each block, learnable scalars also rescale the residual stream and blend the initial embedding $x_0$ back in. These are nanochat-specific experiments, not universal GPT requirements.

### 5.4 LM head and loss

After the final RMSNorm, the LM head maps $(B,T,C)$ to $(B,T,V_{padded})$. The vocabulary is padded to a multiple of 64 for hardware efficiency and then sliced back to the real $V$.

Logits are converted to FP32 and smoothly capped:

$$
logits\leftarrow15\tanh(logits/15)
$$

Training flattens logits to $(BT,V)$ and targets to $(BT)$ for cross entropy. With no targets, the model returns logits for inference.

## 6. One optimizer step can contain many forward/backward passes

`total_batch_size` is measured in tokens. One micro-step across $W$ distributed ranks processes

$$
tokens_{micro}=B_{device}\times T\times W
$$

so the number of accumulated micro-steps is

$$
N_{accum}=\frac{total\_batch\_size}{tokens_{micro}}
$$

Each micro-loss is divided by $N_{accum}$ because `.backward()` sums gradients. The loader also starts fetching the next batch immediately after backward, overlapping CPU tokenization and data transfer with accelerator work where possible.

## 7. Muon and AdamW serve different parameter groups

nanochat uses Muon for Transformer matrix parameters and AdamW for embeddings, the LM head, and learned scalars. These groups have different learning rates, betas, and weight decay. The single `optimizer.step()` therefore hides multiple update rules.

Three schedules are updated during training:

- learning rate: linear warmup, constant phase, linear warmdown;
- Muon momentum: warmup followed by a late warmdown;
- Muon weight decay: cosine decay to zero.

FP16 activates a GradScaler. BF16 and FP32 do not require one. In distributed FP16 training, ranks synchronize their overflow flags so they either all perform or all skip an optimizer step.

## 8. Scaling laws inside the script

When the number of iterations is not explicitly provided, nanochat estimates a training-token horizon from a target data-to-parameter ratio:

$$
D=ratio\times N_{scaling}
$$

It then estimates total batch size and adjusts learning rate and weight decay. The general idea—training horizon should scale with model size—comes from scaling-law research. The exact exponent, reference batch, and transfer of AdamW reasoning to Muon are implementation assumptions; the source comments explicitly acknowledge that distinction.

Working research code should therefore be read at two levels: what the system does, and how strongly each heuristic is supported.

## 9. Evaluation and checkpointing are part of the algorithm

The loop periodically runs validation bits-per-byte, the CORE benchmark, fixed-prompt generation, and checkpointing. Bits-per-byte is especially useful because it is less dependent on tokenizer vocabulary than token-level loss.

A checkpoint contains more than model weights: optimizer state, model and CLI configuration, loader position, step, validation metrics, smoothed loss, and elapsed training time. Resuming training means restoring this whole state machine.

## 10. The complete data flow

```text
documents
  ↓ tokenize + BOS-aligned best-fit packing
x, y: (B, T)
  ↓ token embedding + RMSNorm + Smear
hidden: (B, T, C)
  ↓ repeated [RoPE/QK-Norm Attention + ReLU² MLP]
hidden: (B, T, C)
  ↓ RMSNorm + LM Head + soft-cap
logits: (B, T, V)
  ↓ cross entropy
loss: scalar
  ↓ gradient accumulation
MuonAdamW step
  ↓
evaluation / sampling / checkpoint
```

The original Transformer notes answer why the model architecture works. nanochat shows how that architecture becomes a trainable, scalable, recoverable, and measurable system. Reading both views together bridges architecture and training engineering.

## Source references

- [nanochat repository at the pinned commit](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd)
- [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py)
- [`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py)
- [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py)
- [Original Notion note: Transformer Architecture](https://app.notion.com/p/Transformer-Architecture-3dbf1cbefb538081b41ce7d64f6b4871)
