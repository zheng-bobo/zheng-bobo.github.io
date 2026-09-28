---
title: "When AI Starts Building Itself: Anthropic's Internal Practice and the Future of Recursive Self-Improvement"
date: 2026-09-28 09:00:00 +0200
slug: "anthropic-recursive-self-improvement"
categories: [AI Agents]
tags: [Anthropic, Claude, Recursive Self-Improvement, Autonomous Agents, AI R&D]
toc: true
---

Something important is happening inside Anthropic: AI is no longer only the product being researched and built. It is increasingly participating in the process of building AI itself. Claude has progressed from completing code to editing repositories, running experiments, reviewing changes, and coordinating parallel agents.

If this path continues, its endpoint could be **recursive self-improvement (RSI)**: an AI system capable of designing, training, and evaluating its own successors, turning model progress into an accelerator of further model progress.

This article organizes my notes around the Anthropic Institute essay [When AI builds itself](https://www.anthropic.com/institute/recursive-self-improvement). It does not assume that RSI is inevitable. Instead, it asks what Anthropic has already delegated to Claude, what is still missing from a closed loop, and where this trajectory could move the human role.

<!--more-->

## 1. From assistant to part of the improvement loop

Anthropic describes five stages in AI's involvement in its own development. The important change is not merely that models produce more code. The interface between the model and its environment is closing: systems move from giving suggestions to acting, observing results, revising plans, and delegating work to other agents.

{{< rsi-evolution >}}

The timeline can be compressed into three layers:

1. **Generation**: the model produces text or code; a person executes it.
2. **Agency**: the model operates tools and repositories and iterates on environmental feedback.
3. **Closing the loop**: the model helps select experiments, train systems, and improve the next generation.

The jump from chatbot to coding agent is mainly about acting on the environment. The jump from autonomous agents to RSI depends on independently choosing directions worth pursuing. The first is largely an execution problem; the second requires research taste, judgment, verification, and governance.

## 2. The external trend: reliable task horizons are expanding

Anthropic cites [METR's task-horizon research](https://metr.org/time-horizons/): the duration of tasks AI can complete independently at a specified reliability has recently doubled roughly every four months, faster than the earlier trend of about seven months.

Task duration is closer to real agent value than single-question accuracy. Solving one problem is different from maintaining a plan for hours, recovering from failures, using tools, and delivering a verifiable result. Longer horizons move AI from local assistance toward complete units of work.

The same direction appears in engineering and research-reproduction benchmarks:

- [SWE-bench](https://www.swebench.com/) asks systems to fix real GitHub issues in real repositories and pass project tests.
- [CORE-Bench](https://arxiv.org/abs/2409.11363) tests whether systems can reproduce published research from its code and data.
- Rapid saturation is pushing evaluation toward more open-ended, long-horizon tasks with expensive verification.

Public benchmarks reveal what systems can do, but not how they are changing the production process at a frontier lab. Anthropic's internal evidence is therefore more revealing.

## 3. How much work is Claude already doing inside Anthropic?

### 3.1 More than 80% of merged code is authored by Claude

Anthropic reports that, as of May 2026, **more than 80% of code merged into its codebase was attributable to Claude**. Before Claude Code entered research preview in February 2025, the figure was in the low single digits.

In Q2 2026, the typical engineer was merging roughly **8 times** as much code per day as in 2024. Lines of code are not productivity: more code can create maintenance costs, and attribution is imperfect. Still, the timing shows two clear inflection points:

- In 2025, Claude moved from suggesting code to running and changing it.
- In 2026, models began working autonomously over longer horizons.

The deeper change is the engineer's unit of work. Instead of expressing an implementation line by line, people increasingly define goals, provide constraints, review outcomes, and steer multiple concurrent workstreams.

### 3.2 AI makes previously uneconomic work possible

The uplift is not only faster completion of planned tasks. Anthropic reports that Claude performs exploratory tooling, deferred cleanup, and repairs spanning large amounts of unfamiliar context—work that often would not receive human priority.

In April 2026, Claude shipped **more than 800 fixes** that reduced one class of API errors by roughly a factor of one thousand. The supervising engineer estimated that the same cleanup could have taken a human four years.

This is a distinct form of agent value: not simply replacing expensive labor, but making fragmented, tedious, individually valuable tasks economical for the first time.

### 3.3 Code quality is approaching human parity

“Good code” has at least two requirements:

1. It works and solves the problem.
2. Another engineer can understand, maintain, and extend it.

Anthropic says the frequency with which staff correct, redirect, or take over from Claude has declined for a year, including on underspecified, open-ended tasks. The essay characterizes Claude-written code as somewhat worse than human code in late 2025 and roughly at parity in 2026, with further improvement expected.

Review has changed as well. Proposed changes are inspected by an automated Claude reviewer for bugs and security issues before merging. A retrospective analysis suggested that such review on every historical change could have caught roughly **one third** of the bugs behind past `claude.ai` incidents.

This is an early loop: Claude writes code, Claude reviews it, and humans move from line-by-line production toward supervising mutually constraining model workflows. Model-on-model review, however, cannot replace external tests, isolation, and independent evaluation; correlated errors may otherwise survive both stages.

## 4. From engineering execution to research execution

Frontier-model development contains two broad forms of work:

- **Engineering**: code, infrastructure, training systems, and operations.
- **Research**: selecting questions, designing experiments, interpreting evidence, and choosing what to try next.

Claude has advanced faster in engineering execution, but Anthropic's examples show it entering the experimental loop as well.

### 4.1 With a fixed objective, experimental optimization is already superhuman

For each model release, Anthropic runs a fixed test: Claude receives code that trains a small model and must make it as fast as possible while preserving correctness. It repeatedly rewrites, runs, times, diagnoses, and tries again.

In this comparable setup:

- Claude Opus 4 averaged about a **3×** speedup in May 2025.
- Claude Mythos Preview reached about **52×** in April 2026.
- A skilled human researcher typically reached around **4×** in four to eight hours.

The absolute multiple depends on how much headroom exists in the starting code and should not be interpreted as a 52× acceleration of frontier training. The reliable signal is the like-for-like shift: with goals and correctness checks fixed in advance, the model moved from helpful to clearly beyond human search and execution within a year.

### 4.2 Agents can design experiments inside a chosen problem

In an open weak-to-strong supervision project, Claude agents proposed hypotheses, ran parallel experiments, shared findings, and iterated. Two human researchers recovered roughly 23% of the theoretical performance gap in about a week; the agents recovered 97% over about 800 cumulative hours and $18,000 of compute.

The boundaries matter as much as the result:

- Humans chose the research problem.
- Humans defined the scoring rubric and success bounds.
- The result did not transfer cleanly to production-scale models.
- Massive parallel compute is not the same as zero real-world cost.

Claude can organize research inside a given problem space. It has not yet demonstrated consistently good judgment about which problem is most worth pursuing.

## 5. The missing piece: research taste

Anthropic frames the current boundary through a career ladder:

| Work level | Example | Claude today |
| --- | --- | --- |
| Execute a specified task | “Fix the export button” | Already very strong |
| Design a method from a goal | “Find why the network slows under load” | Improving rapidly |
| Choose the problem itself | “What should we build next quarter?” | Humans retain a clear advantage |

When implementation, experimentation, and reporting approach zero marginal human time, direction becomes scarce. Which result should be trusted? Which anomaly deserves investigation? When is a path a dead end? Did a technically successful experiment answer an important question?

This is **research taste**. It is not a static benchmark score, but integrated judgment about problem value, evidence quality, hidden assumptions, and long-term consequences.

Today's division of labor is therefore better represented as:

```text
Humans: choose goals, define constraints, judge evidence, own responsibility
  ↓
AI: implement, run, search, parallelize, record, and perform first-pass evaluation
  ↓
Humans: validate direction and decide whether to continue
```

RSI requires more than AI writing training code. It requires reliable control of the top of this loop—direction-setting—together with verification mechanisms that prevent errors and goal drift from compounding across generations.

## 6. How work could change

Once AI and human code quality reach parity, people first move from writing to reviewing. But AI can generate faster than people can inspect, making human review the next bottleneck. AI then performs first-line review, while people concentrate on anomalies, high-risk changes, and system-level judgment.

Research follows the same pattern:

```text
Past: human idea → human implementation → wait → human analysis

Present: human direction → parallel agent experiments → evaluator filtering → human judgment

Future: AI proposes directions → AI experiments and cross-validates → humans govern goals, risk, and stopping
```

Even if AI never develops mature research taste, organizations can still see compounding acceleration: humans handle the single-digit fraction of direction-setting work while each researcher steers far more experiments. Under Amdahl's law, acceleration in one component merely moves the bottleneck elsewhere—evaluation, compute, electricity, data, hardware production, organizational decisions, and safety review all become limits.

## 7. Three possible futures

### Future one: capabilities plateau, but today's systems diffuse

The current trajectory may be part of an S-curve. Diminishing scaling returns could make further progress depend on an architecture beyond Transformers or a new training paradigm.

Even frozen capability would still transform knowledge work. Most organizations have not redesigned their processes around current systems, leaving a long runway for diffusion alone.

### Future two: compounding acceleration with humans retaining direction

AI development becomes substantially automated, but humans continue to select problems, judge results, and authorize the next stage. A lab starts to resemble a large virtual research organization supervised by a small number of human leads, with execution increasingly running at compute speed.

This may be the conservative scenario most likely to be underestimated. AI need not fully replace researchers; each researcher only needs to steer a growing number of effective agents.

### Future three: full recursive self-improvement

AI designs a successor, changes the training system, runs training, evaluates the new model, and selects the next improvement. Progress is then constrained primarily by compute, energy, chips, data, and verification—not by human research hours.

Society would not necessarily accelerate uniformly. Intelligence may speed drug design but cannot compress years of safety observation; it may improve policy analysis but cannot create institutional trust overnight; it may optimize robots while remaining constrained by factories and supply chains.

The future could therefore be sharply uneven: an upstream virtual lab iterates at computational speed while the downstream world still moves at biological, physical, institutional, and relational speed.

## 8. Further implications

### 8.1 RSI is a system capability, not a single-model capability

A closed loop requires code and experiment environments, long-term memory, orchestration, independent evaluators, permissions, traceable logs, a training platform, and explicit stopping mechanisms. RSI is unlikely to appear as a single switch in one model release; it is more likely to emerge when models, harnesses, compute, and organizational processes cross a threshold together.

### 8.2 Acceleration will first look like parallelism

The near-term change is one person supervising dozens or hundreds of persistent agents exploring alternatives, reproducing experiments, checking failures, and maintaining infrastructure. An individual agent does not need perfect research taste if enough candidates are explored and the selection system is strong.

### 8.3 Verification must scale at least as quickly as generation

When code and experiments become cheap, wrong results become cheap and abundant too. The dangerous failure is not an obvious crash but a plausible mistake inherited, amplified, and optimized by a successor.

Some of the most important agents may therefore be:

- Verifiers that independently reproduce experiments.
- Red-team agents that search for counterexamples.
- Auditors that detect contamination and evaluation leakage.
- Safety agents that continuously monitor training and behavior.

### 8.4 Humans move from producers toward governors

As AI performs more of the doing, the human role shifts toward objective-setting, value judgment, accountability, and the authority to stop. The central question becomes not only whether AI can discover a better model, but who defines “better,” who can begin the next training run, what signals require a pause, and how labs verify that others follow shared limits.

The more complete the technical loop becomes, the less optional the governance loop is.

## 9. Conclusion: not a closed loop yet, but already a feedback loop

Anthropic's internal data does not prove RSI is inevitable and cannot automatically generalize to every organization. Lines of code, employee estimates, and internal judges all have limitations, and the evidence comes from a frontier lab with a direct stake in the trajectory.

Taken together, however, the direction is clear:

> AI is moving from helping humans develop AI toward owning increasingly complete portions of the AI-development cycle.

Humans still choose problems, set success criteria, and judge results. Claude already performs much of the implementation, experimentation, repair, review, and local steering. Whether this becomes RSI will depend not only on model intelligence, but on whether research judgment can be automated reliably—and whether verification, control, and coordination can keep pace with generation and execution.

The loop is not closed, but the feedback has begun.

## References

- [Anthropic Institute: When AI builds itself](https://www.anthropic.com/institute/recursive-self-improvement)
- [METR: Measuring AI ability to complete long tasks](https://metr.org/time-horizons/)
- [SWE-bench](https://www.swebench.com/)
- [CORE-Bench: Fostering the Credibility of Published Research Through a Computational Reproducibility Agent Benchmark](https://arxiv.org/abs/2409.11363)

> Data note: Anthropic's internal metrics are reported as of the dates stated in the source, which includes an update through September 18, 2026. They are evidence of a trend, not universal productivity measurements for every organization.
