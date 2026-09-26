---
title: "大模型与 AI Agent Benchmark 全景指南：它们究竟在评估什么"
date: 2026-09-26 23:00:00 +0200
slug: "llm-agent-benchmarks-guide"
categories: [人工智能]
tags: [LLM, AI Agent, Benchmark, Evaluation, Reasoning, Coding]
mathjax: false
---

看模型发布报告时，我们经常会遇到一长串名字：Artificial Analysis Intelligence Index、LMArena、HELM、ARC-E、MMLU、GSM8K、SWE-bench、GAIA、WebArena、OSWorld……它们的分数不能直接横向比较，因为这里既有综合指数和排行榜，也有单项 benchmark；各自测量的能力、输入形式、可用工具和评分方式都不同。

本文整理一张从“大模型答题”到“Agent 完成真实任务”的评测地图，并解释每个常见 benchmark 究竟是什么、适合测什么，以及不能从分数中推出什么结论。

<!--more-->

> **先澄清两个常见误区**
>
> 1. **SWE-bench 是 benchmark，SWE-agent 不是。**SWE-bench 提供 GitHub issue、代码仓库和测试；SWE-agent 是让语言模型操作仓库、修改代码并解决 issue 的 Agent 系统。
> 2. **ARC-E / ARC-C 与 ARC-AGI 不是同一个 ARC。**前者来自 AI2 Reasoning Challenge，是科学选择题；后者使用彩色网格测试抽象规则归纳。

## 1. Benchmark 测的到底是模型，还是系统

评测对象可以分为三层：

| 层级 | 评测对象 | 典型输入 | 典型 benchmark |
|---|---|---|---|
| 模型能力 | 一次或少量文本生成 | 问题、选项、代码签名 | ARC、MMLU、GPQA、GSM8K、HumanEval |
| 工具能力 | 模型选择并调用函数/API | 工具描述、用户请求、执行反馈 | BFCL、ToolBench、τ-bench |
| Agent 系统 | 模型、prompt、memory、tools、scaffold 的整体 | 仓库、浏览器、桌面或长期任务环境 | SWE-bench、GAIA、WebArena、OSWorld、PaperBench |

因此，Agent benchmark 的分数不是“底层模型智商”。同一个模型放入不同的搜索策略、工具接口、上下文压缩和错误恢复框架，结果可能差很多。更准确的表示是：

```text
Agent 结果 = 模型能力
           + Agent scaffold
           + 工具与环境
           + 推理预算
           + 评测协议
```

## 2. 一张快速索引表

| Benchmark | 主要能力 | 任务形式 | 常见指标 |
|---|---|---|---|
| ARC-E / ARC-C | 小学科学知识与推理 | 四选一选择题 | Accuracy |
| HellaSwag | 常识与事件续写 | 选择最合理的后续 | Accuracy |
| WinoGrande | 指代消解与常识 | 二选一填空 | Accuracy |
| MMLU | 多学科知识与解题 | 57 个学科的选择题 | Macro / Average Accuracy |
| MMLU-Pro | 更难的知识推理 | 10 选 1、多步推理 | Accuracy |
| GPQA / GPQA Diamond | 高难度科学推理 | 生物、化学、物理选择题 | Accuracy |
| GSM8K | 小学数学文字题 | 多步算术，输出答案 | Exact Match |
| MATH / MATH-500 | 竞赛数学 | 自由解答 | Exact Match |
| AIME | 高难竞赛数学 | 0–999 整数答案 | Accuracy / pass@k |
| HumanEval | 函数级代码生成 | docstring + 函数签名 | pass@k |
| MBPP | 基础 Python 编程 | 自然语言题目 + tests | pass@k |
| LiveCodeBench | 更新中的代码能力 | 竞赛题、自修复、执行预测 | pass@1 等 |
| SWE-bench | 仓库级软件工程 | GitHub issue → patch | % Resolved |
| BFCL | Function Calling | 选择函数并生成参数 | AST / Executable Accuracy |
| ToolBench | API 选择与多步工具使用 | 指令 + 大量真实 API | Success / win rate |
| τ-bench | 工具、用户与政策交互 | 多轮对话 + domain APIs | pass^k / success rate |
| GAIA | 通用助手 | 搜索、文件、多模态、工具组合 | Exact Match / Accuracy |
| AgentBench | 多环境自主行动 | OS、数据库、网页等环境 | 综合 success score |
| WebArena | 网页操作 | 自托管真实网站中的任务 | Task Success Rate |
| OSWorld | 电脑使用 | 真实桌面应用与跨应用流程 | Task Success Rate |
| PaperBench | 长周期研究 Agent | 复现 AI 论文实验 | Rubric-based score |
| Artificial Analysis Intelligence Index | 多类前沿能力的综合表现 | 多项评测加权聚合 | Composite index |
| LMArena | 真实用户的主观偏好 | 匿名两两对比 | Elo-style rating |
| HELM | 多场景、多指标的透明评测 | 统一框架下运行多个场景 | 分场景指标 |
| LiveBench | 持续更新的通用能力 | 新题与客观评分任务 | 分项分数 / Average |

