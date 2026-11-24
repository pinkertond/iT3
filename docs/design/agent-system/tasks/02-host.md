---
schema_version: 0.1.0
id: task.it3.host
kind: task
title: Build the bundled extension contract
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.boundary
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Build the bundled extension contract
  scope:
    paths:
    - it3/extension-host/**
    - apps/web/src/**
    - apps/server/src/**
    - packages/contracts/src/**
    - docs/design/agent-system/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - Collect child-task checks and independent review evidence for AC-01, AC-06, AC-08.
  requires_independent_review: true
---

# Build the bundled extension contract

**Suggested owner.** Host maintainer. **Coverage.** AC-01, AC-06, AC-08.

- [2.1 Register and negotiate contributions](02-01-manifest.md) — Versioned manifest, explicit allowlist and environment capability response.
- [2.2 Preserve caller authority in the adapter](02-02-authorization.md) — Typed read and mutation operations carrying user or thread identity and target scope.
- [2.3 Mount a project view and command](02-03-slots.md) — One shared renderer slot and command contribution with stable navigation IDs.

[Plan](../plan.md)
