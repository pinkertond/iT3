---
schema_version: 0.1.0
id: task.it3.authorization
kind: task
title: Preserve caller authority in the adapter
purpose: Typed read and mutation operations carrying user or thread identity and target scope.
parent: task.it3.host
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.manifest
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Typed read and mutation operations carrying user or thread identity and target scope.
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
  - Denied client and MCP calls produce no write; a broader target mode is rejected.
  requires_independent_review: true
---

# Preserve caller authority in the adapter

**Output.** Typed read and mutation operations carrying user or thread identity and target scope.

**Acceptance check.** Denied client and MCP calls produce no write; a broader target mode is rejected.

**Suggested owner.** Host maintainer. **Specification coverage.** AC-01, AC-06, AC-08.

[Parent task](02-host.md) · [Plan](../plan.md)
