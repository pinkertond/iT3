---
schema_version: 0.1.0
id: task.it3.upgrade
kind: task
title: Prove upgrade and release compatibility
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.roundtrip
- type: depends_on
  to: task.it3.inspector
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Prove upgrade and release compatibility
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
  - Collect child-task checks and independent review evidence for AC-01, AC-05, AC-08.
  requires_independent_review: true
---

# Prove upgrade and release compatibility

**Suggested owner.** Release maintainer. **Coverage.** AC-01, AC-05, AC-08.

- [6.1 Run the compatibility matrix](06-01-matrix.md) — Evidence for stock host, current iT3 host, unsupported major, two clients and disabled extension.
- [6.2 Rehearse an upstream update](06-02-rehearse.md) — Isolated merge of an upstream candidate and a reconciled fork exception report.
- [6.3 Prepare a candidate Result](06-03-release.md) — Source revision, checks, migration backup, tagged candidate and rollback evidence for owner review.

[Plan](../plan.md)
