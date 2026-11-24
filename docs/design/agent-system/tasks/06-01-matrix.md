---
schema_version: 0.1.0
id: task.it3.matrix
kind: task
title: Run the compatibility matrix
purpose: Evidence for stock host, current iT3 host, unsupported major, two clients and disabled extension.
parent: task.it3.upgrade
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: task.it3.roundtrip
- type: depends_on
  to: task.it3.inspector
details:
  commission_ref: commission.it3.agent-system
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  expected_output: Evidence for stock host, current iT3 host, unsupported major, two clients and disabled extension.
  scope:
    paths:
    - it3/**
    - docs/**
    - scripts/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  check_instructions:
  - Verify permissions after reconnect, preservation of native chats and provider selection after disabling, and migration recovery.
  requires_independent_review: true
---

# Run the compatibility matrix

**Output.** Evidence for stock host, current iT3 host, unsupported major, two clients and disabled extension.

**Acceptance check.** Verify permissions after reconnect, preservation of native chats and provider selection after disabling, and migration recovery.

**Suggested owner.** Release maintainer. **Specification coverage.** AC-01, AC-05, AC-08.

[Parent task](06-upgrade.md) · [Plan](../plan.md)
