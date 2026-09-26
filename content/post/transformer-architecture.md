---
title: "Transformer Architecture：从 Token Embedding 到训练循环"
date: 2026-09-14 10:25:02 +0200
categories: [人工智能]
tags: [Transformer, GPT, Attention, PyTorch, 深度学习]
mathjax: true
---

Transformer 看起来由许多组件组成，但一条 GPT 风格的前向路径可以概括为：

```text
Token IDs
   ↓
Token Embedding + Position Embedding
   ↓
[LayerNorm → Self-Attention → Residual]
   ↓
[LayerNorm → FFN → Residual]
   ↓
重复多个 Transformer Blocks
   ↓
Final LayerNorm → LM Head
   ↓
Next-token logits → Cross-Entropy Loss
```

本文从一个简单的 GPT 实现出发，沿着数据流解释每一步的作用和张量形状。

<!--more-->

## 1. Token Embedding

```python
self.token_embedding = nn.Embedding(vocab_size, n_embd)
```

Token embedding 把每个 token ID 转换成一个 `n_embd` 维向量：

```text
125 → [0.1, -0.3, ..., 0.8]
731 → [0.4,  0.2, ..., 0.1]
402 → [0.7, -0.1, ..., 0.5]
```

设 batch size 为 $B$，序列长度为 $T$，embedding 维度为 $C$，输出形状就是 $(B,T,C)$：

- $B$：一个 batch 中有多少条序列；
- $T$：每条序列中有多少个 token；
- $C$：每个 token 的向量维度，即 `n_embd`。

例如，`batch_size = 4`、`sequence_length = 8`、`n_embd = 32` 时，输入可能是：

```python
[
    [12, 45, 81,  3, 19, 27, 31,  9],
    [ 8, 22, 14, 65, 72, 11,  4, 20],
    [17, 33, 91, 26,  5, 48, 50, 10],
    [21, 13, 15, 99, 40, 41, 42, 43],
]
```

经过 embedding 后，形状从 $(4,8)$ 变为 $(4,8,32)$。

## 2. Position Embedding

```python
self.position_embedding = nn.Embedding(max_seq_len, n_embd)
```

Token embedding 只表达“这是哪个 token”，并不知道它出现在哪里。如果没有位置信息，模型很难区分 `cat sat` 和 `sat cat`。

因此，我们也给每个位置分配一个向量，并把它和 token embedding 相加：

```python
hidden = token_embedding + position_embedding
```

这样每个 token 的初始表示就同时包含两类信息：它是什么，以及它在哪里。

## 3. Transformer Blocks

Embedding 得到的 hidden vectors 会依次经过多个 Transformer block。若 `n_layer = 4`，前一个 block 的输出就是后一个 block 的输入，一共经过四层。

每一层的张量形状通常保持为 $(B,T,n\_embd)$，变化的是向量里的数值以及它所表达的信息。

### 一个 Transformer Block 里有什么？

GPT 风格的 Transformer block 主要包括：

1. Multi-Head Self-Attention；
2. Feed-Forward Network（FFN）。

每部分还会搭配 LayerNorm 和 residual connection。采用 `norm_first=True` 的 pre-norm 结构时，可以写成：

$$
x' = x + \operatorname{Attention}(\operatorname{LayerNorm}(x))
$$

$$
y = x' + \operatorname{FFN}(\operatorname{LayerNorm}(x'))
$$

### 3.1 LayerNorm

LayerNorm 会对每个 token 的 hidden vector 做标准化。例如，一个 token 的表示为 `[10, 100, -20, 5]`，不同维度的数值范围相差很大；LayerNorm 会将它们调整到更稳定的范围。

LayerNorm 不改变形状：

$$
(B,T,n\_embd) \rightarrow (B,T,n\_embd)
$$

它的主要作用是提高训练稳定性。

### 3.2 Multi-Head Self-Attention

Self-Attention 让每个 token 从其他 token 收集信息：

```text
输入 x
  ↓
生成 Query、Key、Value
  ↓
拆分成多个 attention head
  ↓
计算 QKᵀ / √head_dim
  ↓
应用 causal mask → Softmax
  ↓
对 Value 加权求和
  ↓
拼接所有 head → 输出投影 W_O
```

#### 生成 Q、K、V

每个 token 的 hidden vector 分别经过三个线性变换：

$$
Q=xW_Q,\qquad K=xW_K,\qquad V=xW_V
$$

- Query：当前 token 想寻找什么信息；
- Key：当前 token 可以通过什么特征被找到；
- Value：当前 token 实际提供的信息。

#### 拆分多个 Head

如果 `n_embd = 12`、`n_head = 3`，那么每个 head 的维度为：

$$
head\_dim=\frac{12}{3}=4
$$

Q、K、V 都会被拆为三个 head，每个 head 可以学习不同的 attention 模式。

#### 计算 Attention Score

每个 head 使用 scaled dot-product attention：

$$
\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\left(\frac{QK^T}{\sqrt{head\_dim}}\right)V
$$

例如，在 `The cat sat` 中处理 `sat` 时，某个 head 可能给出：

```text
The → 0.1
cat → 0.7
sat → 0.2
```

这表示该 head 此时更关注 `cat`。

#### Causal Mask

语言模型在预测下一个 token 时不能偷看未来，因此要使用 causal mask：

```text
         位置 1  位置 2  位置 3
位置 1      ✓       ✗       ✗
位置 2      ✓       ✓       ✗
位置 3      ✓       ✓       ✓
```

