---
title: "Anthropic Agent Evolution II: Context Reset and Structured Handoff"
date: 2026-09-12 21:07:45 +0200
slug: "anthropic-agent-evolution-2-context-reset-and-handoff"
categories: [AI Agents]
tags: [Anthropic Agent Evolution, Agent Harness, Context Engineering, Context Reset, Long-Running Agents]
toc: true
---

The central tension in long-running work is not whether a model can write code. It is that a task may last hours or days while every context window is finite. Replaying the entire history eventually creates both capacity and noise problems.

Anthropic's first long-running agent harness answered with a simple principle: **reset conversational context, but externalize project state into structured artifacts that the next agent can recover.**

<!--more-->

> **Series**: [I. From Workflows to Agents](/en/post/anthropic-agent-evolution-1-from-workflows-to-agents/) · **II. Context Reset and Structured Handoff** · [III. Planner–Generator–Evaluator](/en/post/anthropic-agent-evolution-3-planner-generator-evaluator/) · [IV. Managed Agent Runtime](/en/post/anthropic-agent-evolution-4-managed-agent-runtime/)

## 1. Why Is Compaction Not Enough?

Context compaction summarizes older conversation while keeping the same agent and session. It is continuous, inexpensive, and operationally simple, but it does not guarantee a clean slate:

- a summary can omit details whose importance becomes clear only later;
- stale plans, incorrect assumptions, and noise can survive compression;
- the model may still sense an approaching limit and wrap up prematurely;
- a new turn may see substantial progress and incorrectly declare victory.

Context reset clears the window and starts a fresh agent. The cost is that recovery now depends on a complete handoff.

| Approach | Advantages | Risks |
| --- | --- | --- |
| Context compaction | Preserves continuity; simpler orchestration; lower latency and token overhead | Summaries may distort state; stale assumptions survive; no clean slate |
| Context reset | Removes accumulated noise; each run can refocus | Requires excellent handoff artifacts; adds orchestration and recovery work |

The techniques can coexist: compact within a phase, then reset at meaningful boundaries or when context quality degrades.

## 2. Two Roles: Initializer and Coding Agent

### 2.1 Initializer Agent

The first run establishes the environment instead of rushing into implementation:

- `feature_list.json` records complete features, acceptance steps, and status.
- `claude-progress.txt` records progress, test results, known issues, and next steps.
- An initial Git commit creates a traceable and recoverable baseline.
- `init.sh` standardizes startup and basic verification.

The feature list turns “finish the product” from a subjective impression into external facts that begin in a failing state and must be verified one by one.

### 2.2 Coding Agent

Every fresh context follows the same protocol:

1. read the directory, Git history, progress log, and feature list;
2. run `init.sh` and a basic end-to-end check;
3. choose one high-priority failing feature;
4. implement and validate it in the real environment;
5. change `passes` only when evidence is sufficient;
6. write progress, commit, and leave a clean state.

![The complete context-reset and structured-handoff loop](/img/posts/anthropic-agent-evolution/structured-handoff.png)

## 3. What Does a Structured Handoff Carry?

A strong handoff is not a vague prose summary. It is a set of mutually checking state layers:

- **Spec / feature list** says what the complete target is.
- **Progress log** says what the previous run attempted and where risks remain.
- **Git history** says what actually changed.
- **Code and tests** are the final source of truth for current system behavior.
- **Startup scripts** say how to restore a verifiable environment.

Context reset cleans the model's temporary workspace; structured handoff preserves durable project state outside the model.

> **Fresh context + durable artifacts + ground-truth tests = sustainable long-running execution**

## 4. Why One Feature at a Time?

A bare agent tends to one-shot an application, leaving a half-built state when context expires. The next agent cannot easily reconstruct the design intent or determine which parts are trustworthy.

Incremental work constrains each session to a mergeable state: the diff is understandable, completion maps to executable checks, and the session does not leave unrelated damage behind.

This resembles an effective engineering handoff. Teams do not share every conversation; they share issues, commits, tests, and a runnable system.

## 5. Testing Is Part of the Handoff

Model self-evaluation is insufficient. Unit tests and `curl` can still miss broken user journeys. For web applications, an agent should use browser automation to click, type, and observe UI and backend state as a user would.

“Tests passed” therefore cannot be prose in a progress file. It must correspond to reproducible steps and environmental feedback. Each new session begins with smoke tests; if the previous session damaged the baseline, repair comes before new feature work.

## 6. Limits of This Generation

Initializer + coding agent solves cross-context continuity, but not judgment:

- generators remain too optimistic about their own work;
- subjective quality does not fit a single pass/fail field;
- complex applications need checks and balances across planning, implementation, and QA;
- harness components can become obsolete as models improve.

That leads directly to the next stage: separating the agent doing the work from the agent judging it in a Planner–Generator–Evaluator system.

## Sources

- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)

