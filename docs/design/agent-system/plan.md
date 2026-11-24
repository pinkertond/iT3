---
schema_version: 0.1.0
id: plan.it3.agent-system
kind: plan
title: Build and verify the iT3 agent extension
purpose: Deliver a two-seat handoff while bounding the fork changes that upstream updates must reconcile.
parent: intent.it3.updatable-agents
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: depends_on
  to: spec.it3.agent-system
details:
  specification_refs:
  - id: spec.it3.agent-system
    revision: f3a56e8648e7b0293e896754e9be3fc312282796
  approach: Prove native behavior, introduce a versioned host boundary, deliver seats and durable handoffs, then verify provider reporting and upstream upgrades.
  acceptance_strategy: Each leaf has a concrete check. Demonstrate AC-01 through AC-08 on an isolated branch and two clients before proposing a release.
  change_scope:
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
  risks:
  - A native send may commit before its transport receipt reaches the extension.
  - An older or stock environment may lack the extension contract.
  - Provider telemetry varies by model, version and session state.
---

# Build and verify the iT3 agent extension

**First deliverable for review.** A reproducible baseline probe for native thread dispatch, followed by a roster that binds two named seats to existing threads. The first end-to-end demo asks a question across those seats, records the receiving thread, and returns an explicit acknowledgement.

**Sequencing.** Complete the baseline before extending T3. The renderer slot and authorization adapter can proceed in parallel after manifest negotiation. Seat storage then feeds both the roster and outbox. Context inspection can proceed alongside handoff delivery. The two-Mac and upstream-merge rehearsals gate release. Parent tasks close when their listed children pass; use leaf dependencies to schedule work.

**Milestones.** M1 proves the existing infrastructure (phase 1). M2 shows the roster on both clients (phases 2–3). M3 demonstrates a durable reply (phase 4). M4 verifies context, upgrade and rollback behavior (phases 5–6). Use deterministic provider fixtures for retry and denial tests; human-approved live calls are a separate smoke check.

### 1. Prove the native seams

**Suggested owner** — Host maintainer. **Acceptance** — AC-04, AC-06, AC-08.

- **1.1 Inventory host touchpoints.** Map native contracts, authorization entry points and current fork changes to an owner and upstream anchor. Check: Reconcile the released Git diff with the exception ledger; explain every modified upstream file. Prerequisites: none.
- **1.2 Probe native dispatch and retries.** Produce a replayable fixture for lookup, queue, read, duplicate request and lost reply against the release baseline. Check: Record actual inputs, rights checks, idempotency key retention and what a receipt proves. Repeating a send must be safe or explicitly uncertain. Prerequisites: inventory.
- **1.3 Select the narrowest host boundary.** Record the chosen RPC, MCP and UI seams, with candidate paths and alternatives. Check: Review existing ACP/MCP and outside-client options, count core edits and demonstrate why any new bridge is needed. Prerequisites: probe.

### 2. Build the bundled extension contract

**Suggested owner** — Host maintainer. **Acceptance** — AC-01, AC-06, AC-08.

- **2.1 Register and negotiate contributions.** Versioned manifest, explicit allowlist and environment capability response. Check: A supported manifest loads once, duplicate IDs fail visibly, and clients handle missing or incompatible API majors. Prerequisites: boundary.
- **2.2 Preserve caller authority in the adapter.** Typed read and mutation operations carrying user or thread identity and target scope. Check: Denied client and MCP calls produce no write; a broader target mode is rejected. Prerequisites: manifest.
- **2.3 Mount a project view and command.** One shared renderer slot and command contribution with stable navigation IDs. Check: Enable a fixture and agent extension together, disable either and verify normal project navigation and keyboard access. Prerequisites: manifest.

### 3. Implement the project seat directory

**Suggested owner** — Extension maintainer. **Acceptance** — AC-02, AC-05, AC-06.

- **3.1 Persist project-owned seat records.** Versioned extension schema, uniqueness indices, transactions and backup migration path. Check: Restart after migration; load a newer unsupported schema; confirm native T3 tables are untouched. Prerequisites: authorization.
- **3.2 Bind and replace an occupant.** Create, list, resolve and atomically rebind a seat using the selected environment and thread IDs. Check: A renamed thread still resolves; two concurrent writers produce one winner; wrong project and stale generation fail. Prerequisites: store, probe.
- **3.3 Expose roster and seat inspector.** Accessible project roster showing occupant, generation, role and last known presence. Check: Two clients see one edit; switching environments separates identical names; an offline client cannot write. Prerequisites: bindings, slots.

### 4. Deliver and reconcile handoffs

**Suggested owner** — Extension maintainer. **Acceptance** — AC-03, AC-04, AC-06.

- **4.1 Implement receipt and outbox transactions.** Durable request fingerprint, correlation ID, state transitions and retry/reconciliation worker. Check: Crash before send, after native acceptance and after storing receipt. Retry ten concurrent duplicate requests; count actual messages. Prerequisites: bindings, authorization.
- **4.2 Expose scoped seat operations to agents.** Named-seat lookup, handoff, acknowledgement and return via the authenticated caller. Check: Two agents with similar names produce a selection; forged sender, late acknowledgement and revoked grant are rejected. Prerequisites: outbox.
- **4.3 Demonstrate the first round trip.** A project thread asks the Backend seat a question and receives a correlated response. Check: Use fixtures in CI and an approved two-harness smoke test on a paired host. Render queued, unknown and acknowledged distinctly. Prerequisites: address, roster.

### 5. Report context honestly

**Suggested owner** — Provider integration maintainer. **Acceptance** — AC-07.

- **5.1 Normalize provider observations.** Read-only aggregate and optional itemized observations with timestamp, provider, revision and provenance. Check: Exercise itemized, aggregate-only, unavailable and stale fixtures; deferred counts do not inflate used context. Prerequisites: roster.
- **5.2 Show supported context fields.** An accessible per-seat view of the current context and any previously captured observations. Check: A Codex aggregate produces no invented categories. A missing historical sample is labelled unavailable. Prerequisites: observations.

### 6. Prove upgrade and release compatibility

**Suggested owner** — Release maintainer. **Acceptance** — AC-01, AC-05, AC-08.

- **6.1 Run the compatibility matrix.** Evidence for stock host, current iT3 host, unsupported major, two clients and disabled extension. Check: Verify permissions after reconnect, preservation of native chats and provider selection after disabling, and migration recovery. Prerequisites: roundtrip, inspector.
- **6.2 Rehearse an upstream update.** Isolated merge of an upstream candidate and a reconciled fork exception report. Check: Diff the candidate against its merge base, classify new paths, replay each affected ledger check and document conflicts. Prerequisites: matrix.
- **6.3 Prepare a candidate Result.** Source revision, checks, migration backup, tagged candidate and rollback evidence for owner review. Check: Cross-check all eight criteria and confirm macOS bundle identity, version and restoration on a disposable profile. Installation follows a separate release decision. Prerequisites: rehearse.

## Decision and evidence gates

The owner reviews the specification before accepting the implementation plan. A future construction Commission binds both exact revisions, a budget, a seat policy and an expected Result. Each task yields an artifact and an independently reviewable check. The integration reviewer compares candidate and released behavior, then the release owner decides when to deploy. No production credentials, paired environments or remote Macs are needed to review these records.

If the native deduplication spike cannot prove a safe retry, ship explicit uncertain delivery and human reconciliation. If an upstream plugin API can carry all contributions, adopt it and retire the matching ledger entries. If the selected host is stock T3, leave the roster unavailable there and retain all native project functionality.
