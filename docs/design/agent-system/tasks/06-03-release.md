---
schema_version: 0.1.0
id: task.it3.release
kind: task
title: Prepare a candidate Result
purpose: Source revision, checks, migration backup, tagged candidate and rollback evidence for owner review.
parent: task.it3.upgrade
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.rehearse
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Source revision, checks, migration backup, tagged candidate and rollback evidence for owner review.
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
  - Cross-check all eight criteria and confirm macOS bundle identity, version and restoration on a disposable profile. Installation follows a separate release decision.
  requires_independent_review: true
---

# Prepare a candidate Result

**Output.** Source revision, checks, migration backup, tagged candidate and rollback evidence for owner review.

**Acceptance check.** Cross-check all eight criteria and confirm macOS bundle identity, version and restoration on a disposable profile. Installation follows a separate release decision.

**Suggested owner.** Release maintainer. **Specification coverage.** AC-01, AC-05, AC-08.

[Parent task](06-upgrade.md) · [Plan](../plan.md)
