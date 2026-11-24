---
id: workflow.it3.guarded-review
kind: workflow
title: Protected build and review
parent: spec.it3.agent-system
---

Open a single-attempt task and choose a paid queue route. Bind Reviewer to a Plan chat on the default Claude account and model. Enable **Protected Builder → Reviewer loop**, list ordinary tracked source files and protected tests, then set a positive per-turn USD budget and one to three rounds. The conservative input estimate must accommodate the original and candidate file packets.

The host reads committed blobs from the project. Every turn starts a fresh restricted Claude process in an empty directory, with built-in tools and MCP disabled. Builder can propose replacements only for the source allowlist. All other paths are closed. The operator classifies nonstandard or inline tests as protected. Use a separate task for new files or broad refactors.

A builder can contest one named test and explain why. A fresh Test Maintainer adjudicates the contest and authors any amendment to that file. Builder cannot approve its own contest. A separate Reviewer compares the candidate to the original request and tests. Requested changes return to Builder within the round limit. Approval pauses for an operator to run independent checks against the exact candidate commit and record evidence. Acceptance records that attestation. It does not merge or deploy the commit.

Each paid turn passes the project's priority, allowance and daily budget checks. A reservation precedes dispatch. Lost or malformed responses stop the loop and retain the accounting estimate. Inspect **Everything → Needs you** for holds. Task history preserves contests, role decisions, session identifiers, token counts and provider-reported model costs.

Inspect a candidate from the repository with `git diff BASE CANDIDATE`. For independent verification use `git worktree add --detach ../candidate-check CANDIDATE` and run your project's checks in an isolated environment. Existing interactive chats run with the filesystem permissions of their provider. This protection applies inside a protected task.

From **Fix or redesign**, start a bug fix or compare two design concepts. A concept task uses separate attempts. After accepting a concept, choose **Implement the selected concept**. The new task links to the accepted task in the same project. At dispatch the host resolves its winning attempt and includes that checkpoint, verification and source reference in the implementation packet. A new standalone implementation task can also carry a specification reference.
