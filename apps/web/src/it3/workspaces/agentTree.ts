import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { ThreadId } from "@t3tools/contracts";

export function needsAttention(t: EnvironmentThreadShell) {
  return !!(t.hasPendingApprovals || t.hasPendingUserInput || t.pendingSubagentRequest);
}
export function working(t: EnvironmentThreadShell) {
  return (
    !needsAttention(t) &&
    !t.blockedOnThreadWait &&
    t.runtime?.status !== "waiting" &&
    threadRuntimeIsActive(t.runtime)
  );
}
export function agentTree(threads: readonly EnvironmentThreadShell[]) {
  const rows = threads.filter((t) => !t.deletedAt && !t.archivedAt);
  const byId = new Map(rows.map((t) => [t.id, t]));
  const parent = new Map<ThreadId, ThreadId>();
  for (const t of rows) {
    const id =
      t.lineage?.relationshipToParent === "subagent"
        ? t.lineage.parentThreadId
        : t.delegatedFrom?.environmentId === t.environmentId
          ? t.delegatedFrom?.threadId
          : null;
    if (id && id !== t.id && byId.has(id)) parent.set(t.id, id);
  }
  // Keep a malformed or partially migrated family reachable, including from a deep link.
  const done = new Set<ThreadId>();
  for (const t of rows) {
    const path = new Set<ThreadId>();
    let id: ThreadId | undefined = t.id;
    while (id && !done.has(id)) {
      if (path.has(id)) {
        parent.delete(id);
        break;
      }
      path.add(id);
      id = parent.get(id);
    }
    for (const visited of path) done.add(visited);
  }
  const children = new Map<ThreadId, EnvironmentThreadShell[]>();
  const roots: EnvironmentThreadShell[] = [];
  for (const t of rows) {
    const id = parent.get(t.id);
    if (!id) roots.push(t);
    else {
      const group = children.get(id) ?? [];
      group.push(t);
      children.set(id, group);
    }
  }
  const priority = (t: EnvironmentThreadShell) => (needsAttention(t) ? 2 : working(t) ? 1 : 0);
  const order = (a: EnvironmentThreadShell, b: EnvironmentThreadShell) =>
    priority(b) - priority(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  roots.sort(order);
  for (const group of children.values()) group.sort(order);
  const activeBelow = new Map<ThreadId, number>();
  const ordered = [...roots];
  for (let i = 0; i < ordered.length; i++)
    for (const c of children.get(ordered[i]!.id) ?? []) ordered.push(c);
  for (const t of ordered.reverse()) {
    const id = parent.get(t.id);
    if (id)
      activeBelow.set(
        id,
        (activeBelow.get(id) ?? 0) + Number(working(t)) + (activeBelow.get(t.id) ?? 0),
      );
  }
  return { roots, rows, byId, parent, children, activeBelow };
}
