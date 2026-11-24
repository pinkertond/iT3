# Project homes

Open **Workspaces** in iT3. Everything covers projects across the connected environments. Choose a named workspace and open a project to see its documentation, task states, relationships, versions, and chats. Projects have one named workspace or remain unassigned. Everything includes both. New projects start active. Paused and idle are explicit organization choices. Archiving uses T3’s native archive operation. Select another status or All statuses to find and reactivate a project.

Workspace names and project assignments persist in the host's settings. Clients of that host receive updates through the existing server configuration stream. A client remembers its selected workspace locally. Stock hosts can be browsed. Shared workspace edits require a host advertising the iT3 workspace capability and settings-write access. Archive and restore also use T3's existing project-operation checks.

## Generate a project’s documentation

From an iT3 source checkout with its pinned Node version and dependencies installed, run the generator with the root of the target Git checkout.

```sh
node it3/extensions/project-home/generate.mjs /path/to/project
node it3/extensions/project-home/generate.mjs /path/to/project --check
```

Generation reads tracked working-tree files. It recognizes project README and docs pages, Braid Markdown records with id, kind and title, and root version files. Task progress counts the recorded stages of leaf tasks. Laws, deployments, and agent records appear when authored. Each document can link to its parent, children, origins, and related records. Cross-project references retain their ID. The standalone site opens from `.it3/home/index.html`. The app fetches one list of at most 12 records at a time and reads detail from the selected project's environment. Its source check compares the file with its recorded SHA-256. Recheck a changed source and regenerate to update its relationships.

SQLite, detail pages and lists live under `.it3/home/<digest>/`. A new generation publishes its manifest last so a reader can finish browsing an earlier snapshot. The database contains `nodes` and `edges`. It can be regenerated from source. Use the check command after documentation changes or in CI. Both a missing artifact and a difference from current source fail the check.

## Upstream integration

The fork-owned renderer is in `apps/web/src/it3/workspaces/`; the compiler is in `it3/extensions/project-home/`. The upstream integration points are the server settings and capability schemas, the server capability advertisement, the chat index landing route and sidebar project filter. The new workspace route regenerates the router's route tree. During upstream updates, verify first-run onboarding, direct chat links, two-client settings updates, native archive and restore, and project-file read permissions. Remove each custom seam when an upstream contribution point supplies equivalent behavior.
