---
title: "Transformer Architecture: From Token Embeddings to the Training Loop"
date: 2026-09-14 10:25:02 +0200
slug: "transformer-architecture"
categories: ["Artificial Intelligence"]
tags: ["Transformer", "GPT", "Attention", "PyTorch", "Deep Learning"]
mathjax: true
mathjaxEnableSingleDollar: true
---


Transformer appears to be made up of many components, but a GPT-style forward path can be summarized as:

```text
Token IDs
   ↓
Token Embedding + Position Embedding
   ↓
[LayerNorm → Self-Attention → Residual]
   ↓
[LayerNorm → FFN → Residual]
   ↓
Repeat for multiple Transformer blocks
   ↓
Final LayerNorm → LM Head
   ↓
Next-token logits → Cross-Entropy Loss
```

This article starts from a simple GPT implementation and explains the role and tensor shape of each step along the data flow. The complete source code is placed at the end of the article. After reading the previous principles, you can compare and understand it with the code.

<!--more-->

## 1. Token Embedding

```python
self.token_embedding = nn.Embedding(vocab_size, n_embd)
```

Token embedding converts each token ID into a `n_embd` dimensional vector:

```text
125 → [0.1, -0.3, ..., 0.8]
731 → [0.4,  0.2, ..., 0.1]
402 → [0.7, -0.1, ..., 0.5]
```

Assume the batch size is $B$, the sequence length is $T$, the embedding dimension is $C$, and the output shape is $(B,T,C)$:

- $B$: How many sequences are there in a batch;
- $T$: How many tokens are there in each sequence;
- $C$: The vector dimension of each token, namely `n_embd`.

For example, when `batch_size = 4`, `sequence_length = 8`, `n_embd = 32`, the input may be:

```python
[
    [12, 45, 81,  3, 19, 27, 31,  9],
    [ 8, 22, 14, 65, 72, 11,  4, 20],
    [17, 33, 91, 26,  5, 48, 50, 10],
    [21, 13, 15, 99, 40, 41, 42, 43],
]
```

After embedding, the shape changes from $(4,8)$ to $(4,8,32)$.

## 2. Position Embedding

```python
self.position_embedding = nn.Embedding(max_seq_len, n_embd)
```

Token embedding only expresses "which token is this" and does not know where it appears. Without location information, it is difficult for the model to distinguish between `cat sat` and `sat cat`.

Therefore, we also assign a vector to each position and add it to the token embedding:

```python
hidden = token_embedding + position_embedding
```

In this way, the initial representation of each token contains two types of information at the same time: what it is, and where it is.

## 3. Transformer Blocks

The hidden vectors obtained by Embedding will pass through multiple Transformer blocks in sequence. If `n_layer = 4`, the output of the previous block is the input of the next block, passing through four layers in total.

The tensor shape of each layer usually remains $(B,T,n\_embd)$, what changes is the value in the vector and the information it expresses.

### What’s in a Transformer Block?

GPT style Transformer block mainly includes:

1. Multi-Head Self-Attention；
2. Feed-Forward Network（FFN）。

Each part is also paired with LayerNorm and residual connection. When using the pre-norm structure of `norm_first=True`, it can be written as:

$$
x' = x + \operatorname{Attention}(\operatorname{LayerNorm}(x))
$$

$$
y = x' + \operatorname{FFN}(\operatorname{LayerNorm}(x'))
$$

### 3.1 LayerNorm

LayerNorm will normalize the hidden vector of each token. For example, a token is represented as `[10, 100, -20, 5]`, and the numerical ranges of different dimensions vary greatly; LayerNorm will adjust them to a more stable range.

LayerNorm does not change shape:

$$
(B,T,n\_embd) \rightarrow (B,T,n\_embd)
$$

Its main function is to improve training stability.

### 3.2 Multi-Head Self-Attention

Self-Attention lets each token collect information from other tokens:

```text
Enter x
  ↓
Generate Query, Key, Value
  ↓
Split into multiple attention heads
  ↓
Calculate QKᵀ / √head_dim
  ↓
Apply causal mask → Softmax
  ↓
Weighted sum of Values
  ↓
Splice all heads → output projection W_O
```

#### Generate Q, K, V

The hidden vector of each token undergoes three linear transformations:

$$
Q=xW_Q,\qquad K=xW_K,\qquad V=xW_V
$$

- Query: What information is the current token looking for;
- Key: What features can the current token be found through;
- Value: the information actually provided by the current token.

#### Split multiple Heads

If `n_embd = 12`, `n_head = 3`, then the dimensions of each head are:

$$
head\_dim=\frac{12}{3}=4
$$

Q, K, and V will be split into three heads, and each head can learn different attention modes.

#### Calculate Attention Score

Each head uses scaled dot-product attention:

$$
\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\left(\frac{QK^T}{\sqrt{head\_dim}}\right)V
$$

For example, when processing `sat` in `The cat sat`, a head might give:

