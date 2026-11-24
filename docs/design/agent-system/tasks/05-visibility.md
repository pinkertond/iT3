---
schema_version: 0.1.0
id: task.it3.visibility
kind: task
title: Report context honestly
purpose: Complete the following independently verifiable work package.
parent: commission.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.roster
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Report context honestly
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
  - Collect child-task checks and independent review evidence for AC-07.
  requires_independent_review: true
---

# Report context honestly

**Suggested owner.** Provider integration maintainer. **Coverage.** AC-07.

- [5.1 Normalize provider observations](05-01-observations.md) — Read-only aggregate and optional itemized observations with timestamp, provider, revision and provenance.
- [5.2 Show supported context fields](05-02-inspector.md) — An accessible per-seat view of the current context and any previously captured observations.

[Plan](../plan.md)
