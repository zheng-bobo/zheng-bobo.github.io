---
title: "Anthropic Agent Evolution III: The Planner–Generator–Evaluator Quality Loop"
date: 2026-09-12 21:06:45 +0200
slug: "anthropic-agent-evolution-3-planner-generator-evaluator"
categories: [AI Agents]
tags: [Anthropic Agent Evolution, Multi-Agent, Evaluator, Agent Harness, Playwright, Software Engineering]
toc: true
---

The first harness let an agent continue across context windows, but continuity is not quality. Generators routinely mistake “mostly runs” for “good enough,” especially in subjective product and design work.

Anthropic's next step separated planning, generation, and evaluation so that an external evaluator became a source of evidence the generator had to respond to.

<!--more-->

> **Series**: [I. From Workflows to Agents](/en/post/anthropic-agent-evolution-1-from-workflows-to-agents/) · [II. Context Reset and Structured Handoff](/en/post/anthropic-agent-evolution-2-context-reset-and-handoff/) · **III. Planner–Generator–Evaluator** · [IV. Managed Agent Runtime](/en/post/anthropic-agent-evolution-4-managed-agent-runtime/)

## 1. Two Connected Problems

Anthropic's experiments addressed two apparently different goals:

1. produce high-quality frontend designs rather than generic templates;
2. build complete applications with little human intervention.

Both expose the same weakness: **a generator cannot reliably judge its own output.** Even on verifiable work, models miss edge cases. On subjective dimensions—taste, product depth, usability—they grade themselves even more generously.

The solution is not merely asking the generator to be more critical. It is separating evaluation and calibrating that evaluator independently.

## 2. Boundaries Between Three Agents

### 2.1 Planner

The planner expands a short request into a complete product specification: users, scope, primary experience, feature slices, and high-level technical direction. It avoids prematurely fixing implementation details.

### 2.2 Generator

The generator builds from the spec in sprints, implements groups of related features, preserves milestones in Git, and chooses whether to refine the current direction or pivot based on evaluator feedback.

### 2.3 Evaluator

The evaluator is not a static code reviewer. It uses Playwright to operate the running application, covering UI, APIs, and database state before grading product depth, functionality, visual design, and code quality.

The loop becomes:

> Planner defines what to build → Generator implements → Evaluator tests real behavior → Generator fixes → repeat until the quality bar is met

## 3. Make “Good” Gradable

“Is this beautiful?” is difficult to score consistently. “Does this follow our explicit design principles?” can be evaluated dimension by dimension.

Anthropic used four frontend criteria:

- **Design quality**: do color, typography, layout, and imagery form a coherent whole?
- **Originality**: are there deliberate custom choices instead of defaults and familiar AI patterns?
- **Craft**: are hierarchy, spacing, contrast, and visual execution competent?
- **Functionality**: can users understand and complete the core tasks?

A rubric is not automatically reliable. The evaluator must be calibrated with few-shot examples and detailed rationales, reducing score drift and teaching it to search for counterexamples rather than rationalize defects away.

## 4. How the Generator–Evaluator Loop Works

![The generator–evaluator quality loop](/img/posts/anthropic-agent-evolution/generator-evaluator-loop.png)

The full process is:

1. define dimensions, thresholds, and weights;
2. calibrate the evaluator with few-shot examples;
3. generate the first version;
4. launch the product and let the evaluator operate it;
5. score every criterion and produce actionable critique;
6. refine when scores trend well, or pivot when the direction stalls;
7. stop on target quality, a plateau, or a budget limit, then select the best historical version.

The value does not come from merely running more turns. Every cycle must obtain new ground truth from the environment. If the evaluator only reads the generator's summary, the same bias remains inside the loop.

## 5. Sprint Contracts: Define Done Before Coding

A product spec is too high-level to test a single sprint. The generator and evaluator therefore negotiate a sprint contract before implementation:

- the exact behaviors in scope;
- how each behavior will be tested;
- conditions that constitute failure;
- explicit non-goals for the sprint.

The contract bridges user stories and executable verification. If any criterion falls below a hard threshold, the sprint fails and the generator receives concrete findings.

Agents exchange specs, contracts, evaluations, and responses through files. Structured communication works across both agent and session boundaries.

## 6. Why Must the Evaluator Behave Like a User?

A screenshot cannot prove interaction. Code review cannot prove that the complete path works. The evaluator must click real controls, inspect APIs and database state, exercise every contract criterion, and report failures at the level of behavior and condition.

In Anthropic's example, the solo output looked complete but its core game mode did not work. The full harness still had rough edges, yet the central path was playable. The improvement came from an external feedback loop, not longer self-reflection.

## 7. Cost and Benefit

The reported solo run took roughly 20 minutes and cost about $9. The full harness ran for about six hours and cost around $200—more than twenty times as much.

This architecture is therefore appropriate when output value is high, failure is costly, criteria can support a reliable evaluator, and simpler agents have already failed the quality bar.

## 8. Harnesses Must Evolve With Models

Every harness component encodes an assumption: “the model cannot do this on its own.” Model upgrades can invalidate that assumption. A reset needed for one generation's context anxiety may become dead weight for the next.

Treat harness evolution like an ablation study: remove one component at a time and measure quality, cost, and speed. The goal is not maximal process. It is **the minimum structure that unlocks the current model while turning its remaining weaknesses into verifiable feedback.**

The next article moves from quality loops to runtime architecture: durability, recovery, and connecting a managed agent to different execution environments.

## Sources

- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

