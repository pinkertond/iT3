---
schema_version: 0.1.0
id: task.it3.probe
kind: task
title: Probe native dispatch and retries
purpose: Produce a replayable fixture for lookup, queue, read, duplicate request and lost reply against the release baseline.
parent: task.it3.baseline
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.inventory
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Produce a replayable fixture for lookup, queue, read, duplicate request and lost reply against the release baseline.
  scope:
    paths:
    - docs/design/agent-system/**
    - it3/fixtures/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - Record actual inputs, rights checks, idempotency key retention and what a receipt proves. Repeating a send must be safe or explicitly uncertain.
  requires_independent_review: true
---

# Probe native dispatch and retries

**Output.** Produce a replayable fixture for lookup, queue, read, duplicate request and lost reply against the release baseline.

**Acceptance check.** Record actual inputs, rights checks, idempotency key retention and what a receipt proves. Repeating a send must be safe or explicitly uncertain.

**Suggested owner.** Host maintainer. **Specification coverage.** AC-04, AC-06, AC-08.

[Parent task](01-baseline.md) · [Plan](../plan.md)
