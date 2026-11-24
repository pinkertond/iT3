---
schema_version: 0.1.0
id: task.it3.inspector
kind: task
title: Show supported context fields
purpose: An accessible per-seat view of the current context and any previously captured observations.
parent: task.it3.visibility
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.observations
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: An accessible per-seat view of the current context and any previously captured observations.
  scope:
    paths:
    - it3/extensions/agents/**
    - it3/extension-host/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - A Codex aggregate produces no invented categories. A missing historical sample is labelled unavailable.
  requires_independent_review: true
---

# Show supported context fields

**Output.** An accessible per-seat view of the current context and any previously captured observations.

**Acceptance check.** A Codex aggregate produces no invented categories. A missing historical sample is labelled unavailable.

**Suggested owner.** Provider integration maintainer. **Specification coverage.** AC-07.

[Parent task](05-visibility.md) · [Plan](../plan.md)