第一个位置只能看自己；第二个位置能看第一、第二个位置；以此类推。

#### 对 Value 加权求和

对当前位置 $i$，一个 head 的输出为：

$$
h_i^{(1)}=\alpha_{i,1}^{(1)}v_1^{(1)}+\alpha_{i,2}^{(1)}v_2^{(1)}+\cdots+\alpha_{i,i}^{(1)}v_i^{(1)}
$$

也就是将每个可见位置提供的信息，按照当前位置对它的关注程度加权求和。

#### 拼接所有 Head

每个 head 得到一个 `head_dim` 维向量。把所有 head 拼起来：

$$
h_i=\operatorname{Concat}(h_i^{(1)},h_i^{(2)},\ldots,h_i^{(H)})
$$

因为 `n_head × head_dim = n_embd`，拼接后的向量仍是 `n_embd` 维。随后再经过输出投影：

$$
a_i=h_iW_O
$$

这个线性层会重新混合不同 head 的信息，形状仍保持 `n_embd → n_embd`。

### 3.3 第一个 Residual Connection

Attention 输出与 block 的原输入相加：

$$
x'=x+\operatorname{Attention}(\operatorname{LayerNorm}(x))
$$

也就是保留原有 token 信息，同时加入从上下文收集到的新信息。Residual connection 还能让深层网络更容易训练，使梯度更顺畅地向前传播。

### 3.4 Feed-Forward Network

Attention 负责让不同 token 交换信息，FFN 则独立处理每个 token 自己的 hidden vector：

```text
n_embd → Linear → 4 × n_embd → GELU → Linear → n_embd
```

公式为：

$$
\operatorname{FFN}(x)=W_2\operatorname{GELU}(W_1x)
$$

若 `n_embd = 128`，`dim_feedforward = 512`，维度变化就是 `128 → 512 → 128`。不同 position 会独立经过同一个 FFN，FFN 本身不会在 position 之间传递信息。

### 3.5 第二个 Residual Connection

FFN 的输出也会加回输入：

$$
y=x'+\operatorname{FFN}(\operatorname{LayerNorm}(x'))
$$

这就是一个 Transformer block 的最终输出。多个 block 堆叠后，每个 token 会逐层获得更丰富、更抽象的上下文表示。

## 4. Final LayerNorm

所有 Transformer blocks 结束后，再进行一次 LayerNorm：

```python
hidden = self.final_norm(hidden)
```

它使最终的 hidden representation 更稳定，形状仍然是 $(B,T,n\_embd)$。

## 5. LM Head

最后，将 hidden vector 投影到整个词表：

```python
logits = self.lm_head(hidden)
```

维度从 `n_embd` 变为 `vocab_size`，所以 logits 的形状是 $(B,T,vocab\_size)$。例如：

```text
batch_size = 4
sequence_length = 128
vocab_size = 8192
```

输出形状就是 $(4,128,8192)$，即每个位置都会为 8,192 个候选 token 给出一个分数。

## 6. Cross-Entropy Loss

训练时，把 logits 与正确的下一个 token 比较：

```python
loss = F.cross_entropy(logits, targets)
```

例如：

```text
输入：The  cat
目标：cat  sat
```

模型学习在看到 `The` 时预测 `cat`，看到 `The cat` 时预测 `sat`，随后通过：

```python
loss.backward()
optimizer.step()
```

计算梯度并更新参数。

## 7. 再看 Multi-Head Attention 的矩阵含义

假设三个 token 的 hidden vector 分别为 $x_1,x_2,x_3$，通过共享的投影矩阵得到：

$$
Q_i=x_iW_Q,\qquad K_i=x_iW_K
$$

这里的 $Q_i$ 和 $K_i$ 都是向量。假如 `head_dim = 4`：

```text
Q₁ = [ 0.2, -0.5,  0.7, 0.1]
Q₂ = [ 0.6,  0.3, -0.2, 0.8]
Q₃ = [-0.1,  0.4,  0.9, 0.5]
```

把每个位置的向量按行堆叠，若 $T=3,d=4$，就有 $Q,K\in\mathbb{R}^{3\times4}$。因此：

$$
QK^T=
\begin{bmatrix}
Q_1K_1^T & Q_1K_2^T & Q_1K_3^T\\
Q_2K_1^T & Q_2K_2^T & Q_2K_3^T\\
Q_3K_1^T & Q_3K_2^T & Q_3K_3^T
\end{bmatrix}
$$

矩阵的第 $i$ 行表示位置 $i$ 的 token 对所有 token 的关注程度。例如第二行分别表示位置 2 对位置 1、位置 2 和位置 3 有多“感兴趣”。在 causal mask 下，其中对未来位置的分数会在 Softmax 前被屏蔽。

## 8. 完整的最小实现

下面是一份便于理解的单设备 GPT 训练示例。它省略了性能优化和分布式训练，只保留最基本的数据流。

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

运行示例：

```bash
python -m scripts.base_train_simple \
    --tokenizer-dir results/task1_tokenizers/tokenizer_8192 \
    --max-seq-len 128 --batch-size 4 --depth 2 \
    --n-embd 128 --n-head 4 --steps 100
```

从这份最小实现再回看 Transformer，核心就是三件事：embedding 建立初始表示，attention 在 token 之间交换信息，FFN 对每个 token 的表示做非线性变换；多层堆叠以后，再由 LM Head 将表示转换成下一个 token 的预测分数。
