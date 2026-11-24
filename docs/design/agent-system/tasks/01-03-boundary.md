---
schema_version: 0.1.0
id: task.it3.boundary
kind: task
title: Select the narrowest host boundary
purpose: Record the chosen RPC, MCP and UI seams, with candidate paths and alternatives.
parent: task.it3.baseline
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.probe
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Record the chosen RPC, MCP and UI seams, with candidate paths and alternatives.
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
  - Review existing ACP/MCP and outside-client options, count core edits and demonstrate why any new bridge is needed.
  requires_independent_review: true
---

# Select the narrowest host boundary

**Output.** Record the chosen RPC, MCP and UI seams, with candidate paths and alternatives.

**Acceptance check.** Review existing ACP/MCP and outside-client options, count core edits and demonstrate why any new bridge is needed.

**Suggested owner.** Host maintainer. **Specification coverage.** AC-04, AC-06, AC-08.

[Parent task](01-baseline.md) · [Plan](../plan.md)
