---
schema_version: 0.1.0
id: spec.it3.workflow-canvas
kind: specification
title: Visual project workflows
purpose: See how a project works and edit its processes from the same definitions agents use.
parent: spec.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
  - intent.it3.updatable-agents
relations:
  - type: depends_on
    to: spec.it3.active-project-loop
---

# Visual project workflows

Start at one project. Choose **Team**, **Workflows**, or **Runs**. Each view opens one level with up to twelve immediate entries. A larger process can contain named subflows. The inspector holds descriptions, evidence and cross-links so the canvas can stay legible.

| View      | What the operator can see and change                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team      | Expand a team to its seats. A seat is a project role with a stable ID. Open its occupant to see the actual chat, active task and working descendants. Reassigning a seat records a new binding generation.                  |
| Workflows | Connect a trigger to a check, branch, wait, approval, subflow or agent step. Select an agent step to choose a seat and its permitted task scope. A “runs before” edge orders work. An “assigned to” edge references a seat. |
| Runs      | Overlay what actually happened on the exact workflow revision used. Select a node for its inputs, result, attempts and evidence. From an agent step, follow links to the task, seat generation, chat and observed usage.    |

## One definition for humans and agents

Keep each authored graph in project Git, e.g. `.it3/workflows/suite-review.json`. Define node types, typed ports, stable IDs, version and explicit control edges in a schema. Store layout separately from execution semantics. Use project and environment IDs to resolve resources. Read team bindings from the seat directory, task progress from the ledger, and run history from the native workflow store. A compiled index supplies the generated documentation and project view.

Give the canvas and agent tools the same operations: read one graph or node, propose a patch against a revision, validate, preview the change, and publish. Validate port compatibility, references, reachability, caller scope and loop bounds. A publish compiles the supported graph to native T3 workflow source and retains versions needed by unfinished runs. Track the generated hash. An independent edit of published source triggers a conflict. Existing hand-authored TypeScript workflows remain accessible in the native source editor. Arbitrary TypeScript cannot reliably round-trip through a graphical editor.

## Execution and permissions

Use the existing host workflow engine for journaled steps, waits, questions, child workflows and linked agent threads. Register named project checks with fixed argument schemas. Keep filesystem access and process execution behind host capabilities. A published check receives only its declared inputs and permissions. For each side effect, use a stable operation ID or reconcile the external receipt before retrying. A loop declares its exit condition, iteration limit, deadline and resource ceiling. Record each iteration under a distinct step ID.

Agent nodes resolve the named seat to its current occupant and check the binding generation, task claim, project status and budget before dispatch. Map a policy hold to a visible wait reason. The current queue previews affordability. Automatic model execution needs atomic reservations, delivery receipts and settlement. Track deterministic duration separately from model tokens and money. A user can compare cost per accepted result and open the evidence behind it.

## First vertical slice

**Test suite → summarize → branch → human review → diagnosis brief.** A deterministic runner emits a revision, completeness flag, individual outcomes and an evidence reference. Compute the summary locally. Passing runs finish with zero model calls. Empty and incomplete reports stay visible. A failure offers a bounded diagnosis brief with three example failures and a link to the complete report. Later, a permitted and budgeted agent can claim that brief.

The [native example](../../../it3/extensions/workflows/examples/suite-review.ts) starts from a completed suite report. It exposes the durable human review through T3 Workflows. The suite runner, canvas and automatic agent dispatch are separate delivery items.

### Try the example

On a host with **Settings → Labs → Workflows** enabled, save the example as `suite-review.ts` in its workflow definitions directory. Start it with a unique key for the suite delivery. Repeating a key reopens the same run.

```sh
t3 workflow start it3-suite-review --key ci-42-unit --input '{"suite":"Unit","revision":"abc123","evidence":"ci/run-42","complete":true,"cases":[{"name":"Preserve urgent reserve","outcome":"failed"}]}'
```

Open **Workflows → Needs you** to see the review. **Prepare diagnosis brief** returns the evidence reference, counts, sample failures and completion check. Give that brief to a task through the existing task board. The example consumes an existing report and makes zero model calls.

## Delivery and acceptance

| Stage               | Deliverable                                                                          | Acceptance                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Project canvas   | Typed definition, project-scoped catalog, graph/list editor and validation.          | A human connects a branch, an agent edits the same definition, and a stale revision receives a conflict. Both Macs see the saved graph on the same host. |
| 2. Native execution | Versioned compiler and run overlay with stable node-to-step IDs.                     | Run the green, failed, empty and incomplete cases. Restart while waiting for review. The same run resumes on its original graph version.                 |
| 3. Teams and seats  | Hierarchical roster, active descendants, assignment edges and actual-run drill-down. | Replace an occupant mid-run. History opens the original chat and a stale handoff cannot reach the new occupant.                                          |
| 4. Budgeted loops   | Account reservations, concurrency, bounded retries, reconciliation and agent node.   | Compete for the last allowance from two clients. At most one dispatch is admitted. A paused project launches no new model work.                          |

## Technology and upstream boundary

Build the editor as a fork-owned project-home contribution. Use React Flow for the graph and Vercel AI SDK UI for streamed authoring suggestions where useful. Vercel's Workflow Builder is a visual reference. T3's Effect workflow engine already runs on the host. Use its existing definitions, version handling, SQLite journal and chat links through a narrow adapter. Track any required registration in the [upstream exception register](upstream-exceptions.md).

[Native T3 Workflows](../../user/workflows.md) · [Project seats](tasks/03-seats.md) · [Active-project queue](active-project-loop.md) · [Vercel Workflow Builder](https://vercel.com/templates/next.js/workflow-builder) · [n8n license](https://github.com/n8n-io/n8n/blob/master/LICENSE.md)