下面按能力类型展开。

## 3. 综合指数、评测套件与排行榜

Artificial Analysis Intelligence Index、LMArena 和 HELM 经常与 GSM8K、SWE-bench 一起出现在模型对比中，但它们并不是同一种东西：

| 类型 | 它是什么 | 典型代表 | 最适合回答的问题 |
|---|---|---|---|
| 单项 benchmark | 固定任务、数据与评分器 | GSM8K、SWE-bench | 模型或系统能否完成某类明确任务？ |
| 综合指数 | 将多项评测按规则聚合成一个数 | Artificial Analysis Intelligence Index | 总体能力大致处于什么位置？ |
| 评测套件 / 框架 | 统一运行多个场景并保留分项结果 | HELM | 在一致协议下，各维度表现如何？ |
| 人类偏好排行榜 | 用户匿名比较两个模型的回答 | LMArena | 真实用户更喜欢哪个回答？ |
| 动态 benchmark | 持续加入新题，降低题库过时与污染 | LiveBench | 模型在较新的、可客观评分的任务上如何？ |

### 3.1 Artificial Analysis Intelligence Index

[Artificial Analysis Intelligence Index](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3) 是一个**综合指数**，不是一套独立题库。Artificial Analysis 在统一评测设置下运行多项测试，再把结果标准化并加权，得到一个便于横向比较的 headline score；平台还会结合价格、输出速度和延迟等指标呈现模型的能力—成本权衡。

截至本文更新日（2026 年 9 月 26 日），其公开方法版本为 **v4.3.2**，由 10 项评测组成：AA-Briefcase v1.1、GDPval-AA v2.1、AutomationBench-AA、Terminal-Bench 4.0、SciCode、Humanity's Last Exam、GDP.pdf、CritPt、AA-Omniscience 与 AA-LCR v1.1。这组构成明显偏向 Agent、专业知识、科学编程、终端操作和长上下文等前沿能力。

这个指数适合：

- 快速获得当前主流模型的总体位置；
- 在同一平台内同时比较智能、价格、速度与延迟；
- 初筛候选模型，再进入具体业务测试。

但一个总分会隐藏能力结构。两个指数相同的模型，可能分别擅长代码 Agent 和知识推理；而且指数会随版本更换题目、权重和归一化方式，因此 **v4.1、v4.2 与 v4.3 的分数不能脱离版本直接比较**。选型时应继续查看 component scores 和失败样例。

### 3.2 LMArena：人类偏好，不是客观正确率

