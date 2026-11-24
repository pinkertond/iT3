---
schema_version: 0.1.0
id: spec.it3.agent-system
kind: specification
title: iT3 agent system
purpose: Coordinate named agents in a project through durable seats and accountable handoffs.
parent: intent.it3.updatable-agents
maturity: specified
lifecycle: proposed
origins:
- intent.it3.updatable-agents
relations:
- type: serves
  to: intent.it3.updatable-agents
details:
  acceptance_criteria:
  - id: AC-01
    criterion: Install or disable the bundled extension as a unit. An absent or incompatible extension leaves ordinary T3 projects and chats usable.
    evidence_method: Start a stock server, an enabled iT3 server and a disabled iT3 server with the same client build.
  - id: AC-02
    criterion: A project owner can create a named seat and bind or replace its occupant. Renaming a T3 thread preserves the binding. Concurrent rebinds resolve to one generation.
    evidence_method: Bind two seats, rename a thread, race two compare-and-swap operations and attempt a stale send.
  - id: AC-03
    criterion: An authorized sender can address a seat and receive an explicit acknowledgement or return in the originating conversation. Duplicate names require disambiguation.
    evidence_method: Send from a Codex seat to a Claude seat; verify both thread links and the correlation ID for the reply.
  - id: AC-04
    criterion: Repeating a handoff request delivers at most one native message for the same logical recipient and generation. An uncertain send stays visible for reconciliation.
    evidence_method: Inject loss after native acceptance, retry concurrently, restart the server, and count transcript entries.
  - id: AC-05
    criterion: Both Macs paired to one enabled environment observe the same seats, generation and receipts. Two independent environments can use identical seat names safely.
    evidence_method: Pair two clients, disconnect and reconnect one, then switch it to an unextended environment.
  - id: AC-06
    criterion: Caller permissions, project scope and target execution mode are rechecked at delivery. A recipient cannot impersonate another occupant or acknowledge an obsolete generation.
    evidence_method: Exercise denied write, broader target mode, a forged sender field, revoked access and late acknowledgement.
  - id: AC-07
    criterion: Context inspection identifies the observation time, source and supported fields. A Codex aggregate does not generate invented counts for skills or MCP tools.
    evidence_method: Compare aggregate-only, itemized, unavailable and stale fixtures; reload an older recorded observation.
  - id: AC-08
    criterion: Every modified upstream-owned path has a recorded purpose, owner, replay procedure, proof and removal condition. Updating upstream is rehearsed before a release.
    evidence_method: Compare Git changes against the ledger and rehearse an upstream merge in isolation with extension on and off.
  non_goals:
  - Public plugin marketplace, arbitrary downloaded code, replacement provider harnesses, automatic software deployment.
  - Cross-environment federation, autonomous team scheduling and historical token reconstruction without captured observations.
---

# iT3 agent system

**First use.** In a Frontend thread, ask the Backend seat which fields the login endpoint returns. iT3 shows the target project, seat and bound thread. Backend can reply with the contract or return the request for clarification. Closing either Mac does not lose the assignment. The receiving agent's provider can change later without changing the seat identity.

## Proposed architecture

1. **Project agents view.** A bundled web contribution adds a roster, seat inspector and handoff history to the selected environment. The desktop uses the same web renderer. Keyboard and command-palette entry points reach the same actions. Show the actual bound thread, provider/model when reported, current generation and last observed time. An offline environment shows its last known state and disables mutations.
2. **iT3 extension host.** At build time register trusted first-party contributions from an explicit allowlist. At environment startup negotiate an extension ID, API major, supported capabilities and schema version. The host mounts only compatible contributions. Each operation receives the authenticated environment, project and principal. UI, MCP and server handlers use the same authorized application service. No automatic import of code from project files. The manifest restricts available host operations; bundled code shares the host process and requires the same review as iT3 itself.
3. **Agent extension.** Keep the seat registry, assignment rules, outbox, acknowledgements, UI contributions, provider-aware reporting and migrations under a fork-owned directory such as `it3/extensions/agents/`. The host contract lives under `it3/extension-host/`. Follow T3's TypeScript/Effect runtime for this app-owned code. The Braid Studio records describe the design; they introduce no dependency on a running Braid-OS Core.
4. **T3 adapter.** Use existing thread lookup, send, read and wait behavior under the original caller's scope. Bind existing ordinary threads for the first slice. Reuse native permissions, transcripts, provider sign-in and run control. Add thin host registration at only the verified seams. When the selected server lacks the extension, ordinary T3 stays available and the client identifies which server must be upgraded.
5. **Environment-owned storage.** Persist extension data in its own versioned SQLite store under the selected iT3 server home. Both Macs see the same state when paired to that environment. Separate hosts maintain independent records. A single transaction appends a handoff and its pending delivery; a worker reconciles native receipts. Keep references to T3 messages and bounded task summaries, with the original thread as transcript authority.

