---
schema_version: 0.1.0
id: commission.it3.agent-system
kind: commission
title: Candidate Commission for the agent extension
purpose: Define the implementation boundary and the Result that would satisfy it.
parent: intent.it3.updatable-agents
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: plan.it3.agent-system
details:
  mission: Demonstrate a shared roster and a verified cross-agent handoff on an upgradeable iT3 host.
  specification_refs:
  - id: spec.it3.agent-system
    revision: f3a56e8648e7b0293e896754e9be3fc312282796
  plan_ref:
    id: plan.it3.agent-system
    revision: c76d03438d4dba7d30c692cd8f8d90405ebd8bdf
  scope:
    paths:
    - it3/**
    - apps/server/src/**
    - apps/web/src/**
    - packages/contracts/src/**
    - scripts/**
    - docs/**
    operations:
    - read
    - propose-change
    - run-approved-checks
    - submit-result
    - request-review
    - edit-design
    - query-context
  budget:
    max_usd: 0
    max_minutes: 480
    max_concurrency: 1
  authorized_seat_kinds:
  - builder
  - reviewer
  risk_level: normal
---

# Candidate Commission for the agent extension

**Standing:** draft for review. The budget fields describe a proposed fixture-only envelope of one concurrent seat, eight hours and zero metered provider spend. Live-provider checks, release and deployment require their own decision. The owner can revise the budget and roles before admission.

**Expected Result:** one working build demonstrating the eight specification criteria, an independently checked compatibility report, a trace of a cross-seat reply and a verified rollback path. Reserve `result.it3.agent-system` for the candidate that carries actual artifact revisions and evidence. Add the typed `expected_result` link when that record exists. Until then the Commission is incomplete for execution. The acceptance reviewer will compare evidence with the pinned criteria before separate integration and release decisions.
