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

**Available in iT3** — Open **Workspaces → project → Workflows → New visual workflow** on a host with **Settings → Labs → Workflows** enabled. Give the workflow a lowercase name and choose **Create**. The canvas opens with six connected nodes.

1. Select a node to see its purpose and edit its label. For a human review, the label is the question the operator sees.
2. Drag a connection between handles or choose a destination in the inspector. A branch tests for failures or skipped tests. Both Yes and No need a destination. Each graph has one start, up to twelve reachable nodes and no cycles.
3. Choose **Publish**, then **Run workflow**. Start with the supplied sample or paste a completed suite report. For a failed sample, open **Open native run** and answer the review. Select the result node to read its recorded evidence.
4. Reopen the definition to inspect an earlier run. Editing a rule publishes a new execution version. Moving a node changes only its layout. A run waiting for an answer keeps its original rules across publishes and host restarts.

## Longer-term project views

Start at one project. Choose **Team**, **Workflows**, or **Runs**. Each view opens one level with up to twelve immediate entries. A larger process can contain named subflows. The inspector holds descriptions, evidence and cross-links so the canvas can stay legible.

| View      | What the operator can see and change                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team      | Expand a team to its seats. A seat is a project role with a stable ID. Open its occupant to see the actual chat, active task and working descendants. Reassigning a seat records a new binding generation.                  |
| Workflows | Connect a trigger to a check, branch, wait, approval, subflow or agent step. Select an agent step to choose a seat and its permitted task scope. A “runs before” edge orders work. An “assigned to” edge references a seat. |
| Runs      | Overlay what actually happened on the exact workflow revision used. Select a node for its inputs, result, attempts and evidence. From an agent step, follow links to the task, seat generation, chat and observed usage.    |

## One definition for humans and agents

The host currently stores one `<name>.flow.ts` in its native workflow definitions directory. Its `canvas` JSON contains the project ID, stable node IDs, port connections, semantic revisions and layout. A human and an agent can read the same definition. Agents can edit the JSON while preserving prior revisions and the format's runtime wrapper. Workflows with custom TypeScript open in the native source editor. The project entry filters by project ID. Clients connected to the same host share published definitions and runs.

The editor checks connectivity, ports and cycles before publication. It submits the source it last read so the host can reject stale edits. The native workflow engine stores the run history and journals one step per visited node. A Git-backed project catalog, subflows and focused agent authoring tools are future extensions.

## Execution and permissions

Use the existing host workflow engine for journaled steps, waits, questions, child workflows and linked agent threads. Register named project checks with fixed argument schemas. Keep filesystem access and process execution behind host capabilities. A published check receives only its declared inputs and permissions. For each side effect, use a stable operation ID or reconcile the external receipt before retrying. A loop declares its exit condition, iteration limit, deadline and resource ceiling. Record each iteration under a distinct step ID.

Agent nodes resolve the named seat to its current occupant and check the binding generation, task claim, project status and budget before dispatch. Map a policy hold to a visible wait reason. The current queue previews affordability. Automatic model execution needs atomic reservations, delivery receipts and settlement. Track deterministic duration separately from model tokens and money. A user can compare cost per accepted result and open the evidence behind it.

## First vertical slice

**Test suite → summarize → branch → human review → diagnosis brief.** A deterministic runner emits a revision, completeness flag, individual outcomes and an evidence reference. Compute the summary locally. Passing runs finish with zero model calls. Empty and incomplete reports stay visible. A failure offers a bounded diagnosis brief with three example failures and a link to the complete report. Later, a permitted and budgeted agent can claim that brief.

The [native example](../../../it3/extensions/workflows/examples/suite-review.ts) starts from a completed suite report. It exposes the durable human review through T3 Workflows. The visual template accepts the same input shape. Invoking a test runner and dispatching a diagnosis agent are future node types.

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

The editor uses React Flow and loads when a visual definition opens. A future authoring assistant can stream suggestions through Vercel AI SDK UI. Vercel's Workflow Builder is a visual reference. T3's Effect workflow engine already runs on the host. Use its existing definitions, version handling, SQLite journal and chat links through a narrow adapter. Track any required registration in the [upstream exception register](upstream-exceptions.md).

[Native T3 Workflows](../../user/workflows.md) · [Project seats](tasks/03-seats.md) · [Active-project queue](active-project-loop.md) · [Vercel Workflow Builder](https://vercel.com/templates/next.js/workflow-builder) · [n8n license](https://github.com/n8n-io/n8n/blob/master/LICENSE.md)
