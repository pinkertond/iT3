---
schema_version: 0.1.0
id: task.it3.store
kind: task
title: Persist project-owned seat records
purpose: Versioned extension schema, uniqueness indices, transactions and backup migration path.
parent: task.it3.seats
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
  expected_output: Versioned extension schema, uniqueness indices, transactions and backup migration path.
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
  - Restart after migration; load a newer unsupported schema; confirm native T3 tables are untouched.
  requires_independent_review: true
---

# Persist project-owned seat records

**Output.** Versioned extension schema, uniqueness indices, transactions and backup migration path.

**Acceptance check.** Restart after migration; load a newer unsupported schema; confirm native T3 tables are untouched.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-02, AC-05, AC-06.

[Parent task](03-seats.md) · [Plan](../plan.md)
