---
title: "Stanford CS329A: A Complete Framework for Self-Improving AI Agents"
date: 2026-08-11 06:27:01 +0200
slug: "stanford-cs329a-self-improving-ai-agents"
categories: ["AI Agents"]
tags: ["AI Agents", "Test-Time Compute", "Verifier", "ReAct", "LATS", "Reinforcement Learning"]
mathjax: true
mathjaxEnableSingleDollar: true
---


Self-Improving AI Agent is not a mysterious system that recursively modifies itself indefinitely. A more practical understanding is: Agent forms a closed loop between generation, action, observation and verification, and uses the feedback obtained during reasoning to improve current answers, subsequent decisions, and even the next round of training.

This article follows the main line of the Stanford CS329A course and strings together test-time calculations, verifiers, tool feedback, planning search, reinforcement learning, in-depth research and long-term evaluation into a complete framework.

<!--more-->

> **Course**: [Stanford CS329A · Self-Improving AI Agents](https://cs329a.stanford.edu/)
>
> **Core question**: How to let the Agent learn from its own attempts and environmental feedback, instead of just relying on more manual annotations?

## 1. What is Self-Improving Agent?

An Agent that can improve itself must at least complete the following closed loop:

1. **Generate/Act**: Generate candidate answers, or perform actions in the environment;
2. **Observe/Verify**: Read tool results, execution feedback or validator scores;
3. **Select/Reflect**: Select a better trajectory, analyze the reasons for failure and correct them;
4. **Update**: Update context, memory, search strategy, or model parameters;
5. **Evaluate**: Confirm whether the improvement is real on an independent task.

![Self-improvement closed loop from pre-training, fine-tuning to feedback during testing](/img/posts/cs329a-self-improving-agents/self-improvement-loop.png)

There are two different "extensions" in this framework:

- **Test-time scaling**: The model parameters remain unchanged, and more sampling, search and verification calculations are invested in answering a question;
- **Train-time scaling**: Turn success and failure trajectories into training signals, and update the model through supervised learning or reinforcement learning.

The former solves the problem of "how to answer better this time", and the latter solves the problem of "how to answer better next time". True self-improvement systems often connect the two.

## 2. Calculate expansion when testing: don’t just generate it once

The simplest test-time extension is **Repeated Sampling**: independently generate multiple candidate answers to the same question, and then select one from them.

If the probability of generating a correct answer once is $p$, and each sampling is approximately independent, then after generating $k$ times, the probability of at least one correct answer is:

$$
\mathrm{pass@}k = 1-(1-p)^k
$$

This shows that even if the model parameters remain unchanged, as long as the number of sampling is increased, the **Coverage** of the candidate set may be improved. In the experiments of Large Language Monkeys, the single success rate of DeepSeek-Coder-V2-Instruct on the SWE-bench Lite at that time was 15.9%, and the problem coverage rate after sampling 250 times reached 56%.

But high coverage does not mean good final results. The system must also identify the correct answer among multiple candidates, i.e. improve **Precision**. If the selector only votes by majority, and the wrong answers happen to be highly similar, then no amount of sampling may be useful.

![The gap between candidate coverage and majority voting and reward model selection effects](/img/posts/cs329a-self-improving-agents/verification-gap.png)

Therefore, there are really two issues involved in computing extensions when testing:

- **Generating Question**: Can the correct solution be found?
- **Choice question**: After seeing the correct solution, can you choose it?

### Three common strategies

#### 2.1 Parallel Sampling: Best-of-N

Simultaneously generate $N$ independent candidates, score them using rules, test cases or reward models, and return the highest-scoring result. It is simple, highly parallel, and suitable for tasks with reliable validators.

#### 2.2 Sequential Revisions: Sequential Revisions

Each step continues to be revised based on the answers and feedback from the previous version. It's more like debugging: generate first, then locate the problem, and then modify. The advantage is that existing work can be reused; the disadvantage is that early errors may lock subsequent reasoning on the wrong path.

#### 2.3 Search: Beam Search / Tree Search

Multiple intermediate reasoning trajectories are retained, expanded and pruned at each step. Instead of just evaluating the final answer, the search requires the validator to judge "whether this step is worth continuing."

![Parallel sampling, sequential correction, and search methods combining the two](/img/posts/cs329a-self-improving-agents/parallel-sequential-combined.png)

The best strategy is not necessarily to generate the same number of samples consistently. **Compute-optimal scaling** allocates budget based on question difficulty: easy questions stop quickly, medium-difficulty questions invest more search; if the correct answer almost never appears among the candidates for the hardest question, then the marginal benefit of continuing to increase sampling decreases rapidly.

![Allocate test calculation budget according to question difficulty](/img/posts/cs329a-self-improving-agents/compute-optimal-search.png)

This also explains a seemingly contradictory phenomenon: on some problems, the calculation of a small model plus testing can exceed that of a much larger model; but outside the boundaries of the model's capabilities, adding calculations cannot create non-existent problem-solving capabilities out of thin air.

## 3. Validator: The bottleneck of self-improving systems

The verifier receives a question, candidate answers, and sometimes a complete reasoning trace, and estimates the probability that the answer is correct.

![Basic architecture for the validator to score candidate solutions](/img/posts/cs329a-self-improving-agents/verifier-architecture.png)

The two most common types of learning validators are:

- **Outcome Reward Model (ORM)**: Only the final answer is evaluated;
- **Process Reward Model (PRM)**: Evaluates intermediate reasoning steps and provides signals for each step.

ORM is relatively simple to annotate and use, but it cannot distinguish between "correct reasoning" and "happening to get it right". PRM can locate errors to a certain step, improve credit assignment in long inference chains, and make it easier to explain why a trajectory is retained or pruned. In the mathematical reasoning experiment of *Let's Verify Step by Step*, process supervision is better than outcome supervision; this is a specific experimental conclusion and does not mean that PRM is naturally superior in all tasks.

### Why does the validator fail?

1. **Training data is too small**: The verifier remembers surface patterns but does not learn to judge correctness;
2. **Generation-Verification Gap**: The generator can produce the correct answer, but the verifier cannot recognize it;
3. **Reward hacking**: Agent learns to cater to scoring rules instead of completing real goals;
4. **Homology bias**: The generator and the verifier share similar blind spots, and errors will be steadily amplified;
5. **Distribution Shift**: A validator trained on short questions may not necessarily be able to judge long-term tasks.

Engineering should prioritize the use of more reliable external signals: code unit tests, compilers, formal proofs, database constraints, or environment status. Learned verifiers are better suited to supplementing these signals rather than replacing them when deterministic checks are present. The aggregation of multiple weaker validators can also close the generation-validation gap, but only if their errors are not perfectly correlated.

## 4. Tools and environment feedback: bringing reasoning into contact with reality

By only “thinking” inside the model, it’s easy to let false premises get passed along. Tool calls connect reasoning to the outside world: browsers can retrieve facts, code interpreters can run programs, databases can return real records, and the environment can tell the agent whether an action is valid.

WebGPT demonstrates how language models can search and reference information through a browser. ReAct further interleaves **Reasoning** and **Acting** in the same trajectory:

```text
Thought What information is currently missing?
Action calls search, code, or business tools
Observation reads the results returned by the environment
Thought Revise plan based on new evidence
```

![ReAct puts reasoning, action and environmental observation in the same loop](/img/posts/cs329a-self-improving-agents/react.png)

The key to this model is not to "call the tool", but to allow observation to actually change subsequent decisions. If the agent sticks to the original plan no matter what the tool returns, then the tool is just a decoration.

Coding tasks are particularly well-suited to learning from feedback from the environment: compilation errors, test results, and runtime exceptions can all provide more concrete signals than “is the answer good or bad?” Work such as RLEF further uses execution feedback to train the model to learn multi-step corrections. However, the execution environment also introduces new risks: untrusted code must be run in isolation, tool output may contain noise or hint injection, and the test cases themselves may be incomplete.

## 5. Planning and multi-step reasoning: searching an action tree

A long-range Agent task is not a question and answer, but a series of interdependent decisions. The previous step will change the environment, and the next step can only continue based on the new state. If you only follow a single path forward, it is easy for a local error to cause the entire task to fail.

LATS (Language Agent Tree Search) organizes Agent's action trajectories into trees and draws on Monte Carlo Tree Search:

1. **Selection**: Select nodes based on value and exploration rewards;
2. **Expansion**: Generate multiple possible next actions;
3. **Evaluation**: combines model value judgment and environmental feedback scoring;
4. **Backpropagation**: Pass the result back along the path;
5. **Reflection**: Summarize the reasons for failure and affect subsequent searches.

![LATS updates action tree using value function, UCT selection and postback](/img/posts/cs329a-self-improving-agents/lats-uct.png)

Common UCT forms are:

$$
\mathrm{UCT}(i)=\bar{X}_i+c\sqrt{\frac{\ln N}{n_i}}
$$

Among them, $\bar{X}_i$ represents the average value of the node, $N$ is the number of visits to the parent node, $n_i$ is the number of visits to the current node, and $c$ controls the balance between exploitation and exploration.

Tree search is not a free lunch. It is only worth investing in if the evaluator can reliably distinguish path quality; a weak discriminator will cause the search to spend more computing power in the wrong direction. For problems that can be split into independent subtasks, you can also use the planner to first decompose the plan, then let multiple executors execute it in parallel, and finally summarize the results.

![Planner breaks down tasks and executes them in parallel by multiple Executors](/img/posts/cs329a-self-improving-agents/sprint-framework.png)

## 6. From test-time expansion to training-time expansion

Test-time searches generate a wealth of data: candidate solutions, tool calls, validation scores, success trajectories, and failure reflections. The goal of train-time scaling is to precipitate these one-time calculations into model parameters.

A typical training closed loop is:

```text
Current strategy generation candidates
      ↓
Validator or environment gives feedback
      ↓
Filter Tracks/Assign Step Credits
      ↓
Supervised learning or reinforcement learning update strategy
      ↓
Evaluate on independent tasks before moving on to the next round
```

STaR is a representative idea: the model generates a reasoning process, and only continues training with reasoning that can lead to the correct answer; for failed samples, the explanation is regenerated under the condition of known answers. This iteration allows the model to learn more effective reasoning methods round by round.

Reinforcement learning further directly optimizes environmental rewards, but reasoning RL is prone to training instability, length speculation, reward hacking, or capability degradation. Work such as DAPO shows that seemingly small implementation choices such as sampling, cropping, length control, dynamic filtering, and batch construction can significantly affect the final effect. What is truly scalable here is not “run more RL”, but a reliable data-feedback-update pipeline.

## 7. Deep Research: From static RAG to dynamic search

Traditional RAGs are typically retrieved once before generation, jamming several documents into context. It has three typical limitations:

- The query comes from the original question and has not yet exposed real knowledge gaps in the reasoning;
- The search results may be too long, conflict with each other, or irrelevant to the current step;
- When new problems are discovered during subsequent reasoning, the system cannot actively search again.

Agentic search turns retrieval into an action in the reasoning process. The core idea of ​​Search-o1 is: the model pauses generation when it encounters a knowledge gap, puts forward a query, reads the document, then refines information related to the current reasoning through Reason-in-Documents, and finally continues to answer.

![Search-o1 dynamically retrieves and integrates external knowledge during reasoning](/img/posts/cs329a-self-improving-agents/search-o1-framework.png)

This makes Deep Research Agent no longer a "one search + one summary", but an iterative process: raising sub-questions, searching for evidence, comparing sources, discovering conflicts, supplementing searches, and forming supported conclusions. At the same time, it must also record sources, control retrieval costs, and avoid instructions in web content that hijack the Agent's goals.

## 8. How to evaluate long-range Agent?

The single-question accuracy rate cannot describe whether the Agent can stably complete real work. Long-term evaluation should at least observe simultaneously:

- **Success Rate**: Whether the final task is completed;
- **Task time span**: How long is the equivalent of human work;
- **Cost and Latency**: How many tokens are used, tool calls and actual time;
- **Resilience**: Can you roll back after a tool fails or the plan goes astray;
- **Validator Calibration**: Does high score really mean high success rate;
- **Security**: Whether it exceeds authority, leaks data, or performs irreversible operations.

If a task contains $n$ key steps, the independent success rate of each step is $p$, and the success rate of the entire link is approximately $p^n$. For example, each step has a 95% success rate, and the probability of success for all 20 consecutive steps is only about 36%. Although the steps are not independent in reality, this simplified model still illustrates that long-range tasks can amplify small unreliabilities.

*Measuring AI Ability to Complete Long Tasks* proposes an intuitive metric: how long it would typically take a human expert to complete a task that the model can complete with a 50% success rate. This time horizon is suitable for observing changes in capabilities over time, but it relies on specific task distributions and cannot be understood as a universal time commitment of the model on all real jobs.

## 9. A unified engineering architecture

Putting the previous content together, a groundable Self-Improving Agent usually contains the following components:

| Components | Responsibilities | Key Issues |
| --- | --- | --- |
| Generator / Policy | Generate answers or actions | Are the candidates diverse enough? |
| Environment / Tools | Returning true status and execution feedback | Is the feedback trustworthy and can be isolated? |
| Verifier / Reward | Judgment of results and process quality | Will it be overfitted or exploited? |
| Search / Controller | Allocating budget, scaling and pruning | What difficulty level is worth continuing to search for? |
| Memory / Buffer | Save traces, evidence and experience | How to avoid the accumulation of false memories? |
| Learner | Update strategy with feedback | Do improvements generalize across tasks? |
| Evaluator | Measure changes on independent tasks | Are quality, cost and safety measured simultaneously? |

The overall loop can be written as the following pseudocode:

```python
while budget_remaining:
    candidates = policy.generate(state)
    observations = environment.execute(candidates)
    scores = verifier.evaluate(candidates, observations)
    state = controller.select_or_revise(state, candidates, scores)
    replay_buffer.add(candidates, observations, scores)

policy.update(replay_buffer.filtered_trajectories())
evaluate_on_held_out_tasks(policy)
```

The most important line here is not `policy.update`, but the verification and filtering before feedback enters the buffer. Once error feedback is repeatedly learned by the model, it will change from a failure to stable behavior.

## 10. Conclusion: Feedback quality determines the upper limit of improvement

The core of Self-Improving AI Agents is not to let the model "think for longer", but to establish a verifiable closed loop:

1. Calculate and improve candidate coverage during testing;
2. The validator and environment feedback are responsible for identifying good trajectories;
3. Search and plan more promising ways to invest the budget;
4. Tools allow models to obtain external evidence and actionable feedback;
5. Training to accumulate successful experience into the next round of capabilities;
6. Long-range evaluation confirms whether this improvement is reliable, economical and safe.

The upper limit of its capabilities is ultimately limited by the quality of the feedback. Without reliable verifiers, more sampling will only produce more unselectable answers; without independent evaluation, self-training may just amplify the deviation; without safety boundaries, the stronger the ability to act, the higher the cost of errors.

What is truly worth pursuing is not the slogan of “infinite self-improvement”, but an engineering system that can be measured, tracked, and corrected in every round of changes.

## References

- [Stanford CS329A: Self-Improving AI Agents](https://cs329a.stanford.edu/)
- [Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters](https://arxiv.org/abs/2408.03314)
- [Large Language Monkeys: Scaling Inference Compute with Repeated Sampling](https://arxiv.org/abs/2407.21787)
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050)
- [Shrinking the Generation-Verification Gap with Weak Verifiers](https://arxiv.org/abs/2506.18203)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [WebGPT: Browser-assisted Question-answering with Human Feedback](https://arxiv.org/abs/2112.09332)
- [RLEF: Grounding Code LLMs in Execution Feedback with Reinforcement Learning](https://arxiv.org/abs/2410.02089)
- [Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models](https://arxiv.org/abs/2310.04406)
- [When is Tree Search Useful for LLM Planning?](https://arxiv.org/abs/2402.10890)
- [Self-Taught Reasoner: Bootstrapping Reasoning With Reasoning](https://arxiv.org/abs/2203.14465)
- [DAPO: An Open-Source LLM Reinforcement Learning System at Scale](https://arxiv.org/abs/2503.14476)
- [Search-o1: Agentic Search-Enhanced Large Reasoning Models](https://arxiv.org/abs/2501.05366)
- [Measuring AI Ability to Complete Long Tasks](https://arxiv.org/abs/2503.14499)