```text
The → 0.1
cat → 0.7
sat → 0.2
```

This means that the head is more concerned about `cat` at this time.

#### Causal Mask

The language model cannot peek into the future when predicting the next token, so a causal mask is used:

```text
         Location 1 Location 2 Location 3
Position 1 ✓ ✗ ✗
Position 2 ✓ ✓ ✗
Position 3 ✓ ✓ ✓
```

The first position can only see itself; the second position can see the first and second positions; and so on.

#### Weighted sum of Value

For the current position $i$, the output of a head is:

$$
h\_i^{(1)}=\alpha\_{i,1}^{(1)}v\_1^{(1)}+\alpha\_{i,2}^{(1)}v\_2^{(1)}+\cdots+\alpha\_{i,i}^{(1)}v\_i^{(1)}
$$

That is, the information provided by each visible location is weighted and summed according to the current location's attention to it.

#### Splice all Heads

Each head gets a `head_dim` dimensional vector. Put all heads together:

$$
h_i=\operatorname{Concat}(h_i^{(1)},h_i^{(2)},\ldots,h_i^{(H)})
$$

Because `n_head × head_dim = n_embd`, the concatenated vector is still `n_embd` dimension. Then go through the output projection:

$$
a_i=h_iW_O
$$

This linear layer remixes information from different heads, and the shape remains `n_embd → n_embd`.

### 3.3 The first Residual Connection

The attention output is added to the original input of the block:

$$
x'=x+\operatorname{Attention}(\operatorname{LayerNorm}(x))
$$

That is, the original token information is retained, while new information collected from the context is added. Residual connections also make deep networks easier to train and allow gradients to propagate forward more smoothly.

### 3.4 Feed-Forward Network

Attention is responsible for allowing different tokens to exchange information, while FFN independently processes each token's own hidden vector:

```text
n_embd → Linear → 4 × n_embd → GELU → Linear → n_embd
```

The formula is:

$$
\operatorname{FFN}(x)=W_2\operatorname{GELU}(W_1x)
$$

If `n_embd = 128`, `dim_feedforward = 512`, the dimension change is `128 → 512 → 128`. Different positions will pass through the same FFN independently, and FFN itself will not transfer information between positions.

### 3.5 Second Residual Connection

The output of FFN is also added back to the input:

$$
y=x'+\operatorname{FFN}(\operatorname{LayerNorm}(x'))
$$

This is the final output of a Transformer block. After multiple blocks are stacked, each token will obtain a richer and more abstract context representation layer by layer.

## 4. Final LayerNorm

After all Transformer blocks are completed, perform LayerNorm again:

```python
hidden = self.final_norm(hidden)
```

It makes the final hidden representation more stable, the shape is still $(B,T,n\_embd)$.

## 5. LM Head

Finally, project the hidden vector to the entire vocabulary:

```python
logits = self.lm_head(hidden)
```

The dimensions change from `n_embd` to `vocab_size`, so the shape of the logits is $(B,T,vocab\_size)$. For example:

```text
batch_size = 4
sequence_length = 128
vocab_size = 8192
```

The output shape is $(4,128,8192)$, that is, each position will give a score to 8,192 candidate tokens.

## 6. Cross-Entropy Loss

During training, compare logits with the correct next token:

```python
loss = F.cross_entropy(logits, targets)
```

For example:

```text
Input: The cat
Target: cat sat
```

The model learns to predict `cat` when it sees `The`, `sat` when it sees `The cat`, and then passes:

```python
loss.backward()
optimizer.step()
```

Calculate gradients and update parameters.

## 7. Let’s look at the matrix meaning of Multi-Head Attention again

Assume that the hidden vectors of the three tokens are $x_1,x_2,x_3$ respectively, which are obtained through the shared projection matrix:

$$
Q_i=x_iW_Q,\qquad K_i=x_iW_K
$$

Here $Q_i$ and $K_i$ are both vectors. If `head_dim = 4`:

```text
Q₁ = [ 0.2, -0.5,  0.7, 0.1]
Q₂ = [ 0.6,  0.3, -0.2, 0.8]
Q₃ = [-0.1,  0.4,  0.9, 0.5]
```

Stack the vectors at each position row by row. If $T=3,d=4$, there will be $Q,K\in\mathbb{R}^{3\times4}$. therefore:

$$
QK^T=
\begin{bmatrix}
Q_1K_1^T & Q_1K_2^T & Q_1K_3^T\\
Q_2K_1^T & Q_2K_2^T & Q_2K_3^T\\
Q_3K_1^T & Q_3K_2^T & Q_3K_3^T
\end{bmatrix}
$$

The $i$ row of the matrix represents the degree of attention that the token at position $i$ pays to all tokens. For example, the second row indicates how "interested" position 2 is in position 1, position 2, and position 3, respectively. Under causal mask, the scores for future positions are masked before softmax.

## 8. Complete minimal implementation

