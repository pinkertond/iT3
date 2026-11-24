---
schema_version: 0.1.0
id: intent.it3.workspace-homes
kind: intent
title: A readable home for every project
purpose: Find a project, its chats, and its governing records from a single workspace.
parent: null
maturity: specified
lifecycle: proposed
---

# A readable home for every project

David described the intended human view in the iT3 design conversation on November 23, 2026.

> We need a generated documentation site built right into the interface and accessible. This becomes the home for every project.

Start in Everything to see active projects across connected environments. Choose Work, Personal, Random, or a custom workspace to narrow the list. Paused, idle and archived projects can be found by changing the status filter. Select a project to read its documentation, inspect task stages, trace relationships, browse source versions and deployments, or open an existing chat.

The live view reads files from the project's environment. For a Git-backed project, the documentation compiler produces a shareable offline HTML edition and a SQLite index. See [the compiler guide](../../../it3/extensions/project-home/README.md).