## Identity and message contract

| Record | Identity and invariants |
|---|---|
| Seat | Immutable seat ID within environment and project. Display name, purpose, role and revision are editable. Name resolution returns candidates when ambiguous. |
| Occupant | Binding to environment, project, thread and monotonically increasing generation. Reassign atomically with expected generation. Close the old binding and retain its history. |
| Handoff | Unique handoff ID, client request ID, source seat and generation, target seat and generation, source and destination thread references, bounded question or task, optional reply-to ID, timestamps. A server authenticates the sender. |
| Receipt | Distinguish pending delivery, native acceptance, explicit acknowledgement, return and cancellation. Store native IDs when supplied. Reading a thread or finishing a model turn cannot attest to human or agent acknowledgement. |
| Observation | Provider, model if known, thread, timestamp, metric units and provenance. Preserve unknown, estimated, deferred and measured values as separate cases. Store a previous breakdown only if it was actually captured. |

**Delivery.** Default to a queued question to preserve an active recipient's work. Persist the resolved recipient and generation before dispatch. Derive a stable native request key from the handoff and attempt purpose. On retry with a different payload under the same key, reject the conflict. Reconcile an ambiguous native outcome before attempting another send. If the adapter cannot prove safe retry, present “delivery unknown” and require explicit resolution. A rebind blocks pending sends to the old generation and never redirects an already accepted handoff. An acknowledgement writes one receipt and, if requested, sends a correlated reply through the same outbox. Stop after that reply unless a participant explicitly requests follow-up.

**Authority and failure.** Use T3's server-verified user or thread principal, project membership and effective mode for each action. A seat name or manifest grants no authority. Check rights on reads, dispatch, acknowledgement and reply; filter linked thread details when access is lost. Disabling the extension pauses delivery, retains its store and leaves native threads accessible. Re-enabling reconciles existing rows before new delivery. A newer, unreadable schema puts the extension into an unavailable state with recovery instructions. Back up the extension store before migrations; preserve T3's existing database recovery process.

## Existing seams and decisions to prove

The baseline is iT3 release commit `65eab18b69c8067515f3d7421b27559d9214b83a`. T3 already defines thread-send and wait in `apps/server/src/mcp/toolkits/orchestrator/tools.ts`, routes scoped operations in its sibling `handlers.ts`, and defines client operation scopes in `packages/contracts/src/clientRpcPermissions.ts`. `docs/user/outside-agents.md` describes external MCP access and thread-only operations. MCP can already carry thread messages; a native project roster and shared seat generations require an additional extension contract. None of the proposed host API, seat store or handoff receipts is claimed as shipped.

The first spike must verify the native deduplication horizon, thread-principal propagation, the environment capability handshake and the smallest UI contribution surface in the pinned code. Record actual call sites and regression tests before freezing the host API. Prefer an upstream extension contract when it offers the same behavior. The first version assumes one trusted, bundled extension; demonstrate a second small fixture contribution before generalizing its interface.

## Review boundary

Approve the first workflow, the bundled extension trust model, and whether shared project seats should be writable by existing project operators or a narrower role. Proposed default: owner manages bindings, authorized occupants can send and acknowledge. A stock T3 server paired with an iT3 client can still serve its native projects and provider accounts; sharing the new roster requires the extension on the host serving those projects.
