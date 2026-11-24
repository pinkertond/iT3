---
schema_version: 0.1.0
id: task.it3.bindings
kind: task
title: Bind and replace an occupant
purpose: Create, list, resolve and atomically rebind a seat using the selected environment and thread IDs.
parent: task.it3.seats
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.store
- type: depends_on
  to: task.it3.probe
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Create, list, resolve and atomically rebind a seat using the selected environment and thread IDs.
  scope:
    paths:
    - it3/extensions/agents/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - A renamed thread still resolves; two concurrent writers produce one winner; wrong project and stale generation fail.
  requires_independent_review: true
---

# Bind and replace an occupant

**Output.** Create, list, resolve and atomically rebind a seat using the selected environment and thread IDs.

**Acceptance check.** A renamed thread still resolves; two concurrent writers produce one winner; wrong project and stale generation fail.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-02, AC-05, AC-06.

[Parent task](03-seats.md) · [Plan](../plan.md)
