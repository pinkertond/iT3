---
id: workflow.it3.project-team
kind: workflow
title: Route project work through team seats
parent: spec.it3.agent-system
relations:
  - { type: hands-off-to, to: workflow.it3.guarded-review }
---

Open **Project team** on the Agents view or in the project manager chat’s Team panel. Expand a seat for its purpose, current assignment, expected result, next recipient and recorded transfers. Architect, Designer and Explorer can each be bound to a project Plan chat using Auto or approval-required permissions. An empty seat can receive a task draft and waits for a binding before dispatch.

| Entry                                                   | Seat      | Result                                         |
| ------------------------------------------------------- | --------- | ---------------------------------------------- |
| Compare two interface concepts                          | Designer  | Two alternatives for human selection           |
| Understand the system → Ask Explorer                    | Explorer  | Answer with source references                  |
| Architect a change                                      | Architect | Decision brief and implementation plan         |
| Fix a bug, modify UI, or implement an accepted approach | Builder   | Protected Git candidate for independent review |

**Route an attempt.** Save the task and choose **Route attempt to**. The host resolves the current seat occupant. With a project budget, configure a paid queue step and use its provider and model in the receiving chat. Check the capacity preview for allowance, dependencies and remaining budget. Manual dispatch without a queue policy is labeled on the task. Automatic protected work retains its separate reservation and accounting rules.

**Replace an Architect.** Stop the original worker, bind its successor, and select **Transfer checkpoint to** on the working attempt. The host checks the previous turn and worktree and fences out the former assignment generation. Reusing a worktree or transferring reserved capacity requires a confirmed stop. A different recovery worktree must match the inspected snapshot. Changing the seat binding alone directs future assignments.

**Select the result.** Each comparison attempt uses a distinct chat and Git worktree. Open each attempt's findings and choose **Accept this attempt**. **Implement the selected approach** creates a protected implementation task with a project-local reference. Builder’s design packet records the winning attempt, findings, verification and source reference. Reviewer can request revisions. Only Test Maintainer can amend a contested test. The operator records checks against the reviewed candidate before accepting it.

**Read costs.** Protected turns show provider-reported tokens, priced USD and missing prices per role. Occupant chat usage covers the chat over seven days and may include several tasks. Thread activity shows observed working descendants. The roster labels restricted per-turn agents separately from the persistent chat used for queue policy.
