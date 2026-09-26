---
title: "从 nanochat 源码读懂 GPT 预训练：模型、数据与训练循环"
date: 2026-09-26 21:00:00 +0200
slug: "nanochat-gpt-pretraining-from-source"
categories: [人工智能]
tags: [nanochat, GPT, Transformer, LLM Training, PyTorch]
mathjax: true
mathjaxEnableSingleDollar: true
---

一段 GPT 训练代码真正串起的，不只是 Transformer 的前向传播，而是一整条闭环：

```text
原始文档 → Tokenizer 与序列打包 → input/target
        → GPT 前向传播 → Cross-Entropy Loss
        → 反向传播与梯度累积 → Optimizer Step
        → 评估、采样、保存与恢复
```

本文以我的 Transformer 笔记为概念起点，再沿着 nanochat 的真实源码追踪张量如何流动、参数如何更新，以及一个可运行的预训练系统还需要补上哪些工程环节。

<!--more-->

> **源码版本说明**
>
> 本文基于 [karpathy/nanochat](https://github.com/karpathy/nanochat) commit [`92d63d4e8bb4df75c3b71618f31ddde2378b2bcd`](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd)（提交时间：2026-07-03，提交信息：`clean up fragile code`）。重点参考固定版本的 [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py)、[`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py) 和 [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py)。nanochat 更新很快，阅读其他版本时应以对应 commit 为准。

## 1. 先建立全局视图：三个核心文件

阅读 `base_train.py` 时最容易犯的错误，是把所有逻辑都归到“训练循环”。实际上它更像一个编排器：

| 文件 | 主要职责 | 核心输出 |
|---|---|---|
| `dataloader.py` | 读取文档、分词、打包并构造 next-token 监督信号 | `x, y: (B, T)` |
| `gpt.py` | Embedding、Attention、MLP、LM Head 与 loss | 标量 loss 或 `(B,T,V)` logits |
| `base_train.py` | 初始化、分布式训练、调度、评估和 checkpoint | 更新后的模型状态 |

把它们连起来，最小训练过程可以抽象为：

```python
x, y = next(train_loader)       # (B, T), (B, T)
loss = model(x, y)              # scalar
(loss / grad_accum).backward()
optimizer.step()
optimizer.zero_grad(set_to_none=True)
```

真正的源码在这四行周围加入了多 GPU、混合精度、预取、动态超参数、评估、采样以及断点恢复。

## 2. 数据如何变成训练目标

### 2.1 语言模型的监督信号来自“右移一位”

数据加载器为每一行准备 $T+1$ 个 token，再构造：

$$
x = tokens[:, :-1], \qquad y = tokens[:, 1:]
$$

例如：

```text
完整序列: <BOS>  I  like  AI  .
x:       <BOS>  I  like  AI
y:          I  like  AI   .
```

因此 `x` 和 `y` 的形状都是 $(B,T)$。位置 $t$ 的输入负责预测位置 $t+1$ 的 token，这就是 next-token prediction。

### 2.2 BOS-aligned Best-Fit Packing

nanochat 没有简单地把所有文档首尾相接。它维护一个文档缓冲区，在每一行中反复挑选“能完整放入剩余空间的最长文档”；实在放不下时，再裁剪一个文档填满空间。这样做有三个结果：

- 每行都从 BOS token 开始；
- batch 没有 padding，计算利用率为 100%；
- 为了严格填满窗口，会牺牲一部分被裁剪的 token。

数据状态还记录 `parquet index / row group index / epoch`。checkpoint 不只保存模型和优化器，也保存数据读取位置，否则恢复训练后可能重复或跳过大量数据。

## 3. 一个参数 `depth` 如何决定模型尺寸

`base_train.py` 的设计目标之一，是让模型深度成为主要的复杂度旋钮。模型宽度首先由

$$
C_{base}=depth \times aspect\_ratio
$$

得到，再向上取整到 `head_dim` 的整数倍：

$$
C=\left\lceil\frac{C_{base}}{head\_dim}\right\rceil head\_dim,
\qquad H=\frac{C}{head\_dim}
$$

默认 `aspect_ratio=64`、`head_dim=128`。这样 Attention 的每个 head 都能得到整齐的维度，也更符合 Flash Attention 的硬件要求。

模型采用三阶段初始化：

1. 在 `meta` device 上创建只有形状、没有真实存储的模型；
2. 使用 `to_empty(device=...)` 在目标设备分配存储；
3. 统一调用 `init_weights()` 初始化参数。

这避免了先在 CPU 创建完整参数、再复制到 GPU 的额外峰值内存。若从 checkpoint 恢复，初始化后的参数会被已保存权重覆盖。

## 4. nanochat 不是“最朴素”的 Transformer

我的原始笔记使用了经典教学结构：Token Embedding + learned Position Embedding、LayerNorm、GELU FFN。nanochat 保留 GPT 的主干，但采用了更现代、也更实验性的组合。

| 教学版 GPT | 此版本 nanochat |
|---|---|
| Learned Position Embedding | RoPE，只作用于 Q、K |
| LayerNorm | 无可学习参数的 RMSNorm |
| GELU | ReLU² |
| 所有层全局 Attention | `SSSL` 滑动窗口模式，最后一层强制全局 |
| Token Embedding 与 LM Head 可共享 | 两者不共享权重 |
| 标准 residual | 额外包含 x0 blending、residual scaling 与 backout |

所以，理解基础原理时可以沿用原笔记；逐行对照源码时，则必须尊重当前实现，而不能把 `Position Embedding` 或 `LayerNorm` 强行映射到不存在的模块上。

## 5. 前向传播：沿张量形状走一遍

设：

- $B$：batch size；
- $T$：序列长度；
- $C$：模型维度 `n_embd`；
- $H$：query head 数；
- $H_{kv}$：key/value head 数；
- $D=C/H$：每个 head 的维度；
- $V$：词表大小。

### 5.1 Token Embedding 与 Smear

输入 token ID 的形状为 $(B,T)$。Embedding lookup 后：

$$
(B,T) \rightarrow (B,T,C)
$$

nanochat 随后先做 RMSNorm，再使用 `Smear` 将前一个 token 的 embedding 经过门控后混入当前位置。这可以被理解为一种很便宜的 bigram 通道：Attention 尚未开始，当前位置已经得到一点前序信息。

### 5.2 Attention

每层先将 residual stream 投影成：

$$
Q:(B,T,H,D),\qquad K,V:(B,T,H_{kv},D)
$$

`gpt.py` 支持 Grouped-Query Attention，因此 $H_{kv}$ 可以小于 $H$；但当前 `base_train.py` 建模时令 `n_kv_head = n_head`，实际训练配置仍是普通 Multi-Head Attention。

接下来依次发生：

1. 可选的 Value Embedding 通过输入相关 gate 混入 $V$；
2. RoPE 旋转 $Q$ 和 $K$，编码相对位置；
3. 对 $Q$、$K$ 做 QK Norm；
4. 使用 Flash Attention 3，不能使用时退回 PyTorch SDPA；
5. 合并 heads 并通过输出投影回到 $(B,T,C)$。

Attention 仍然是 causal 的：位置 $t$ 只能读取不晚于自己的 token。`window_pattern="SSSL"` 则进一步限制部分层只关注最近窗口，以降低长序列开销；最后一层始终使用完整上下文。

### 5.3 Block 与 MLP

一个 block 的主结构仍然是 pre-norm residual：

$$
x \leftarrow x + Attention(RMSNorm(x))
$$

$$
x \leftarrow x + MLP(RMSNorm(x))
$$

MLP 的宽度变化为：

$$
C \rightarrow 4C \rightarrow C
$$

激活函数不是 GELU，而是：

$$
ReLU^2(z)=\max(0,z)^2
$$

在进入每层前，nanochat 还会缩放当前 residual，并重新混入初始 embedding $x_0$。这些标量是可学习参数，应把它们看成 nanochat 的实验设计，而不是所有 GPT 都必须具备的组件。

### 5.4 LM Head、logit soft-cap 与 loss

最后一次 RMSNorm 后，LM Head 产生：

$$
(B,T,C) \rightarrow (B,T,V_{padded})
$$

词表会为硬件效率补齐到 64 的倍数，随后 logits 再裁剪回真实词表 $V$。计算 loss 前转成 FP32，并使用平滑 soft-cap：

$$
logits \leftarrow 15\tanh(logits/15)
$$

最后将 logits 展平为 $(BT,V)$、targets 展平为 $(BT)$，计算 cross entropy。训练模式返回一个标量 loss；没有 targets 时则直接返回 logits 用于推理。

## 6. 一次 optimizer step 为什么可能包含多个 forward/backward

`total_batch_size` 在这里以 token 数表示，而不是“样本条数”。每个 rank 一次前后向处理的 token 数为：

$$
B_{device}\times T
$$

如果有 $W$ 个 DDP rank，那么：

$$
tokens_{micro}=B_{device}\times T\times W
$$

梯度累积次数为：

$$
N_{accum}=\frac{total\_batch\_size}{tokens_{micro}}
$$

每个 micro-step 的 loss 都要除以 $N_{accum}$，因为 `.backward()` 默认累加梯度。如果漏掉这一步，梯度会随累积次数成比例放大。

训练循环还有一个容易忽略的性能细节：完成当前 batch 的 backward 后立即请求下一个 batch，使 CPU 分词和 Host-to-Device copy 尽量与 GPU 工作重叠。

## 7. 为什么同时使用 Muon 与 AdamW

nanochat 将参数按性质分组：

- Transformer 的二维矩阵参数使用 Muon；
- token/value embeddings、LM Head 和各种标量使用 AdamW；
- 不同参数组拥有不同 learning rate、betas 和 weight decay。

因此 `optimizer.step()` 表面上只有一行，背后却不是“所有参数使用同一种更新规则”。此外，learning rate、Muon momentum 和 Muon weight decay 都会随 step 更新：

- learning rate：线性 warmup → 恒定 → 线性 warmdown；
- Muon momentum：先升高，训练末期再下降；
- Muon weight decay：余弦衰减到 0。

## 8. Scaling Laws 如何进入训练脚本

如果用户没有直接指定训练步数，nanochat 会根据 scaling parameters 和目标 data/parameter ratio 估算目标 token 数：

$$
D=ratio\times N_{scaling}
$$

随后用经验关系估计总 batch size，并据此修正 learning rate 与 weight decay。这里要区分两类结论：

- “训练 token 数应随模型规模变化”是 scaling law 的整体思想；
- 具体指数、参考 batch 以及把 AdamW 的推导迁移到 Muon，是该版本实现里的经验选择，源码注释也明确承认其中存在假设。

阅读研究型代码时，这种区分非常重要：**代码能运行，不等于每个超参数公式都是普适定律。**

## 9. 评估、采样与 checkpoint 不是附属功能

完整训练系统必须回答三个问题：模型是否在变好、是否还能生成、训练中断后能否继续。

nanochat 因此周期性执行：

- validation bits-per-byte（比依赖词表大小的 token loss 更适合跨 tokenizer 比较）；
- CORE benchmark；
- 固定 prompt 的 greedy sampling；
- checkpoint 保存。

checkpoint 包括模型、优化器、模型配置、命令行配置、数据加载位置、step、最佳验证指标、平滑 loss 和累计训练时间。恢复训练的本质不是“加载一份权重”，而是恢复一个完整状态机。

## 10. 把概念笔记映射回真实源码

最终可以把整条数据流压缩为：

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

我的原始 Transformer 笔记回答的是“一个 GPT block 为什么成立”；nanochat 则进一步展示了“怎样把它变成一个可训练、可扩展、可恢复、可评估的系统”。二者结合起来，才是从架构理解走向训练工程的完整路径。

## 参考源码

- [nanochat repository（固定 commit）](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd)
- [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py)
- [`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py)
- [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py)
- [原始 Notion 笔记：Transformer Architecture](https://app.notion.com/p/Transformer-Architecture-3dbf1cbefb538081b41ce7d64f6b4871)
