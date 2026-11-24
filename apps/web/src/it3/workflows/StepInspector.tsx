import { useState } from "react";
import { T, useGT } from "gt-react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Link2,
  ListTree,
  Pencil,
  Plus,
  Unlink,
  X,
} from "lucide-react";
import {
  portsFor,
  componentAccess,
  workflowComponents,
  type CanvasGraph,
  type CanvasNode,
  type CanvasPort,
} from "@t3tools/shared/it3WorkflowGraph";
import { nodeLibrary, ScalarValue, Choices } from "./WorkflowNodes";
import styles from "./workflowCanvas.module.css";

type Props = {
  node: CanvasNode;
  graph: CanvasGraph;
  suite: boolean;
  locked: boolean;
  select: (id: string) => void;
  patch: (patch: Partial<CanvasNode>) => void;
  wire: (port: CanvasPort, to: string | null) => void;
  add: (port: CanvasPort) => void;
  remove: () => void;
};
export function StepInspector({
  node,
  graph,
  suite,
  locked,
  select,
  patch,
  wire,
  add,
  remove,
}: Props) {
  const gt = useGT(),
    library = nodeLibrary(gt, suite);
  const [editing, setEditing] = useState(false),
    [choosing, setChoosing] = useState<CanvasPort | null>(null);
  const { icon: Icon, title, hint } = library[node.kind];
  const configurable = !suite && workflowComponents[node.kind].settings === "scalar";
  const ports = portsFor(node.kind);
  const summary =
    suite && node.kind === "branch"
      ? node.predicate === "skipped"
        ? gt("Has skipped tests")
        : gt("Has failed tests")
      : suite && node.kind === "result"
        ? node.output === "brief"
          ? gt("Prepare a diagnosis brief")
          : gt("Return the suite summary")
        : hint;
  return (
    <>
      <div className={styles.stepHeading} data-kind={node.kind}>
        <div className={styles.stepType}>
          <span className={styles.tile}>
            <Icon size={17} />
          </span>
          {title}
        </div>
        <h2>{node.label || title}</h2>
        {configurable ? (
          <p className={styles.expression}>
            <code>{node.field || "…"}</code>
            {node.kind === "branch" ? gt("equals") : gt("is set to")}
            <code>{node.literal || "…"}</code>
          </p>
        ) : (
          <p>{summary}</p>
        )}
        {!locked && (
          <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? <Check size={13} /> : <Pencil size={13} />}{" "}
            {editing ? gt("Done editing") : gt("Edit step")}
          </button>
        )}
      </div>
      {!suite && (
        <details className={styles.componentDetails}>
          <summary>
            <T>Component details</T>
          </summary>
          <p>
            <T>Input shape</T> · <code>{workflowComponents[node.kind].input}</code>
          </p>
          <p>
            <T>Required access</T> ·{" "}
            {componentAccess[workflowComponents[node.kind].permission].join(", ")}
          </p>
        </details>
      )}
      {editing && !locked && (
        <div className={styles.settings}>
          <label>
            <T>Node label</T>
            <input
              value={node.label}
              maxLength={160}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </label>
          {suite && node.kind === "branch" && (
            <Choices
              label={gt("Condition")}
              value={node.predicate ?? "failed"}
              options={[
                { id: "failed", text: gt("Failed tests") },
                { id: "skipped", text: gt("Skipped tests") },
              ]}
              onChange={(v) => patch({ predicate: v === "failed" ? "failed" : "skipped" })}
            />
          )}
          {suite && node.kind === "result" && (
            <Choices
              label={gt("Result format")}
              value={node.output ?? "summary"}
              options={[
                { id: "summary", text: gt("Suite summary") },
                { id: "brief", text: gt("Diagnosis brief") },
              ]}
              onChange={(v) => patch({ output: v === "brief" ? "brief" : "summary" })}
            />
          )}
          {configurable && (
            <>
              <label>
                <T>Field name</T>
                <input
                  value={node.field ?? ""}
                  maxLength={160}
                  onChange={(e) => patch({ field: e.target.value })}
                />
              </label>
              <ScalarValue
                label={node.kind === "branch" ? gt("Equals") : gt("Value")}
                literal={node.literal ?? '""'}
                onChange={(literal) => patch({ literal })}
              />
            </>
          )}
          {node.kind !== "start" && (
            <button className={styles.removeStep} type="button" onClick={remove}>
              <T>Remove node</T>
            </button>
          )}
        </div>
      )}
      {ports.length > 0 && (
        <div className={styles.pathGroup}>
          <h3>
            <T>Next steps</T>
          </h3>
          {ports.map((port) => {
            const edge = graph.edges.find((e) => e.from === node.id && e.port === port);
            const target = graph.nodes.find((n) => n.id === edge?.to);
            const portLabel = port === "yes" ? gt("Yes") : port === "no" ? gt("No") : gt("Next");
            const Glyph = port === "yes" ? Check : port === "no" ? X : ArrowRight;
            const Dest = target ? library[target.kind].icon : Plus;
            const candidates = graph.nodes.filter((n) => n.id !== node.id && n.kind !== "start");
            return (
              <div key={port} className={styles.pathRow} data-port={port}>
                <div className={styles.pathHead}>
                  <span>
                    <Glyph size={14} />
                    {portLabel}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      aria-label={gt("Change {port} destination", { port: portLabel })}
                      aria-expanded={choosing === port}
                      onClick={() => setChoosing(choosing === port ? null : port)}
                    >
                      <Link2 size={15} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.destination}
                  disabled={!target && (locked || graph.nodes.length >= 12)}
                  onClick={() => (target ? select(target.id) : add(port))}
                >
                  <Dest size={16} />
                  <strong>
                    {target ? target.label : locked ? gt("Unconnected") : gt("Add a step")}
                  </strong>
                  <ChevronRight size={14} />
                </button>
                {!locked && choosing === port && (
                  <div
                    role="group"
                    aria-label={gt("Choose destination")}
                    className={styles.pathChoices}
                  >
                    {candidates.map((n) => {
                      const Glyph = library[n.kind].icon;
                      return (
                        <button
                          type="button"
                          key={n.id}
                          aria-pressed={n.id === target?.id}
                          onClick={() => {
                            wire(port, n.id);
                            setChoosing(null);
                          }}
                        >
                          <Glyph size={14} />
                          {n.label}
                        </button>
                      );
                    })}
                    {target && (
                      <button
                        type="button"
                        onClick={() => {
                          wire(port, null);
                          setChoosing(null);
                        }}
                      >
                        <Unlink size={14} />
                        <T>Disconnect</T>
                      </button>
                    )}
                    {!candidates.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setChoosing(null);
                          add(port);
                        }}
                      >
                        <Plus size={14} />
                        <T>Add a step</T>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <details className={styles.outline}>
        <summary aria-label={gt("All steps")}>
          <ListTree size={15} />
          <T>All steps</T>
          <span>{graph.nodes.length}</span>
        </summary>
        <div>
          {graph.nodes.map((n) => {
            const I = library[n.kind].icon;
            return (
              <button
                type="button"
                key={n.id}
                aria-current={n.id === node.id ? "step" : undefined}
                onClick={() => select(n.id)}
              >
                <I size={15} />
                {n.label}
              </button>
            );
          })}
        </div>
      </details>
      {node.copiedFrom && (
        <small className={styles.origin}>
          {gt("Copied from {workflow}, version {version}", {
            workflow: node.copiedFrom.workflow,
            version: node.copiedFrom.version,
          })}{" "}
          · {node.copiedFrom.node}
        </small>
      )}
    </>
  );
}
