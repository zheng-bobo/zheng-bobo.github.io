---
title: "A Field Guide to LLM and AI Agent Benchmarks"
date: 2026-09-26 23:00:00 +0200
slug: "llm-agent-benchmarks-guide"
categories: [Artificial Intelligence]
tags: [LLM, AI Agent, Benchmark, Evaluation, Reasoning, Coding]
mathjax: false
---

Model reports often list the Artificial Analysis Intelligence Index, LMArena, HELM, ARC-E, MMLU, GSM8K, SWE-bench, GAIA, WebArena, and OSWorld side by side. Their scores are not interchangeable: the list mixes composite indices and leaderboards with individual benchmarks, each using different tasks, tools, environments, inference budgets, and scoring rules.

This guide maps common evaluations from static question answering to agents completing real tasks, and explains what each benchmark can—and cannot—tell us.

<!--more-->

> **Two common naming traps**
>
> 1. **SWE-bench is a benchmark; SWE-agent is not.** SWE-bench provides repositories, issues, and tests. SWE-agent is an agent system that can attempt those tasks.
> 2. **ARC-E / ARC-C are not ARC-AGI.** The former are AI2 multiple-choice science questions; ARC-AGI uses colored grids for abstract rule induction.

## 1. Are we evaluating a model or a system?

| Level | Evaluation target | Typical input | Examples |
|---|---|---|---|
| Model capability | One or a few text generations | Questions, options, function signatures | ARC, MMLU, GPQA, GSM8K, HumanEval |
| Tool capability | Selecting and invoking functions/APIs | Tool schemas, requests, execution feedback | BFCL, ToolBench, τ-bench |
| Agent system | Model + prompt + memory + tools + scaffold | Repository, browser, desktop, long-running environment | SWE-bench, GAIA, WebArena, OSWorld, PaperBench |

An agent score is therefore a property of a complete setup:

```text
agent result = model capability
             + agent scaffold
             + tools and environment
             + inference budget
             + evaluation protocol
```

## 2. Quick reference

| Benchmark | Main capability | Task form | Common metric |
|---|---|---|---|
| ARC-E / ARC-C | Grade-school science | Multiple choice | Accuracy |
| HellaSwag | Commonsense event completion | Choose an ending | Accuracy |
| WinoGrande | Coreference and commonsense | Binary completion | Accuracy |
| MMLU | Broad academic knowledge | 57-subject multiple choice | Average accuracy |
| MMLU-Pro | Harder knowledge reasoning | Ten-choice questions | Accuracy |
| GPQA | Graduate-level science | Expert-written multiple choice | Accuracy |
| GSM8K | Grade-school math | Multi-step word problems | Exact match |
| MATH / AIME | Competition math | Free response | Exact match / pass@k |
| HumanEval / MBPP | Function-level coding | Prompt + hidden tests | pass@k |
| LiveCodeBench | Recent coding ability | Contests, repair, execution | pass@1 and variants |
| SWE-bench | Repository-level engineering | GitHub issue to patch | % Resolved |
| BFCL | Function calling | Select tools and arguments | AST / executable accuracy |
| ToolBench | API discovery and use | Instruction + APIs | Success / win rate |
| τ-bench | Tool-agent-user interaction | Dialogue + policies + APIs | success / pass^k |
| GAIA | General assistant work | Search, files, multimodality | Accuracy |
| AgentBench | Multi-environment agency | OS, DB, web, games | Aggregate success |
| WebArena | Browser operation | Tasks on reproducible sites | Task success |
| OSWorld | Computer use | Real desktop applications | Task success |
| PaperBench | Long-horizon research | Reproduce an AI paper | Rubric score |
| Artificial Analysis Intelligence Index | Aggregate frontier capability | Weighted collection of evaluations | Composite index |
| LMArena | Real-user preference | Anonymous pairwise comparison | Elo-style rating |
| HELM | Transparent multi-scenario evaluation | Unified evaluation framework | Per-scenario metrics |
| LiveBench | Continuously refreshed ability | New, objectively graded tasks | Category scores / average |

## 3. Composite indices, evaluation suites, and leaderboards

Artificial Analysis, LMArena, and HELM often appear beside GSM8K or SWE-bench in model comparisons, but they are different evaluation objects.

| Type | What it is | Example | Best question it answers |
|---|---|---|---|
| Single benchmark | Fixed tasks, data, and grader | GSM8K, SWE-bench | Can the system complete this kind of task? |
| Composite index | Several evaluations normalized and aggregated | Artificial Analysis Intelligence Index | Where is the model overall? |
| Evaluation suite/framework | Many scenarios run under a shared protocol | HELM | What is the model's multidimensional profile? |
| Human-preference leaderboard | Anonymous pairwise votes | LMArena | Which answer do users prefer? |
| Living benchmark | New tasks added over time | LiveBench | How does the model perform on recent, gradable tasks? |

