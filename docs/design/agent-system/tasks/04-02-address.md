---
schema_version: 0.1.0
id: task.it3.address
kind: task
title: Expose scoped seat operations to agents
purpose: Named-seat lookup, handoff, acknowledgement and return via the authenticated caller.
parent: task.it3.handoffs
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.outbox
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Named-seat lookup, handoff, acknowledgement and return via the authenticated caller.
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
  - Two agents with similar names produce a selection; forged sender, late acknowledgement and revoked grant are rejected.
  requires_independent_review: true
---

# Expose scoped seat operations to agents

**Output.** Named-seat lookup, handoff, acknowledgement and return via the authenticated caller.

**Acceptance check.** Two agents with similar names produce a selection; forged sender, late acknowledgement and revoked grant are rejected.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-03, AC-04, AC-06.

[Parent task](04-handoffs.md) · [Plan](../plan.md)
