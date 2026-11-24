---
schema_version: 0.1.0
id: task.it3.manifest
kind: task
title: Register and negotiate contributions
purpose: Versioned manifest, explicit allowlist and environment capability response.
parent: task.it3.host
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
  expected_output: Versioned manifest, explicit allowlist and environment capability response.
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
  - A supported manifest loads once, duplicate IDs fail visibly, and clients handle missing or incompatible API majors.
  requires_independent_review: true
---

# Register and negotiate contributions

**Output.** Versioned manifest, explicit allowlist and environment capability response.

**Acceptance check.** A supported manifest loads once, duplicate IDs fail visibly, and clients handle missing or incompatible API majors.

**Suggested owner.** Host maintainer. **Specification coverage.** AC-01, AC-06, AC-08.

[Parent task](02-host.md) · [Plan](../plan.md)
