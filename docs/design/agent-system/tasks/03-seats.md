---
schema_version: 0.1.0
id: task.it3.seats
kind: task
title: Implement the project seat directory
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.authorization
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Implement the project seat directory
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
  - Collect child-task checks and independent review evidence for AC-02, AC-05, AC-06.
  requires_independent_review: true
---

# Implement the project seat directory

**Suggested owner.** Extension maintainer. **Coverage.** AC-02, AC-05, AC-06.

- [3.1 Persist project-owned seat records](03-01-store.md) — Versioned extension schema, uniqueness indices, transactions and backup migration path.
- [3.2 Bind and replace an occupant](03-02-bindings.md) — Create, list, resolve and atomically rebind a seat using the selected environment and thread IDs.
- [3.3 Expose roster and seat inspector](03-03-roster.md) — Accessible project roster showing occupant, generation, role and last known presence.

[Plan](../plan.md)
