import { useState } from "react";
import { T, useGT } from "gt-react";
import {
  extractSubflow,
  type CanvasDocument,
  type CanvasGraph,
} from "@t3tools/shared/it3WorkflowGraph";
import styles from "./workflowCanvas.module.css";
export function ExtractSubflow({
  graph,
  projectId,
  names,
  apply,
  close,
}: {
  graph: CanvasGraph;
  projectId: string | null;
  names: readonly string[];
  apply: (child: CanvasDocument, parent: CanvasGraph, entry: string) => void;
  close: () => void;
}) {
  const gt = useGT();
  const [name, setName] = useState(""),
    [ids, setIds] = useState<string[]>([]);
  const candidate = extractSubflow(graph, ids, name, projectId);
  const error = names.includes(name)
    ? gt("That workflow name is already in use.")
    : "error" in candidate
      ? candidate.error
      : null;
  return (
    <div className={styles.palette} role="group" aria-label={gt("Extract subflow")}>
      <label>
        <T>New workflow name</T>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      {graph.nodes
        .filter((n) => n.kind !== "start" && n.kind !== "result")
        .map((n) => (
          <label key={n.id} className={styles.extractChoice}>
            <input
              type="checkbox"
              checked={ids.includes(n.id)}
              onChange={(e) =>
                setIds(e.target.checked ? [...ids, n.id] : ids.filter((id) => id !== n.id))
              }
            />
            {n.label}
          </label>
        ))}
      {error && <p>{error}</p>}
      <button
        type="button"
        disabled={!!error}
        onClick={() => {
          if (!error && "child" in candidate)
            apply(candidate.child, candidate.parent, candidate.entry);
        }}
      >
        <T>Group selected steps</T>
      </button>
      <button type="button" onClick={close}>
        <T>Cancel</T>
      </button>
    </div>
  );
}
