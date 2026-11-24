---
schema_version: 0.1.0
id: task.it3.observations
kind: task
title: Normalize provider observations
purpose: Read-only aggregate and optional itemized observations with timestamp, provider, revision and provenance.
parent: task.it3.visibility
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
  expected_output: Read-only aggregate and optional itemized observations with timestamp, provider, revision and provenance.
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
  - Exercise itemized, aggregate-only, unavailable and stale fixtures; deferred counts do not inflate used context.
  requires_independent_review: true
---

# Normalize provider observations

**Output.** Read-only aggregate and optional itemized observations with timestamp, provider, revision and provenance.

**Acceptance check.** Exercise itemized, aggregate-only, unavailable and stale fixtures; deferred counts do not inflate used context.

**Suggested owner.** Provider integration maintainer. **Specification coverage.** AC-07.

[Parent task](05-visibility.md) · [Plan](../plan.md)
