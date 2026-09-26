---
title: "nanochat 源码解读：从参数配置到单步训练"
date: 2026-09-26 21:00:00 +0200
slug: "nanochat-gpt-pretraining-from-source"
categories: [人工智能]
tags: [nanochat, GPT, Transformer, LLM Training, PyTorch]
mathjax: true
mathjaxEnableSingleDollar: true
---

本文沿着 `scripts/base_train.py` 的执行顺序阅读 nanochat：从命令行参数、随机种子和 DDP 环境开始，依次进入模型构建、权重初始化、Scaling Laws、优化器、DataLoader、梯度累积与单步训练。重点不是抽象介绍 GPT，而是理解源码中的每一段配置如何落到真实训练过程里。

<!--more-->

> **源码版本说明**
>
> 本文基于 [karpathy/nanochat](https://github.com/karpathy/nanochat) commit [`92d63d4e8bb4df75c3b71618f31ddde2378b2bcd`](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd)（2026-07-03，`clean up fragile code`）。主要阅读固定版本的 [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py)、[`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py) 和 [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py)。源码更新很快，阅读其他版本时请以对应 commit 为准。

## 0. 默认参数：先看训练脚本暴露了什么

`base_train.py` 暴露的参数很多。阅读训练主线时不必一开始记住全部参数，先保留会直接影响模型规模、训练 token 数、batch 和优化过程的核心项：

```python
# Model architecture
parser.add_argument("--depth", type=int, default=20, help="depth of the Transformer model")
parser.add_argument("--aspect-ratio", type=int, default=64, help="model_dim = depth * aspect_ratio")
parser.add_argument("--head-dim", type=int, default=128, help="target head dimension for attention")
parser.add_argument("--max-seq-len", type=int, default=2048, help="max context length")
parser.add_argument("--window-pattern", type=str, default="SSSL", help="sliding window pattern tiled across layers: L=full, S=half context (e.g. 'SSL')")
# Training horizon (only one used, in order of precedence)
parser.add_argument("--num-iterations", type=int, default=-1, help="explicit number of optimization steps (-1 = disable)")
parser.add_argument("--target-flops", type=float, default=-1.0, help="calculate num_iterations to reach target_flops (-1 = disable)")
parser.add_argument("--target-param-data-ratio", type=float, default=12, help="calculate num_iterations to maintain data:param ratio (Chinchilla=20, -1 = disable)")
# Optimization
parser.add_argument("--device-batch-size", type=int, default=32, help="per-device batch size. good number to reduce to 16,8,4,... if you OOM on VRAM.")
parser.add_argument("--total-batch-size", type=int, default=-1, help="total batch size in tokens. decent numbers are e.g. 524288. (-1 = auto-compute optimal)")
parser.add_argument("--embedding-lr", type=float, default=0.3, help="learning rate for embedding parameters (Adam)")
parser.add_argument("--unembedding-lr", type=float, default=0.008, help="learning rate for unembedding parameters (Adam)")
parser.add_argument("--weight-decay", type=float, default=0.28, help="cautious weight decay for the Muon optimizer (for weights)")
parser.add_argument("--matrix-lr", type=float, default=0.02, help="learning rate for matrix parameters (Muon)")
parser.add_argument("--scalar-lr", type=float, default=0.5, help="learning rate for scalars (resid_lambdas, x0_lambdas)")
parser.add_argument("--warmup-steps", type=int, default=40, help="number of steps for LR warmup")
parser.add_argument("--warmdown-ratio", type=float, default=0.65, help="ratio of iterations for LR warmdown")
parser.add_argument("--final-lr-frac", type=float, default=0.05, help="final LR as fraction of initial LR")
parser.add_argument("--resume-from-step", type=int, default=-1, help="resume training from this step (-1 = disable)")
```

这里有两个容易混淆的 batch 概念：`device_batch_size` 是单个 rank 一次前向处理的序列数；`total_batch_size` 以 token 数计量，表示所有 GPU 和梯度累积 micro-step 合起来的一次参数更新规模。

## 1. Seed：可复现从哪里开始

```python
torch.manual_seed(42)
if device_type == "cuda":
    torch.cuda.manual_seed(42)
```

伪随机数生成器本质上是确定性的状态机，可以用简化的线性同余模型理解：

$$
x\_{n+1}=(a x\_n+c)\bmod m
$$

seed 设置初始状态 $x\_0$。相同 seed、算法和调用顺序会产生相同序列；但完整复现还取决于硬件、CUDA 算子和分布式执行顺序。

## 2. Distributed Data Parallel

DDP 可以类比高性能计算中的 MPI：`torchrun` 启动多个独立 Python 进程，并为每个进程设置 `RANK`、`LOCAL_RANK`、`WORLD_SIZE`。通常一张 GPU 对应一个进程。

```bash
torchrun --standalone --nproc_per_node=2 scripts/base_train.py
```

两个进程通常分别得到 `LOCAL_RANK=0` 和 `LOCAL_RANK=1`：

```python
device = torch.device("cuda", ddp_local_rank)
torch.cuda.set_device(device)

dist.init_process_group(backend="nccl", device_id=device)
dist.barrier()
```

- `backend="nccl"` 使用适合 CUDA GPU 间通信的 NCCL；
- `device_id=device` 指定当前进程负责的 GPU；
- `dist.barrier()` 让所有 rank 等齐后再继续。

### 为什么计时前后需要 synchronize

GPU 运算通常异步执行。如果 CPU 提交 kernel 后立刻调用 `time.time()`，测到的可能只是提交任务的时间：

```python
synchronize()
t0 = time.time()

# forward、backward、optimizer 等 GPU 运算

synchronize()
t1 = time.time()
```

第一次同步排除之前的 GPU 工作，第二次确保本步真正结束。同步会阻塞 CPU，因此只应放在需要准确计时的边界。

## 3. W&B：只让主进程记录实验

```python
use_dummy_wandb = args.run == "dummy" or not master_process
wandb_run = (
    DummyWandb()
    if use_dummy_wandb
    else wandb.init(project="nanochat", name=args.run, config=user_config)
)
```

W&B（Weights & Biases）用于记录训练配置和指标。`wandb.init()` 创建 run，`log()` 记录 loss、吞吐量等指标，`finish()` 标记结束。`--run=dummy` 不上传记录；分布式训练中非主进程也使用 dummy 实现，避免重复记录。

## 4. `build_model_meta`：从 depth 推导模型尺寸

nanochat 以 `depth` 为核心规模参数，再结合 `aspect_ratio` 和 `head_dim` 推导宽度与 head 数：

```python
base_dim = depth * args.aspect_ratio
model_dim = ((base_dim + args.head_dim - 1) // args.head_dim) * args.head_dim
num_heads = model_dim // args.head_dim
```

`model_dim` 被向上取整为 `head_dim` 的倍数。以 `depth=2`、`aspect_ratio=64`、`head_dim=128` 为例：

```text
n_layer = 2
n_embd = 128
n_head = 1
n_kv_head = 1
head_dim = 128
```

- `sequence_len`：单次输入的最大 token 数，默认 2048；
- `vocab_size`：tokenizer 的 token ID 数量，决定 embedding 和输出层尺寸；
- `window_pattern`：`L` 表示完整上下文，`S` 表示局部窗口；`SSSL` 循环应用，但最后一层强制使用完整上下文。

Q、K、V 的线性层定义在 `gpt.py`：

```python
self.c_q = Linear(self.n_embd, self.n_head * self.head_dim, bias=False)
self.c_k = Linear(self.n_embd, self.n_kv_head * self.head_dim, bias=False)
self.c_v = Linear(self.n_embd, self.n_kv_head * self.head_dim, bias=False)
```

对 depth-2 模型而言，相当于：

```python
self.c_q = nn.Linear(128, 128, bias=False)
self.c_k = nn.Linear(128, 128, bias=False)
self.c_v = nn.Linear(128, 128, bias=False)
```

## 5. GPT 初始化与前向数据流

### 5.1 Meta device → 分配存储 → 初始化权重

```python
model = build_model_meta()          # with torch.device("meta")
model.to_empty(device=device)       # allocate uninitialized storage
model.init_weights()                # initialize every tensor
```

`build_model_meta()` 只建立参数形状；`to_empty()` 直接在目标设备分配未初始化空间；`init_weights()` 初始化权重及 RoPE 的 cos/sin buffers。这样避免先在 CPU 建立完整模型再复制到 GPU 的额外峰值内存。

### 5.2 Embedding、Blocks 与 LM Head

词表会补齐到 64 的倍数，使矩阵尺寸更适合 GPU：

```python
padded_vocab_size = (
    (config.vocab_size + pad_vocab_size_to - 1) // pad_vocab_size_to
) * pad_vocab_size_to

self.transformer = nn.ModuleDict({
    "wte": nn.Embedding(padded_vocab_size, config.n_embd),
    "h": nn.ModuleList([
        Block(config, layer_idx) for layer_idx in range(config.n_layer)
    ]),
})
self.lm_head = Linear(config.n_embd, padded_vocab_size, bias=False)
```

```text
最后隐藏状态: [B, T, n_embd]
lm_head 输出: [B, T, padded_vocab_size]
裁掉 padding: [B, T, vocab_size]
```

```python
logits = self.lm_head(x)
logits = logits[..., :self.config.vocab_size]
```

### 5.3 沿张量形状走一遍

| 记号 | 含义 |
|---|---|
| $B$ | batch size |
| $T$ | 每条序列的 token 数 |
| $d$ | `n_embd`，隐藏维度 |
| $H$ | Query head 数 |
| $H\_{kv}$ | Key/Value head 数 |
| $D=d/H$ | 每个 head 的维度 |
| $V, V\_p$ | 原始词表、补齐词表大小 |

```text
idx [B, T]
  → wte lookup
x   [B, T, d]
```

RMSNorm 和 smear 不改变主张量形状。进入 block 后：

| 投影 | 线性层权重形状 | 输出形状 |
|---|---:|---:|
| Q | `[H×D, d]` | `[B, T, H, D]` |
| K | `[Hkv×D, d]` | `[B, T, Hkv, D]` |
| V | `[Hkv×D, d]` | `[B, T, Hkv, D]` |

```python
q = self.c_q(x).view(B, T, self.n_head, self.head_dim)
k = self.c_k(x).view(B, T, self.n_kv_head, self.head_dim)
v = self.c_v(x).view(B, T, self.n_kv_head, self.head_dim)
```

```text
[B, T, H, D] → [B, T, H×D] = [B, T, d]
```

因果遮罩、RoPE 和滑动窗口改变可关注的位置，但不改变主张量形状。MLP 的形状变化为：

```text
[B, T, d]
  → c_fc，权重 [4d, d]
[B, T, 4d]
  → ReLU²
[B, T, 4d]
  → c_proj，权重 [d, 4d]
[B, T, d]
```

残差连接要求加法两边形状一致，所以 block 输入输出均为 `[B,T,d]`。

### 5.4 Value Embedding

启用 value embedding 的层拥有 `[Vp, Hkv×D]` 的额外查找表：

```text
idx [B, T] → value embedding [B, T, Hkv×D]
```

reshape 后为 `[B,T,Hkv,D]`，再与普通 V 混合；门控张量 `[B,T,Hkv,1]` 控制注入量。

### 5.5 输出 logits 与 loss

```text
[B, T, d]
  → lm_head
[B, T, Vp]
  → 裁掉 padding
[B, T, V]
```

训练时 logits 展平为 `[B×T,V]`，目标 token 展平为 `[B×T]`，再计算交叉熵。以 `d=128, H=1, Hkv=1` 为例：

```text
idx         [B, T]
wte         [B, T, 128]
Q/K/V       [B, T, 1, 128]
attention   [B, T, 1, 128] → [B, T, 128]
MLP         [B, T, 128] → [B, T, 512] → [B, T, 128]
lm_head     [B, T, 128] → [B, T, vocab_size]
```

### 5.6 `init_weights`

```text
wte:                 normal, std=1.0
lm_head:             normal, std=0.001
for each block:
    attn.c_q/k/v:    uniform, std≈1/sqrt(n_embd)
    attn.c_proj:     zeros
    mlp.c_fc:        smaller uniform
    mlp.c_proj:      zeros
```

```python
n_embd = self.config.n_embd
s = 3**0.5 * n_embd**-0.5

for block in self.transformer.h:
    torch.nn.init.uniform_(block.attn.c_q.weight, -s, s)
    torch.nn.init.uniform_(block.attn.c_k.weight, -s, s)
    torch.nn.init.uniform_(block.attn.c_v.weight, -s, s)
```

均匀分布 $U(-s,s)$ 的标准差是 $s/\sqrt{3}=1/\sqrt{n\_{embd}}$。Attention 和 MLP 输出投影从零开始：

```python
for block in self.transformer.h:
    torch.nn.init.zeros_(block.attn.c_proj.weight)
    torch.nn.init.uniform_(block.mlp.c_fc.weight, -s * 0.4, s * 0.4)
    torch.nn.init.zeros_(block.mlp.c_proj.weight)
```

所以初始时两个子层近似恒等残差路径：

```text
x + attention_output = x + 0 = x
x + mlp_output       = x + 0 = x
```

## 6. 决定训练时长、batch、学习率与权重衰减

### 6.1 用参数量估计 token horizon

```python
param_counts = model.num_scaling_params()
num_params = param_counts["total"]
num_flops_per_token = model.estimate_flops()

num_scaling_params = (
    param_counts["transformer_matrices"] + param_counts["lm_head"]
)
target_tokens = int(args.target_param_data_ratio * num_scaling_params)
```

默认 ratio 为 12，所以目标 token 数约为 scaling parameters 的 12 倍。

### 6.2 估计总 batch size

nanochat 参考 [Power Lines](https://arxiv.org/abs/2505.13738) 的经验关系 $B\_{opt}\propto D^{0.383}$：

$$
B\_{pred}=B\_{REF}\left(\frac{D}{D\_{REF}}\right)^{0.383}
$$

```python
batch_size_ratio = target_tokens / D_REF
B_REF = 2**19  # 524,288 tokens
predicted_batch_size = B_REF * batch_size_ratio ** 0.383
total_batch_size = 2 ** round(math.log2(predicted_batch_size))
```

最后取最近的 2 的幂。指数与参考点都是经验选择，不是对所有模型都严格最优的定律。

### 6.3 根据 batch 缩放学习率

```python
batch_lr_scale = 1.0
batch_ratio = total_batch_size / B_REF
if batch_ratio != 1.0:
    # AdamW: η ∝ √(B/B_ref)
    # Muon: use the same scaling as an assumption
    batch_lr_scale = batch_ratio ** 0.5
```

$$
batch\_lr\_scale=\sqrt{\frac{B}{B_{REF}}}
$$

```text
batch_ratio = 131072 / 524288 = 0.25
batch_lr_scale = sqrt(0.25) = 0.5
```

### 6.4 缩放 weight decay

脚本采用 [T_epoch](https://arxiv.org/abs/2405.13698) 框架：

```python
weight_decay_scaled = (
    args.weight_decay
    * math.sqrt(total_batch_size / B_REF)
    * (D_REF / target_tokens)
)
```

$$
\lambda\_{scaled}=\lambda\_{ref}\sqrt{\frac{B}{B\_{REF}}}\frac{D\_{REF}}{D}
$$

第一项匹配 batch/learning-rate 缩放，第二项补偿训练 token horizon。

## 7. 初始化 Optimizer

```python
optimizer = model.setup_optimizer(
    unembedding_lr=args.unembedding_lr * batch_lr_scale,
    embedding_lr=args.embedding_lr * batch_lr_scale,
    scalar_lr=args.scalar_lr * batch_lr_scale,
    matrix_lr=args.matrix_lr * batch_lr_scale,
    weight_decay=weight_decay_scaled,
)
```

| 参数 | 作用对象 | 含义 |
|---|---|---|
| `unembedding_lr` | `lm_head` | hidden state 到词表 logits 的输出层学习率 |
| `embedding_lr` | `wte`、value embeddings | 输入 embedding 学习率；value embedding 额外乘 0.5 |
| `scalar_lr` | 部分可学习标量 | `resid_lambdas`、`x0_lambdas` 等 |
| `matrix_lr` | Transformer 二维矩阵 | Muon 的基础学习率 |
| `weight_decay` | Muon 矩阵参数 | 已按 batch 和 token horizon 缩放的衰减强度 |

一个 `optimizer.step()` 背后同时包含 AdamW 与 Muon 参数组，并非所有权重共享同一种更新规则。

## 8. 初始化训练与验证 DataLoader

```python
train_loader = tokenizing_distributed_data_loader_with_state_bos_bestfit(
    tokenizer,
    args.device_batch_size,
    args.max_seq_len,
    split="train",
    device=device,
    resume_state_dict=dataloader_resume_state_dict,
)
```

- `tokenizer`：将文档转换为 token；
- `device_batch_size`：当前 rank 一次生成多少条序列；
- `max_seq_len`：每条序列的长度；
- `split="train"`：读取训练分片；
- `device`：输出张量所在设备；
- `resume_state_dict`：从 checkpoint 恢复数据进度。

`bos_bestfit` 会尽量用完整文档填满每一行并保持 BOS 对齐。加载器产出 `(x, y, state)`：

```python
x = tokens[:, :-1]  # [B, T]
y = tokens[:, 1:]   # [B, T]
```

`y` 是 `x` 右移一位后的 next-token 目标；`state` 写入 checkpoint，供中断恢复。

## 9. 计算 `grad_accum_steps`

```python
tokens_per_fwdbwd = args.device_batch_size * args.max_seq_len
world_tokens_per_fwdbwd = tokens_per_fwdbwd * ddp_world_size
grad_accum_steps = total_batch_size // world_tokens_per_fwdbwd
```

例如单 rank batch 为 2、序列长度 1024、共有 4 个 rank，则一次全局 micro-step 处理：

$$
2\times1024\times4=8192\text{ tokens}
$$

若 `total_batch_size=65536`，则 `grad_accum_steps=8`，累积 8 次 forward/backward 后才更新一次参数。

## 10. 单步训练

```python
for micro_step in range(grad_accum_steps):
    loss = model(x, y)
    loss = loss / grad_accum_steps
    loss.backward()
    x, y, dataloader_state_dict = next(train_loader)

lrm = get_lr_multiplier(step)
muon_momentum = get_muon_momentum(step)
muon_weight_decay = get_weight_decay(step)
for group in optimizer.param_groups:
    group["lr"] = group["initial_lr"] * lrm
    if group["kind"] == "muon":
        group["momentum"] = muon_momentum
        group["weight_decay"] = muon_weight_decay

optimizer.step()
model.zero_grad(set_to_none=True)
```

### 10.1 梯度累积

`.backward()` 将梯度加到已有 `.grad`。先除以 `grad_accum_steps`，使最终梯度等价于各 micro-batch 梯度的平均值：

```python
for micro_step in range(grad_accum_steps):
    loss = model(x, y) / grad_accum_steps
    loss.backward()

optimizer.step()
model.zero_grad(set_to_none=True)
```

`set_to_none=True` 通常比逐元素清零更省内存。backward 后立刻调用下一次 `next(train_loader)`，还能让 CPU 分词、数据搬运尽量与 GPU 工作重叠，并同步保存最新的数据加载状态。

### 10.2 Learning-rate schedule

```python
def get_lr_multiplier(it):
    warmup_iters = args.warmup_steps
    warmdown_iters = round(args.warmdown_ratio * num_iterations)
    if it < warmup_iters:
        return (it + 1) / warmup_iters
    elif it <= num_iterations - warmdown_iters:
        return 1.0
    else:
        progress = (num_iterations - it) / warmdown_iters
        return progress + (1 - progress) * args.final_lr_frac
```

它分为线性 warmup、恒定学习率、线性 warmdown 三段，末尾降到 `final_lr_frac`，默认是基础学习率的 5%。

### 10.3 Muon momentum 与 weight decay

```python
def get_muon_momentum(it):
    warmdown_iters = round(args.warmdown_ratio * num_iterations)
    warmdown_start = num_iterations - warmdown_iters
    if it < 400:
        frac = it / 400
        return (1 - frac) * 0.85 + frac * 0.97
    elif it >= warmdown_start:
        progress = (it - warmdown_start) / warmdown_iters
        return 0.97 * (1 - progress) + 0.90 * progress
    else:
        return 0.97

def get_weight_decay(it):
    return weight_decay_scaled * 0.5 * (
        1 + math.cos(math.pi * it / num_iterations)
    )
```

Muon momentum 前 400 步从 0.85 升到 0.97，warmdown 时降到 0.90；weight decay 按余弦曲线降到 0：

$$
wd(it)=wd\_{scaled}\frac{1+\cos(\pi\,it/N)}{2}
$$

这两项只作用于 `kind == "muon"` 的参数组。

## 11. nanochat 与标准简易 Transformer 有什么不同

nanochat 仍然遵循 decoder-only Transformer 的核心路径：token embedding、causal self-attention、MLP、残差连接、LM Head 和 next-token loss。但它不是教学代码的直接放大版，而是加入了许多面向现代训练和 GPU 效率的设计。

| 维度 | 标准简易 Transformer | 本文版本的 nanochat |
|---|---|---|
| 位置编码 | 常见实现使用可学习 Position Embedding | 使用 RoPE，直接作用于 Q、K |
| 归一化 | LayerNorm，通常带可学习参数 | 无可学习参数的 RMSNorm |
| MLP 激活 | GELU 或 ReLU | ReLU² |
| Attention 范围 | 每层使用完整 causal attention | `SSSL` 滑动窗口模式，最后一层强制完整上下文 |
| Q/K/V heads | 通常是标准 Multi-Head Attention | 代码支持 GQA；当前训练构造中 `n_kv_head = n_head` |
| Value 路径 | V 只来自当前 hidden state 的线性投影 | 部分层额外加入带门控的 Value Embedding |
| Embedding 交互 | token embedding 直接进入 Transformer blocks | Smear 会把前一个 token 的 embedding 混入当前位置 |
| 残差路径 | 标准 `x + sublayer(x)` | 额外包含 x0 blending、residual scaling 等设计 |
| 输出层 | 可能与 token embedding 共享权重 | `wte` 与 `lm_head` 不共享，并将词表补齐到 64 的倍数 |
| 优化器 | 常见教学实现统一使用 AdamW | Transformer 矩阵使用 Muon，其余参数分组使用 AdamW |
| 训练规模 | 手动指定 steps、batch 和学习率 | 根据参数量与经验 scaling laws 推导 token horizon、batch 和缩放系数 |
| 数据管线 | 常见实现直接切固定长度序列 | 使用 BOS-aligned best-fit packing，并保存可恢复的数据读取状态 |

因此，两类代码适合解决不同问题：标准简易 Transformer 更适合先理解 Attention、残差连接、张量形状和语言模型 loss；nanochat 更适合继续研究如何把模型变成可扩展、可恢复、面向真实硬件的预训练系统。

如果希望先从最小实现理解标准结构，可以阅读：[Transformer Architecture：从 Token Embedding 到训练循环](https://zheng-bobo.github.io/post/transformer-architecture/)。读懂其中的数据流后，再回来看 nanochat 的工程改造会更清晰。

## 总结

沿 `base_train.py` 的真实执行顺序，nanochat 的预训练链路是：

```text
解析参数
  → seed、设备与 DDP
  → 实验日志
  → 由 depth 推导并构建 GPT
  → 初始化权重
  → 用 scaling laws 推导训练规模
  → 建立 AdamW + Muon 参数组
  → 初始化可恢复 DataLoader
  → 计算梯度累积次数
  → forward / backward / schedule / optimizer step
  → 评估、采样与 checkpoint
```

这些看似零散的细节最终都服务于同一个目标：让指定规模的 GPT 在给定硬件和 token 预算下，稳定、可观测、可恢复地完成预训练。

## 参考资料

- [nanochat 固定版本源码](https://github.com/karpathy/nanochat/tree/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd)
- [`scripts/base_train.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/scripts/base_train.py)
- [`nanochat/gpt.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/gpt.py)
- [`nanochat/dataloader.py`](https://github.com/karpathy/nanochat/blob/92d63d4e8bb4df75c3b71618f31ddde2378b2bcd/nanochat/dataloader.py)
- [Power Lines](https://arxiv.org/abs/2505.13738)
- [How to Scale Your EMA](https://arxiv.org/abs/2405.13698)
