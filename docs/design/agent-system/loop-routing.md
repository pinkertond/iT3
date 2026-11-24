---
schema_version: 0.1.0
id: spec.it3.loop-routing
kind: specification
title: Model choice, context and feedback
purpose: Match the cost and capability of each turn to the work it has to do.
parent: spec.it3.active-project-loop
maturity: specified
lifecycle: proposed
details:
  acceptance_criteria:
    - id: ROUTE-01
      criterion: A routine step uses a deterministic check or the least costly eligible model with adequate capability.
      evidence_method: Replay an urgent mechanical check and a low-priority reasoning task with frontier access disabled.
    - id: ROUTE-02
      criterion: Each step has a bounded context and retry allowance. A failed verification cannot silently promote the model or expand the budget.
      evidence_method: Simulate oversized history, unavailable context telemetry and repeated identical failures. Inspect the resulting decision records.
---

# Model choice, context and feedback

**Priority orders work. Capability determines model choice.** An urgent formatting check can run the formatter immediately with zero model tokens. A background design review that genuinely needs a frontier model can wait for its allowance.

1. **Choose a route.** Prefer a deterministic tool when it satisfies the completion check. Otherwise select the lowest expected cost per _verified result_ among allowed models that meet the step’s capability, tool, context and quality requirements. Fall back to configured model tiers when outcome data is sparse.
2. **Build the brief at dispatch.** Resolve the task ID to the current request, constraints, next step, checkpoint, completion check and links. Load additional source sections on demand. Budget for existing context, instructions, tools, retrieved material and output headroom. Include the cost of any model-assisted summarization. Label measured and estimated quantities separately.
3. **Escalate deliberately.** Try a narrower brief, a deterministic check or a smaller subtask when appropriate. Choose a stronger model only for a recorded capability gap or verification failure, within the project’s tier ceiling and remaining budget. Repeated failures without new evidence yield **Needs you**. Paused or exhausted work cannot escalate.
4. **Learn from completed steps.** Link the decision to the actual run, model, input and output usage, price source, verification, retries and rework. Compare similar tasks by total cost per accepted result and time to acceptance. Keep unpriced or ambiguously attributed work visible. Suggested policy changes go to the operator.

**Evidence available today.** iT3 has provider allowance snapshots, provider-dependent native context observations, and a project usage report based on attributable chat sessions. Per-step reservations and exact run attribution are prerequisites for automatic budget enforcement. A chat shared by several tasks is insufficient evidence to debit one task for its entire history. [Current project-agent behavior](../../user/it3-project-agents.md)

[Automatic work in active projects](active-project-loop.md)
