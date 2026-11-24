---
schema_version: 0.1.0
id: task.it3.rehearse
kind: task
title: Rehearse an upstream update
purpose: Isolated merge of an upstream candidate and a reconciled fork exception report.
parent: task.it3.upgrade
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.matrix
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Isolated merge of an upstream candidate and a reconciled fork exception report.
  scope:
    paths:
    - it3/**
    - docs/**
    - scripts/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - Diff the candidate against its merge base, classify new paths, replay each affected ledger check and document conflicts.
  requires_independent_review: true
---

# Rehearse an upstream update

**Output.** Isolated merge of an upstream candidate and a reconciled fork exception report.

**Acceptance check.** Diff the candidate against its merge base, classify new paths, replay each affected ledger check and document conflicts.

**Suggested owner.** Release maintainer. **Specification coverage.** AC-01, AC-05, AC-08.

[Parent task](06-upgrade.md) · [Plan](../plan.md)