[LMArena](https://lmarena.ai/) 让用户在不知道模型身份的情况下比较两个回答，投票后再揭示模型，并通过成对比较形成 Elo-style 排名。它捕捉的是开放式真实提示下的**人类偏好**，尤其适合观察对话体验、表达方式和综合可用性。

它不等同于答案正确率：更流畅、更自信或更详细的回答可能更讨喜，却不一定更真实；排名也会受用户群、提示分布、模型版本与投票量影响。因此，Arena 排名应与可验证任务和私有业务集配合使用。

### 3.3 HELM：透明、可复现的评测框架

[Stanford HELM](https://crfm.stanford.edu/helm/) 更准确地说是一套评测框架和多个评测套件，而不是一个万能总分。它将模型、场景、适配方式和指标显式拆开，并公开 prompt 与逐样本结果，便于复现和审计。HELM Capabilities、HELM Instruct、Long Context、MedHELM 等 track 面向不同问题。

使用 HELM 时应写清楚具体 track、版本、场景和指标，不能只写“HELM 分数”。它的优势是透明与多维，代价是很难用一个数字概括所有结果。

### 3.4 LiveBench 与 Open LLM Leaderboard

[LiveBench](https://livebench.github.io/) 通过定期加入新题并采用可客观验证的答案，试图降低污染与评审模型偏差。查看成绩时仍需记录发布日期、题目版本和各分项，而不是只抄平均分。

[Hugging Face Open LLM Leaderboard](https://huggingface.co/docs/leaderboards/index) 曾以统一环境重跑开放模型，核心价值是可复现的横向比较。经典榜单已经退役，Hugging Face 现在提供由社区维护的不同用途榜单入口；因此旧截图中的排名和聚合分不应被当作当前结论。

综合平台最适合做“地图”，单项 benchmark 和私有评测才更适合回答具体的部署问题。

## 4. 知识、常识与文本推理

### 4.1 ARC-E 与 ARC-C：小学科学选择题

[AI2 Reasoning Challenge（ARC）](https://allenai.org/data/arc) 收集三至九年级的科学考试题，并分成两个子集：

- **ARC-Easy（ARC-E）**：相对容易，很多题可通过基础事实或直接推理回答；
- **ARC-Challenge（ARC-C）**：由检索和词共现基线都较难回答的问题组成，更强调知识组合与推理。

示意题：

```text
哪一种变化属于物理变化？
A. 木头燃烧  B. 铁生锈  C. 冰融化  D. 牛奶变酸
```

主要测量：科学知识、阅读理解、选项比较和短链推理。常用指标是 accuracy。

局限：选择题允许排除法和猜测；题目难度较低时容易饱和，也不能证明模型会做开放式科学研究。

### 4.2 HellaSwag：哪个后续事件最合理

[HellaSwag](https://arxiv.org/abs/1905.07830) 给出一个场景或动作描述，要求从四个候选结尾中选择最符合常识的后续。它更关注日常事件的顺序、动作可行性和语境一致性，而不是专业知识。

主要测量：常识推理、事件预测、语言连贯性。指标通常是 normalized accuracy。

局限：仍然是候选排序任务；模型可能利用数据风格或选项统计线索，而不是真的构造世界模型。

### 4.3 WinoGrande：常识驱动的指代消解

[WinoGrande](https://arxiv.org/abs/1907.10641) 延续 Winograd Schema 的思路，要求模型判断代词或空缺指向哪个实体。

```text
奖杯放不进棕色手提箱，因为它太大了。
“它”更可能指奖杯还是手提箱？
```

主要测量：语法理解、实体关系和常识。局限在于二选一任务容易受模板与数据偏差影响。

### 4.4 MMLU 与 MMLU-Pro：多学科知识地图

[MMLU](https://arxiv.org/abs/2009.03300) 用来自 57 个学科的选择题评估多任务知识与问题求解，覆盖数学、历史、计算机、法律、医学、哲学等领域。

它回答的是：模型的知识覆盖是否广，以及能否在不同学科格式间切换。它不直接测量检索、工具使用或长周期任务执行。

[MMLU-Pro](https://arxiv.org/abs/2406.01574) 将选项从 4 个扩展到 10 个，加入更多需要推理的问题，并降低简单猜测和模板记忆带来的收益。比较报告时必须确认写的是 MMLU 还是 MMLU-Pro，两者分数不能直接等价。

### 4.5 GPQA：研究生级“Google-Proof”科学问题

[GPQA](https://openreview.net/forum?id=Ti67584b98) 包含由领域专家编写的生物、物理和化学选择题。原始数据集有 448 题；常见的 **GPQA Diamond** 是其中质量和难度更高的子集。

主要测量：高难科学知识、多步定量或概念推理，以及模型在陌生专业问题上的可靠性。

局限：题量小，置信区间较大；选择题 accuracy 也无法告诉我们推理过程是否可靠。报告分数时应说明是 GPQA 全集还是 Diamond、是否使用工具以及推理预算。

## 5. 数学推理

### 5.1 GSM8K：多步小学数学文字题

[GSM8K](https://openai.com/index/solving-math-word-problems/) 包含约 8,500 道高质量小学数学文字题，每题通常需要 2–8 个基本算术步骤。

```text
一家商店上午卖出 18 个苹果，下午卖出上午的 2 倍，
还剩 14 个。原来有多少个苹果？
```

主要测量：从自然语言抽取数量关系、安排计算顺序并得到正确结果。常见指标是最终答案 exact match。

局限：它主要是小学算术，不等于高级数学；只比较最终答案时，正确过程和碰巧猜对可能得到相同分数。数据公开时间较久，也需要考虑训练数据污染。

### 5.2 MATH / MATH-500：竞赛级数学

[MATH](https://arxiv.org/abs/2103.03874) 涵盖代数、几何、数论、概率等竞赛数学题，通常需要更长的符号推理。MATH-500 是常用于快速评估的 500 题子集。

主要测量：复杂数学推理、公式操作和解题策略。评分常提取最终答案做 exact match，但不同 harness 的答案规范化规则可能不同。

### 5.3 AIME：更高难度、答案易验证

AIME 题目来自美国数学邀请赛，答案是 `000–999` 的整数。它难度高，但最终答案容易自动验证，因此经常用于推理模型评测。

需要注意年份、题目集合、采样次数和推理 token budget。`pass@1` 与允许生成 64 次后取最好结果的分数，代表完全不同的计算预算。

## 6. 函数级代码生成

### 6.1 HumanEval

[HumanEval](https://github.com/openai/human-eval) 包含 164 个手写 Python 函数任务。模型根据函数签名和 docstring 补全实现，隐藏单元测试判断是否正确。

```python
def has_close_elements(numbers, threshold):
    """判断列表中是否存在距离小于 threshold 的两个数。"""
```

常用指标是 `pass@k`：生成 k 个候选时，至少一个通过测试的概率。它测的是小型函数合成，而不是阅读大型仓库、调试、Git 操作或需求澄清。

### 6.2 MBPP

[MBPP](https://github.com/google-research/google-research/tree/master/mbpp)（Mostly Basic Python Problems）包含较基础的 Python 编程题、参考实现和测试用例。它与 HumanEval 都适合测基础代码生成，但题目风格、数据规模和拆分方式不同。

### 6.3 LiveCodeBench

[LiveCodeBench](https://livecodebench.github.io/) 持续从 LeetCode、AtCoder 和 Codeforces 等平台收集新题，并按时间切分，目标是降低污染和过拟合。除了代码生成，还覆盖 self-repair、代码执行和测试输出预测。

它比 HumanEval 更能反映新题上的算法能力，但仍以相对独立的竞赛问题为主，不等于真实仓库维护。

## 7. 仓库级软件工程：SWE-bench 与 SWE-agent

### 7.1 SWE-bench 是什么

[SWE-bench](https://github.com/SWE-bench/SWE-bench) 从真实 Python 项目的 GitHub issue 和对应修复中构造任务。系统获得：

```text
代码仓库 + issue 描述 + 可执行环境
                     ↓
             生成代码 patch
                     ↓
        fail-to-pass / pass-to-pass tests
```

只有补丁修复目标问题，同时没有破坏原有测试，任务才算 resolved。常见指标是 `% Resolved`。

常见版本：

- **SWE-bench Full**：原始完整集合；
- **SWE-bench Lite**：较小、运行成本更低的子集；
- **SWE-bench Verified**：500 个经软件工程师确认可解决、描述较清晰的任务；
- **SWE-bench Multimodal**：issue 中可能包含截图等视觉信息；
- **SWE-bench Multilingual**：扩展到不同编程语言。

比较分数时，必须同时写明数据集版本、Agent scaffold、模型版本、最大步数、是否使用 test-time scaling，以及评测 harness 版本。

### 7.2 SWE-agent 是什么

[SWE-agent](https://github.com/SWE-agent/SWE-agent) 是一个 Agent-Computer Interface：让模型查看文件、搜索代码、编辑、执行测试并迭代修复。它可以在 SWE-bench 上运行，但它本身不是 benchmark。

可以这样理解：

```text
SWE-bench = 试卷 + 仓库环境 + 判分程序
SWE-agent = 参加考试的解题框架
LLM       = 解题框架内部使用的模型
```

因此“某模型 SWE-bench 得分”严格来说通常是“某模型 + 某 Agent 实现 + 某推理预算”的系统成绩。

## 8. Function Calling 与工具使用

### 8.1 BFCL：函数名和参数能否调用正确

[Berkeley Function-Calling Leaderboard（BFCL）](https://gorilla.cs.berkeley.edu/leaderboard) 评估模型是否能根据用户请求选择正确函数，并生成结构、参数名、类型和值都正确的调用。

它覆盖单函数、多函数候选、并行调用、多轮状态和“没有合适工具时拒绝调用”等情况。常见评分包括：

- **AST evaluation**：比较函数调用的抽象语法树；
- **Executable evaluation**：实际执行调用，检查结果是否正确；
- multi-turn / agentic success：检查多轮工具轨迹是否完成目标。

BFCL 很适合评估 function calling 接口，但单轮高分不代表 Agent 会做长期规划或从工具错误中恢复。

### 8.2 ToolBench：在大量 API 中选择和组合工具

[ToolBench / ToolLLM](https://arxiv.org/abs/2307.16789) 围绕大量真实 API 构建工具学习数据与评测，关注工具检索、参数生成和多步调用。

它比简单 function calling 更强调“面对很多候选 API 时找到正确工具”，但自动生成数据、API 可用性和基于模型的评审都会影响可重复性。

### 8.3 τ-bench：工具、用户和业务政策同时存在

[τ-bench](https://github.com/sierra-research/tau-bench) 模拟客服等真实场景：Agent 一边与模拟用户多轮对话，一边调用领域 API，还必须遵守业务政策。

它测试的不只是“API 参数有没有写对”，还包括：

- 是否从用户处收集必要信息；
- 是否保持多轮状态；
- 是否遵守退款、改签等规则；
- 是否真正改变了环境状态并满足用户目标。

这类评测常报告 success rate，以及更严格的 `pass^k`：连续运行 k 次都成功，才能体现稳定性。

## 9. 通用 Agent、网页和电脑操作

### 9.1 GAIA：通用 AI 助手

[GAIA](https://ai.meta.com/research/publications/gaia-a-benchmark-for-general-ai-assistants/) 包含 466 个现实问题，需要组合推理、网页搜索、多模态文件处理和工具调用，并按三档难度划分。

GAIA 的问题往往对人类并不需要博士知识，但对 Agent 的难点在于找到信息、组合证据、处理文件并输出严格格式的最终答案。它适合测“通用研究助手”，不适合单独归因到底层模型的哪一个能力。

### 9.2 AgentBench：横跨多种交互环境

[AgentBench](https://github.com/THUDM/AgentBench) 将 Agent 放入操作系统、数据库、知识图谱、数字卡牌、网页购物、网页浏览等多个环境，评估其多轮决策和执行能力。

优点是覆盖面广；缺点是不同环境的动作空间和评分尺度不同，聚合总分会隐藏具体短板。

### 9.3 WebArena：在可复现网站中完成任务

[WebArena](https://webarena.dev/) 提供自托管的电商、论坛、代码托管、内容管理等网站。任务要求 Agent 把自然语言目标转成点击、输入、导航和信息检索动作。

主要测量：网页 grounding、长程规划、表单操作、跨页面状态管理。评分通常检查网站最终状态，而不是只判断最后一段文字。

### 9.4 OSWorld：真实桌面与跨应用操作

[OSWorld](https://os-world.github.io/) 在真实操作系统与应用中评估多模态电脑使用 Agent，包含浏览器、文件系统、Office 类软件、媒体工具和跨应用工作流。

它同时要求视觉理解、GUI 定位、键鼠操作、应用知识和错误恢复。分数受到截图分辨率、动作接口、最大步数和环境稳定性的显著影响。

### 9.5 PaperBench：复现一篇研究论文

[PaperBench](https://openai.com/index/paperbench/) 要求 Agent 理解 AI 论文、编写实验代码、运行训练并复现结果，使用细粒度 rubric 评分。

它测试的是长时间尺度上的研究执行能力：论文理解、代码、实验管理、调试和结果验证。它非常接近真实工作，但成本高，也依赖 rubric 与 judge 的可靠性。

## 10. 常见指标应该怎样读

### Accuracy / Exact Match

选择题 accuracy 或最终答案 exact match 最直观，但对格式敏感，也忽略了过程质量。选择题随机基线还与选项数有关：四选一是 25%，十选一是 10%。

### pass@k

允许模型生成 k 个候选，只要其中一个通过测试就算成功。k 越大，计算预算越高，因此 `pass@1` 和 `pass@100` 不能直接比较。

### % Resolved / Task Success Rate

用于 SWE-bench、WebArena、OSWorld 等执行型任务。它比文字相似度可靠，但依赖环境、测试覆盖率和成功判定器。

### LLM-as-a-Judge / Rubric score

适用于开放式成果，例如报告、研究复现和复杂轨迹。优点是能评估没有唯一答案的任务；风险是 judge 存在偏好、位置效应、自我偏好和评分漂移。最好报告 judge 模型、rubric、校准集和人工一致性。

### 成本、延迟与稳定性

Agent 实际部署还应同时报告：

```text
成功率 / 每次成功成本 / 总 token / 工具调用次数
延迟 / 平均步骤数 / 最大步骤数 / 重复运行方差
```

一个成功率高但每题调用模型数百次的系统，和一次尝试就完成任务的系统不是同一类能力。

## 11. 如何为自己的模型选择 benchmark

| 你想验证的能力 | 优先选择 | 不要只看 |
|---|---|---|
| 基础常识与科学问答 | ARC-C、HellaSwag、WinoGrande | MMLU 总分 |
| 广泛知识覆盖 | MMLU / MMLU-Pro | 单一学科分数 |
| 高难科学推理 | GPQA Diamond | ARC-E |
| 基础数学推理 | GSM8K | 仅看最终答案而不做格式规范化 |
| 高难数学推理 | MATH-500、AIME | 不同采样预算的混合榜单 |
| 函数级编码 | HumanEval、MBPP、LiveCodeBench | SWE-bench |
| 真实软件维护 | SWE-bench Verified | HumanEval |
| Function Calling | BFCL | 普通问答榜单 |
| 客服与政策 Agent | τ-bench | 单轮 tool-call accuracy |
| 通用搜索与工具组合 | GAIA | 纯知识选择题 |
| 网页操作 | WebArena | BFCL |
| 桌面电脑使用 | OSWorld | WebArena 单站点成绩 |
| 长周期研究执行 | PaperBench | 只看代码生成分数 |
| 模型市场全景与初筛 | Artificial Analysis Intelligence Index + 分项成绩 | 只看一个综合分 |
| 开放式对话偏好 | LMArena | 把偏好排名当事实正确率 |
| 透明、可复现的多维研究 | HELM（注明 track 与版本） | 含糊的“HELM 总分” |

一个实用的评测组合通常至少包含：

1. 一个与你业务输入相似的静态能力测试；
2. 一个端到端任务成功率测试；
3. 你自己的私有、持续更新回归集；
4. 成本、延迟和多次运行稳定性。

## 12. 为什么 Benchmark 高分不等于产品可靠

### 数据污染与 benchmark 饱和

公开题目可能进入预训练或微调数据。时间切分、私有测试集和持续更新 benchmark 可以降低风险，但无法完全消除污染。

### Prompt、scaffold 与预算不一致

zero-shot、few-shot、chain-of-thought、工具权限、采样次数、上下文长度和最大步骤都会改变分数。只写模型名、不写配置的数字很难复现。

### 测试覆盖不足

SWE-bench 补丁通过 tests，不代表代码风格、性能和隐藏需求都正确；GUI 任务的自动检查器也可能遗漏视觉或语义错误。

### 平均分隐藏能力结构

两个平均分相同的系统，可能一个擅长数学、另一个擅长工具使用。产品选型应看分项和失败案例，而不是只看综合排行榜。

### Agent 具有随机性

工具超时、网页状态、采样和长轨迹误差都会造成波动。Agent 评测最好多次运行，并同时报告平均成功率、方差和 `pass^k`。

## 总结

可以把常见 benchmark 放在一条逐渐接近真实工作的轴上：

```text
选择题
  ARC / MMLU / GPQA
      ↓
结构化解题
  GSM8K / MATH / HumanEval
      ↓
工具调用
  BFCL / ToolBench / τ-bench
      ↓
环境中的端到端任务
  SWE-bench / GAIA / WebArena / OSWorld
      ↓
长期、开放式专业工作
  PaperBench / 私有业务评测
```

越往下，评测越接近真实工作，但也越难复现、成本越高，并且越难把成绩归因给单独的底层模型。正确的问题不是“哪个 benchmark 最权威”，而是：**这个评测的任务分布、工具条件和成功标准，是否与我真正想部署的系统一致？**

## 主要资料

- [Artificial Analysis Intelligence Index v4.3](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3)
- [LMArena](https://lmarena.ai/) · [LMArena FAQ](https://forward-testing.lmarena.ai/faq)
- [Stanford HELM](https://crfm.stanford.edu/helm/) · [HELM Capabilities](https://crfm.stanford.edu/helm/capabilities/v1.2.0/)
- [LiveBench](https://livebench.github.io/) · [Hugging Face Leaderboards and Evaluations](https://huggingface.co/docs/leaderboards/index)
- [AI2 Reasoning Challenge](https://allenai.org/data/arc)
- [MMLU](https://arxiv.org/abs/2009.03300) · [GPQA](https://openreview.net/forum?id=Ti67584b98)
- [GSM8K](https://openai.com/index/solving-math-word-problems/) · [HumanEval](https://github.com/openai/human-eval) · [LiveCodeBench](https://livecodebench.github.io/)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench) · [SWE-agent](https://github.com/SWE-agent/SWE-agent)
- [BFCL](https://gorilla.cs.berkeley.edu/leaderboard) · [τ-bench](https://github.com/sierra-research/tau-bench)
- [GAIA](https://ai.meta.com/research/publications/gaia-a-benchmark-for-general-ai-assistants/) · [AgentBench](https://github.com/THUDM/AgentBench)
- [WebArena](https://webarena.dev/) · [OSWorld](https://os-world.github.io/) · [PaperBench](https://openai.com/index/paperbench/)