### Artificial Analysis Intelligence Index

The [Artificial Analysis Intelligence Index](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3) is a **composite index**, not a standalone dataset. Artificial Analysis runs multiple evaluations in a consistent setup, normalizes and weights them into a headline score, and presents intelligence alongside price, output speed, and latency to support capability-cost comparisons.

As of this article's update on September 26, 2026, the published methodology is **v4.3.2**. It combines ten evaluations: AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA, Terminal-Bench 4.0, SciCode, Humanity's Last Exam, GDP.pdf, CritPt, AA-Omniscience, and AA-LCR v1.1. The mix emphasizes agentic work, professional knowledge, scientific coding, terminal tasks, and long-context reasoning.

It is useful for market-level orientation and initial model shortlisting. It is not a substitute for component scores or product-specific testing: an aggregate hides different capability profiles, and the tasks, weights, and normalization can change. Scores from v4.1, v4.2, and v4.3 should not be compared without accounting for the index version.

### LMArena: preference rather than objective correctness

[LMArena](https://lmarena.ai/) presents two anonymous model answers to real users, reveals the identities after voting, and builds Elo-style rankings from pairwise preferences. It is valuable for conversational quality and perceived usefulness on open-ended prompts.

Preference is not correctness. Fluent, confident, or verbose answers may win despite factual errors, while rankings depend on the user population, prompt mix, model versions, and vote volume. Arena results should be paired with verifiable tasks and private product evaluations.

### HELM: a transparent evaluation framework

[Stanford HELM](https://crfm.stanford.edu/helm/) is better understood as an evaluation framework and family of suites than as one universal score. It separates models, scenarios, adaptations, and metrics while exposing prompts and instance-level results for reproducibility and auditing. HELM Capabilities, HELM Instruct, Long Context, and MedHELM target different questions.

A result should therefore name the HELM track, version, scenario, and metric. Its strength is transparent multidimensional evaluation; its results should not be collapsed carelessly into one number.

### LiveBench and the Open LLM Leaderboard

[LiveBench](https://livebench.github.io/) regularly introduces new, objectively graded tasks to reduce contamination and judge-model bias. Always record the release date, benchmark version, and category scores.

The [Hugging Face Open LLM Leaderboard](https://huggingface.co/docs/leaderboards/index) historically reran open models in a shared, reproducible environment. Its classic leaderboard has retired; Hugging Face now provides an entry point to purpose-specific, community-managed leaderboards. Old screenshots and aggregate rankings should not be treated as current evidence.

Composite platforms are best used as maps. Individual benchmarks and private evaluations are better tools for concrete deployment decisions.

## 4. Knowledge, commonsense, and textual reasoning

### ARC-E and ARC-C

The [AI2 Reasoning Challenge](https://allenai.org/data/arc) contains science exam questions from grades 3–9. **ARC-Easy** contains easier items; **ARC-Challenge** selects questions that retrieval and word-co-occurrence baselines struggle with.

It measures science knowledge, reading comprehension, option comparison, and short reasoning chains. Multiple-choice accuracy does not establish open-ended scientific ability, and easier splits can saturate.

### HellaSwag and WinoGrande

[HellaSwag](https://arxiv.org/abs/1905.07830) asks the model to select the most plausible continuation of an everyday event. [WinoGrande](https://arxiv.org/abs/1907.10641) tests commonsense-sensitive coreference resolution.

Both are useful for lightweight commonsense testing, but candidates and templates can expose statistical shortcuts.

### MMLU and MMLU-Pro

[MMLU](https://arxiv.org/abs/2009.03300) spans 57 subjects including mathematics, history, computer science, law, medicine, and philosophy. It measures breadth of knowledge and switching across academic formats—not browsing, tool use, or long-horizon execution.

[MMLU-Pro](https://arxiv.org/abs/2406.01574) expands questions from four to ten answer options and emphasizes harder reasoning. MMLU and MMLU-Pro scores are not directly interchangeable.

### GPQA

[GPQA](https://openreview.net/forum?id=Ti67584b98) contains 448 expert-written questions in biology, physics, and chemistry. The widely reported **GPQA Diamond** is a smaller, high-quality subset.

It targets difficult scientific reasoning, but its small size creates uncertainty. Reports should identify the split, tool access, and inference budget.

## 5. Mathematical reasoning

### GSM8K

[GSM8K](https://openai.com/index/solving-math-word-problems/) contains roughly 8,500 grade-school word problems requiring two to eight elementary arithmetic steps. It tests extraction of quantitative relationships and multi-step calculation, usually via exact-match final answers.

It is not advanced mathematics, and its age makes contamination a concern.

### MATH, MATH-500, and AIME

[MATH](https://arxiv.org/abs/2103.03874) covers competition-style algebra, geometry, number theory, and probability. MATH-500 is a common 500-problem subset.

AIME problems are harder competition questions with integer answers from 000 to 999. Always report the year range, number of samples, and reasoning budget: pass@1 and best-of-64 measure very different compute regimes.

## 6. Function-level code generation

### HumanEval and MBPP

[HumanEval](https://github.com/openai/human-eval) contains 164 handwritten Python function tasks scored with hidden unit tests. [MBPP](https://github.com/google-research/google-research/tree/master/mbpp) contains mostly basic Python problems with reference code and tests.

Both commonly report `pass@k`: the probability that at least one of k generated candidates passes. They test small-program synthesis—not repository exploration, debugging, version control, or requirements discovery.

### LiveCodeBench

[LiveCodeBench](https://livecodebench.github.io/) continuously collects newer problems from competitive-programming platforms and uses temporal splits to reduce contamination. It also evaluates self-repair, code execution, and test-output prediction.

It better measures novel algorithmic coding than older static sets, but still differs from maintaining a real codebase.

## 7. Repository-level engineering: SWE-bench and SWE-agent

### SWE-bench

[SWE-bench](https://github.com/SWE-bench/SWE-bench) gives a system a real GitHub repository and issue. The system must generate a patch that makes fail-to-pass tests succeed without breaking pass-to-pass tests. The main metric is `% Resolved`.

Important variants include Full, Lite, Verified, Multimodal, and Multilingual. **SWE-bench Verified** contains 500 tasks reviewed by software engineers for solvability and clarity.

Every score should name the dataset variant, agent scaffold, model version, step limit, test-time scaling, and harness version.

### SWE-agent

[SWE-agent](https://github.com/SWE-agent/SWE-agent) is an Agent-Computer Interface that lets a model inspect files, search code, edit, run tests, and iterate. It can be evaluated on SWE-bench, but is not itself the benchmark.

```text
SWE-bench = exam + repository environment + grader
SWE-agent = the problem-solving framework
LLM       = the model inside that framework
```

## 8. Function calling and tool use

### BFCL

The [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard) tests whether a model selects the right function and produces valid names, argument types, and values. It covers single, parallel, multiple, relevance-detection, multi-turn, and agentic scenarios.

AST evaluation checks call structure; executable evaluation runs calls. Strong single-turn function calling does not imply long-horizon planning or recovery.

### ToolBench

[ToolBench / ToolLLM](https://arxiv.org/abs/2307.16789) evaluates API retrieval, argument generation, and multi-step use across a large API collection. It stresses finding the right tool among many candidates, though API availability and model-based judging can affect reproducibility.

### τ-bench

[τ-bench](https://github.com/sierra-research/tau-bench) simulates realistic conversations where an agent must interact with a user, call domain APIs, and obey policies. It tests information gathering, state tracking, policy compliance, and actual environment changes.

Strict `pass^k` asks whether the system succeeds repeatedly, making reliability visible rather than rewarding one lucky trajectory.

## 9. General, browser, and computer-use agents

### GAIA

[GAIA](https://ai.meta.com/research/publications/gaia-a-benchmark-for-general-ai-assistants/) contains 466 questions requiring combinations of reasoning, web research, multimodal file handling, and tools across three difficulty levels. It evaluates a general research assistant, not an isolated base-model skill.

### AgentBench

[AgentBench](https://github.com/THUDM/AgentBench) evaluates agents across operating systems, databases, knowledge graphs, games, web shopping, and browsing. Breadth is its strength; aggregate scores can hide environment-specific weaknesses.

### WebArena

[WebArena](https://webarena.dev/) provides reproducible self-hosted commerce, forum, code-hosting, and content-management sites. Agents must turn goals into navigation, clicks, typing, and information retrieval. Evaluation usually checks final website state.

### OSWorld

[OSWorld](https://os-world.github.io/) evaluates multimodal agents in real operating systems and applications, including browsers, files, office tools, media apps, and cross-application workflows. Performance depends strongly on visual grounding, action interfaces, step limits, and environment stability.

### PaperBench

[PaperBench](https://openai.com/index/paperbench/) asks agents to understand AI papers, implement experiments, run code, and reproduce results. Fine-grained rubrics score long-horizon research execution. It is realistic but expensive and judge-dependent.

## 10. Reading the metrics

- **Accuracy / exact match:** simple and reproducible, but format-sensitive and blind to process quality.
- **pass@k:** at least one of k candidates succeeds; larger k means more compute.
- **% Resolved / task success:** execution-based and useful, but only as reliable as the environment and tests.
- **LLM-as-a-judge / rubric score:** handles open-ended outputs, but introduces judge bias and drift.
- **Cost and latency:** agent evaluations should also report tokens, calls, steps, latency, cost per attempt, and cost per success.
- **Reliability:** repeated-run averages, variance, and `pass^k` reveal stochastic failures hidden by a single run.

## 11. Selecting benchmarks for your use case

| Capability | Prefer | Do not rely only on |
|---|---|---|
| Science and commonsense | ARC-C, HellaSwag, WinoGrande | MMLU aggregate |
| Broad knowledge | MMLU / MMLU-Pro | One subject |
| Difficult science | GPQA Diamond | ARC-E |
| Basic math | GSM8K | Unnormalized free-form strings |
| Hard math | MATH-500, AIME | Mixed inference budgets |
| Function-level coding | HumanEval, MBPP, LiveCodeBench | SWE-bench |
| Repository maintenance | SWE-bench Verified | HumanEval |
| Function calling | BFCL | General QA |
| Policy-aware service agents | τ-bench | Single-turn tool accuracy |
| General research assistant | GAIA | Closed-book MCQ only |
| Browser operation | WebArena | BFCL |
| Desktop operation | OSWorld | Text-only agent tests |
| Long-horizon research | PaperBench | Code-generation scores alone |
| Market overview and shortlisting | Artificial Analysis Index + component scores | One aggregate score |
| Open-ended conversational preference | LMArena | Treating preference as factual accuracy |
| Transparent multidimensional research | HELM, with track and version | A vague “HELM score” |

A practical evaluation suite should combine a relevant static capability set, an end-to-end task benchmark, a private continuously refreshed regression set, and measurements of cost, latency, and repeated-run stability.

## 12. Why high benchmark scores do not guarantee product reliability

- **Contamination and saturation:** public questions may appear in training data.
- **Protocol mismatch:** prompting, tools, samples, context, and step limits alter scores.
- **Incomplete graders:** passing tests does not prove style, performance, or hidden requirements.
- **Averages hide profiles:** equal overall scores can mask completely different strengths.
- **Agents are stochastic:** tools, web state, sampling, and long trajectories introduce variance.

## Conclusion

Benchmarks form a progression toward real work:

```text
multiple choice
  ARC / MMLU / GPQA
      ↓
structured problem solving
  GSM8K / MATH / HumanEval
      ↓
tool invocation
  BFCL / ToolBench / τ-bench
      ↓
end-to-end environments
  SWE-bench / GAIA / WebArena / OSWorld
      ↓
long-horizon professional work
  PaperBench / private product evaluations
```

The closer an evaluation gets to real work, the more expensive and difficult it becomes to reproduce—and the harder it is to attribute results to the base model alone. The right question is not “Which benchmark is authoritative?” but “Does this task distribution, tool setup, and success criterion match the system I intend to deploy?”

## Primary references

- [Artificial Analysis Intelligence Index v4.3](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3)
- [LMArena](https://lmarena.ai/) · [LMArena FAQ](https://forward-testing.lmarena.ai/faq)
- [Stanford HELM](https://crfm.stanford.edu/helm/) · [HELM Capabilities](https://crfm.stanford.edu/helm/capabilities/v1.2.0/)
- [LiveBench](https://livebench.github.io/) · [Hugging Face Leaderboards and Evaluations](https://huggingface.co/docs/leaderboards/index)
- [AI2 ARC](https://allenai.org/data/arc) · [MMLU](https://arxiv.org/abs/2009.03300) · [GPQA](https://openreview.net/forum?id=Ti67584b98)
- [GSM8K](https://openai.com/index/solving-math-word-problems/) · [HumanEval](https://github.com/openai/human-eval) · [LiveCodeBench](https://livecodebench.github.io/)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench) · [SWE-agent](https://github.com/SWE-agent/SWE-agent)
- [BFCL](https://gorilla.cs.berkeley.edu/leaderboard) · [τ-bench](https://github.com/sierra-research/tau-bench)
- [GAIA](https://ai.meta.com/research/publications/gaia-a-benchmark-for-general-ai-assistants/) · [AgentBench](https://github.com/THUDM/AgentBench)
- [WebArena](https://webarena.dev/) · [OSWorld](https://os-world.github.io/) · [PaperBench](https://openai.com/index/paperbench/)