Here's an easy-to-understand example of a single-device GPT training. It omits performance optimization and distributed training, retaining only the most basic data flow.

```python
import argparse
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

from nanochat.common import get_base_dir
from nanochat.dataset import parquets_iter_batched
from nanochat.tokenizer import RustBPETokenizer


class SimpleGPT(nn.Module):
    """A small causal Transformer with no nanochat-specific optimizations."""

    def __init__(self, vocab_size, max_seq_len, n_embd, n_layer, n_head):
        super().__init__()
        if n_embd % n_head != 0:
            raise ValueError("n_embd must be divisible by n_head")

        self.vocab_size = vocab_size
        self.max_seq_len = max_seq_len
        self.token_embedding = nn.Embedding(vocab_size, n_embd)
        self.position_embedding = nn.Embedding(max_seq_len, n_embd)

        layer = nn.TransformerEncoderLayer(
            d_model=n_embd,
            nhead=n_head,
            dim_feedforward=4 * n_embd,
            dropout=0.0,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=n_layer)
        self.final_norm = nn.LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size, bias=False)

    def forward(self, input_ids, targets=None):
        _, seq_len = input_ids.shape
        if seq_len > self.max_seq_len:
            raise ValueError(
                f"sequence length {seq_len} exceeds max_seq_len {self.max_seq_len}"
            )

        positions = torch.arange(seq_len, device=input_ids.device)
        hidden = self.token_embedding(input_ids) + self.position_embedding(positions)

        # True entries are masked: a token cannot look at future tokens.
        causal_mask = torch.triu(
            torch.ones(seq_len, seq_len, dtype=torch.bool, device=input_ids.device),
            diagonal=1,
        )
        hidden = self.transformer(hidden, mask=causal_mask)
        logits = self.lm_head(self.final_norm(hidden))

        if targets is None:
            return logits

        return F.cross_entropy(
            logits.reshape(-1, self.vocab_size),
            targets.reshape(-1),
        )


def token_stream(tokenizer, split="train"):
    """Yield token IDs from the parquet dataset forever."""
    bos_id = tokenizer.get_bos_token_id()
    while True:
        for batch in parquets_iter_batched(split=split):
            for document in batch:
                yield bos_id
                yield from tokenizer.encode(document)


def batch_stream(tokenizer, batch_size, seq_len, split="train"):
    """Pack the token stream into input/target tensors."""
    stream = token_stream(tokenizer, split=split)
    tokens = []
    needed = batch_size * (seq_len + 1)

    while True:
        while len(tokens) < needed:
            tokens.extend(next(stream) for _ in range(needed - len(tokens)))

        row = torch.tensor(tokens[:needed], dtype=torch.long)
        tokens = tokens[needed:]
        row = row.view(batch_size, seq_len + 1)
        yield row[:, :-1], row[:, 1:]


def choose_device(device_arg):
    if device_arg:
        return torch.device(device_arg)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def main():
    parser = argparse.ArgumentParser(description="Readable single-device GPT training")
    parser.add_argument("--tokenizer-dir", type=str, required=True)
    parser.add_argument("--device", type=str, default="")
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--n-embd", type=int, default=128)
    parser.add_argument("--n-head", type=int, default=4)
    parser.add_argument("--max-seq-len", type=int, default=128)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--steps", type=int, default=100)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--print-every", type=int, default=10)
    parser.add_argument("--save-path", type=str, default="simple_model.pt")
    args = parser.parse_args()

    torch.manual_seed(42)
    device = choose_device(args.device)
    tokenizer = RustBPETokenizer.from_directory(args.tokenizer_dir)
    model = SimpleGPT(
        vocab_size=tokenizer.get_vocab_size(),
        max_seq_len=args.max_seq_len,
        n_embd=args.n_embd,
        n_layer=args.depth,
        n_head=args.n_head,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    train_batches = batch_stream(tokenizer, args.batch_size, args.max_seq_len)

    model.train()
    for step in range(1, args.steps + 1):
        inputs, targets = next(train_batches)
        loss = model(inputs.to(device), targets.to(device))
        loss.backward()
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)

        if step == 1 or step % args.print_every == 0:
            print(f"step {step:04d}/{args.steps:04d} | loss {loss.item():.4f}")

    save_path = Path(args.save_path)
    if not save_path.is_absolute():
        save_path = Path(get_base_dir()) / save_path
    save_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "config": vars(args)}, save_path)


if __name__ == "__main__":
    main()
```

Run the example:

```bash
python -m scripts.base_train_simple \
    --tokenizer-dir results/task1_tokenizers/tokenizer_8192 \
    --max-seq-len 128 --batch-size 4 --depth 2 \
    --n-embd 128 --n-head 4 --steps 100
```

Looking back at Transformer from this minimal implementation, the core is three things: embedding establishes the initial representation, attention exchanges information between tokens, FFN performs non-linear transformation on the representation of each token; after multi-layer stacking, LM Head converts the representation into the prediction score of the next token.
