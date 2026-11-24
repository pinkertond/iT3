import { describe, expect, it } from "vite-plus/test";
import { type EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { ThreadId } from "@t3tools/contracts";
import { agentTree, needsAttention } from "./agentTree";
function shell(id: string, parent?: string, options: Partial<EnvironmentThreadShell> = {}) {
  return {
    id: ThreadId.make(id),
    title: id,
    lineage: { relationshipToParent: "subagent", parentThreadId: parent },
    runtime: { status: "running" },
    ...options,
  } as EnvironmentThreadShell;
}
describe("project team", () => {
  it("rolls up working descendants while separating forks and approvals", () => {
    const root = shell("root"),
      child = shell("child", "root"),
      leaf = shell("leaf", "child");
    const waiting = shell("approval", "root", { hasPendingApprovals: true });
    const fork = shell("fork", undefined, {
      lineage: { ...child.lineage, relationshipToParent: "fork" },
    });
    const tree = agentTree([leaf, root, child, fork, waiting]);
    expect(tree.roots.map((t) => t.id)).toEqual(["fork", "root"]);
    expect(tree.activeBelow.get(root.id)).toBe(2);
    expect(tree.activeBelow.get(child.id)).toBe(1);
    expect(needsAttention(waiting)).toBe(true);
  });
  it("keeps missing parents and cyclic lineages reachable", () => {
    const tree = agentTree([shell("a", "b"), shell("b", "a"), shell("orphan", "elsewhere")]);
    expect(tree.roots.length).toBe(2);
    expect(
      tree.roots.map((r) => (tree.activeBelow.get(r.id) ?? 0) + 1).reduce((a, b) => a + b),
    ).toBe(3);
  });
});
