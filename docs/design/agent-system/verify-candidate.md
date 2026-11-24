---
id: delivery.it3.candidate
kind: audit
title: Trace a candidate through independent verification
parent: spec.it3.agent-system
relations:
  - { type: checks, to: workflow.it3.guarded-review }
---

On the task, open **Protected candidate**. Compare the base and candidate commits, inspect the role receipts, then run the project checks against that candidate in isolation. Capture the CI run URL or the command, commit and observed results. Record this evidence with **Accept verified candidate**. Use the project's existing release process to release the accepted change.
