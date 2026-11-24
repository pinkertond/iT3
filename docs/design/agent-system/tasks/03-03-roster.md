---
schema_version: 0.1.0
id: task.it3.roster
kind: task
title: Expose roster and seat inspector
purpose: Accessible project roster showing occupant, generation, role and last known presence.
parent: task.it3.seats
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.bindings
- type: depends_on
  to: task.it3.slots
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Accessible project roster showing occupant, generation, role and last known presence.
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
  - Two clients see one edit; switching environments separates identical names; an offline client cannot write.
  requires_independent_review: true
---

# Expose roster and seat inspector

**Output.** Accessible project roster showing occupant, generation, role and last known presence.

**Acceptance check.** Two clients see one edit; switching environments separates identical names; an offline client cannot write.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-02, AC-05, AC-06.

[Parent task](03-seats.md) · [Plan](../plan.md)
