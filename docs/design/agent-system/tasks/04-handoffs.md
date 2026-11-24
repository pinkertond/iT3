---
schema_version: 0.1.0
id: task.it3.handoffs
kind: task
title: Deliver and reconcile handoffs
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
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
  expected_output: Deliver and reconcile handoffs
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
  - Collect child-task checks and independent review evidence for AC-03, AC-04, AC-06.
  requires_independent_review: true
---

# Deliver and reconcile handoffs

**Suggested owner.** Extension maintainer. **Coverage.** AC-03, AC-04, AC-06.

- [4.1 Implement receipt and outbox transactions](04-01-outbox.md) — Durable request fingerprint, correlation ID, state transitions and retry/reconciliation worker.
- [4.2 Expose scoped seat operations to agents](04-02-address.md) — Named-seat lookup, handoff, acknowledgement and return via the authenticated caller.
- [4.3 Demonstrate the first round trip](04-03-roundtrip.md) — A project thread asks the Backend seat a question and receives a correlated response.

[Plan](../plan.md)
