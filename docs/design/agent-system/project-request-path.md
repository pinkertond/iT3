---
id: network.it3.task-request
kind: request
title: Follow a task update from the interface to disk
parent: spec.it3.agent-system
relations:
  - { type: writes, to: data.it3.task-ledger }
---

The web or desktop interface addresses a project by environment ID and project ID. A task edit travels over the environment's authenticated WebSocket to the selected iT3 host. The host checks the session's scope and the task revision, then commits the task and audit event to SQLite. A client can reload the task from the same host after a disconnect.

The machine shown on project home is the connected environment. Router addresses, firewalls, and the deployment's physical network topology require evidence from that deployment. The task ledger alone cannot identify those devices.
