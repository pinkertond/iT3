---
schema_version: 0.1.0
id: task.it3.baseline
kind: task
title: Prove the native seams
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Prove the native seams
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
  - Collect child-task checks and independent review evidence for AC-04, AC-06, AC-08.
  requires_independent_review: true
---

# Prove the native seams

**Suggested owner.** Host maintainer. **Coverage.** AC-04, AC-06, AC-08.

- [1.1 Inventory host touchpoints](01-01-inventory.md) — Map native contracts, authorization entry points and current fork changes to an owner and upstream anchor.
- [1.2 Probe native dispatch and retries](01-02-probe.md) — Produce a replayable fixture for lookup, queue, read, duplicate request and lost reply against the release baseline.
- [1.3 Select the narrowest host boundary](01-03-boundary.md) — Record the chosen RPC, MCP and UI seams, with candidate paths and alternatives.

[Plan](../plan.md)
