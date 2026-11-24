---
schema_version: 0.1.0
id: task.it3.roundtrip
kind: task
title: Demonstrate the first round trip
purpose: A project thread asks the Backend seat a question and receives a correlated response.
parent: task.it3.handoffs
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.address
- type: depends_on
  to: task.it3.roster
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: A project thread asks the Backend seat a question and receives a correlated response.
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
  - Use fixtures in CI and an approved two-harness smoke test on a paired host. Render queued, unknown and acknowledged distinctly.
  requires_independent_review: true
---

# Demonstrate the first round trip

**Output.** A project thread asks the Backend seat a question and receives a correlated response.

**Acceptance check.** Use fixtures in CI and an approved two-harness smoke test on a paired host. Render queued, unknown and acknowledged distinctly.

**Suggested owner.** Extension maintainer. **Specification coverage.** AC-03, AC-04, AC-06.

[Parent task](04-handoffs.md) · [Plan](../plan.md)
