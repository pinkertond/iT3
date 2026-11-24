import type { WorkflowRun, WorkflowQuestion, WorkflowRunDetail } from "@t3tools/contracts";
import type { CanvasGraph } from "@t3tools/shared/it3WorkflowGraph";
export function traceRun(graph: CanvasGraph, detail: Pick<WorkflowRunDetail, "steps"> | null) {
  const steps = new Map(detail?.steps.map((s) => [s.name, s]));
  const edges = new Set<string>(),
    visited = new Set<string>();
  let current = graph.nodes.find((n) => n.kind === "start");
  let active: string | null = null;
  while (current && !visited.has(current.id)) {
    const node = current,
      step = steps.get(node.id) ?? steps.get(node.id + "/start");
    if (!step) break;
    visited.add(node.id);
    active = node.id;
    if (step.status !== "completed" || step.name !== node.id) break;
    let port = "next";
    if (node.kind === "branch") {
      if (typeof step.result !== "boolean") break;
      port = step.result ? "yes" : "no";
    }
    if (node.kind === "review") {
      const answer = step.result;
      if (answer && typeof answer === "object" && !Array.isArray(answer) && "choice" in answer)
        port = answer.choice === "Yes" ? "yes" : "no";
      else if (step.detail === "timed out") port = "no";
      else break;
    }
    const edge = graph.edges.find((e) => e.from === node.id && e.port === port);
    if (!edge || (!steps.has(edge.to) && !steps.has(edge.to + "/start"))) break;
    edges.add(edge.from + "/" + port);
    current = graph.nodes.find((n) => n.id === edge.to);
  }
  return { steps, edges, visited, active };
}

export function descendantQuestion(
  childId: string,
  runs: readonly WorkflowRun[],
  questions: readonly WorkflowQuestion[],
) {
  const parents = new Map(runs.map((r) => [r.runId, r.parentRunId]));
  return questions.find((q) => {
    const seen = new Set<string>();
    let id: string | null = q.runId;
    while (id && !seen.has(id)) {
      if (id === childId) return true;
      seen.add(id);
      id = parents.get(id) ?? null;
    }
    return false;
  });
}
