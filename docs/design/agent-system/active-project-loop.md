---
schema_version: 0.1.0
id: spec.it3.active-project-loop
kind: specification
title: Automatic work in active projects
purpose: Start the highest-priority ready step that fits the operator’s permissions, available capacity and limits.
parent: spec.it3.agent-system
maturity: specified
lifecycle: proposed
origins:
  - intent.it3.updatable-agents
details:
  acceptance_criteria:
    - id: LOOP-01
      criterion: Only known, ready steps in active projects can receive an automatic start.
      evidence_method: Replay the same queue across two workspace views, pause a project during selection, and reactivate it after its limits change.
    - id: LOOP-02
      criterion: Every dispatch has one durable decision, one reservation and an explanation visible to both clients.
      evidence_method: Race two clients for the last available slot and restart the host after dispatch but before its receipt.
---

# Automatic work in active projects

The manager can pick up known work without someone sending a prompt each time. The operator sets standing priorities and limits. The host makes the scheduling decision without spending model tokens.

| Project status | Proposed manager behavior                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Active         | Consider ready steps whenever capacity or the queue changes.                                                        |
| Paused         | Hold new starts, retries and escalations. Offer an explicit stop for an in-flight turn and preserve its checkpoint. |
| Idle           | Keep the backlog discoverable until the operator reactivates the project.                                           |
| Archived       | Exclude the project from the queue. On restoration, evaluate its current status and limits.                         |

**Known work** is a recorded task with an actionable next step, a completion check, satisfied dependencies, and an execution scope covered by standing permissions and limits. Defaults can come from the project or workspace. An imported chat or an agent’s suggestion needs a task before it can enter the queue. Existing projects default to active in iT3, so the first rollout previews eligible work before the operator enables dispatch under a standing policy.

**One queue across active projects.** A task inherits its project priority unless the operator sets a task priority. Consider the highest eligible priority first, then the longest-ready step, using the stable task ID to break ties. A blocked urgent task keeps its place and reserve. Lower-priority work using independent capacity can proceed. Workspace filters, including Everything, are views of the same task.

**One step per decision.** Wake on a ready task, project or policy change, completion, fresh usage reading, or relevant reset. Recheck status, claim generation, dependencies and limits immediately before dispatch. Atomically claim the step and reserve its allowance in SQLite. Use the decision ID for delivery retries. Reconcile an uncertain receipt before issuing more work. A paused project releases unsent reservations. Settle a running turn against its actual usage when available.

**Human view.** Show the next task, model, expected usage, limiting window and plain-language reason. Waiting entries show what will wake them. Every start, deferral and escalation has a decision record. The same record is visible from the project home and the task.

- [Capacity, periods and priority reserves](loop-capacity.md)
- [Model choice, context and feedback](loop-routing.md)

**First release check.** Run the scheduler in preview against recorded events. Start with one active project under a configured allowance, then replay several projects competing for the same account. Enable automatic starts once the recorded decisions agree with the policy.

**Implemented milestone — host queue preview.** Operators can record one estimated step per task and a policy per project. The project home ranks ready attempts across active projects and explains their budgets, provider windows and holds. The same task ID can exist in two projects. The view links each row to its own project and task. The executable behavior and operating instructions are in [Preview the next step](../../user/it3-project-agents.md#preview-the-next-step). Durable reservations, dispatch and settlement remain proposed.
