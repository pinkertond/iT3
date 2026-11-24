---
schema_version: 0.1.0
id: task.it3.outbox
kind: task
title: Implement receipt and outbox transactions
purpose: Durable request fingerprint, correlation ID, state transitions and retry/reconciliation worker.
parent: task.it3.handoffs
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.bindings
- type: depends_on
  to: task.it3.authorization
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Durable request fingerprint, correlation ID, state transitions and retry/reconciliation worker.
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
  - Crash before send, after native acceptance and after storing receipt. Retry ten concurrent duplicate requests; count actual messages.
  requires_independent_review: true
---

# Implement receipt and outbox transactions

**Output.** Durable request fingerprint, correlation ID, state transitions and retry/reconciliation worker.

**Acceptance check.** Crash before send, after native acceptance and after storing receipt. Retry ten concurrent duplicate requests; count actual messages.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-03, AC-04, AC-06.

[Parent task](04-handoffs.md) · [Plan](../plan.md)
