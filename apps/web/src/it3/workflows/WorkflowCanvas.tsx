import { useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type NodeProps,
  type Node,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { T, useGT } from "gt-react";
import { Link, useBlocker } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, GitBranch, Play, Square, UserRound } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  canvasSource,
  graphProblem,
  portsFor,
  readCanvas,
  reviseCanvas,
  suiteTemplate,
  type CanvasGraph,
  type CanvasNode,
  type CanvasPort,
} from "@t3tools/shared/it3WorkflowGraph";
import { requestConfirmDialog } from "~/confirmDialog";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { randomUUID } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import styles from "./workflowCanvas.module.css";

const icon = {
  start: Play,
  check: ClipboardCheck,
  branch: GitBranch,
  review: UserRound,
  result: Square,
};
const sample = JSON.stringify(
  {
    suite: "Unit tests",
    revision: "example",
    evidence: "ci/unit/42",
    complete: true,
    cases: [{ name: "Preserve urgent reserve", outcome: "failed" }],
  },
  null,
  2,
);
const kinds = ["check", "branch", "review", "result"] as const;
type CardData = { node: CanvasNode; selected: boolean; status: string | null };
function Card({ data }: NodeProps<Node<CardData>>) {
  const { node, status, selected } = data,
    Icon = icon[node.kind];
  return (
    <div
      className={styles.card}
      data-kind={node.kind}
      data-selected={selected}
      data-status={status ?? undefined}
    >
      {node.kind !== "start" && <Handle type="target" position={Position.Left} />}
      <div className={styles.kicker}>
        <Icon size={13} />
        {node.kind}
      </div>
      <strong>{node.label}</strong>
      {status && <small>{status}</small>}
      {portsFor(node.kind).map((port, i) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          style={{ top: portsFor(node.kind).length === 1 ? "50%" : i === 0 ? "32%" : "74%" }}
          title={port}
        />
      ))}
    </div>
  );
}
const nodeTypes = { card: Card };
const portLabels = { next: "Next", yes: "Yes", no: "No" };
const fallbackPosition = (i: number) => ({ x: (i % 4) * 225, y: Math.floor(i / 4) * 150 });

interface Props {
  env: EnvironmentId;
  file: string;
  source: string | null;
  projectId: string | null;
  writable: boolean;
  offline: boolean;
  onSource: () => void;
  onDelete?: (() => Promise<boolean>) | undefined;
  onDeleted: () => void;
}
export default function WorkflowCanvas({
  env,
  file,
  source,
  projectId,
  writable,
  offline,
  onSource,
  onDelete,
  onDeleted,
}: Props) {
  const gt = useGT();
  const persisted = source === null ? null : readCanvas(source);
  const initial = () => persisted ?? suiteTemplate(file.replace(/\.flow\.ts$/, ""), projectId);
  const [doc, setDoc] = useState(initial),
    [graph, setGraph] = useState<CanvasGraph>(() => doc.revisions.at(-1)!);
  const [layout, setLayout] = useState(doc.layout),
    [base, setBase] = useState(source),
    [seen, setSeen] = useState(source);
  const [writeEcho, setWriteEcho] = useState<{ previous: string | null; saved: string } | null>(
    null,
  );
  const [selected, select] = useState("start"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [kind, setKind] = useState<(typeof kinds)[number]>("check"),
    [payload, setPayload] = useState(sample),
    [runId, setRunId] = useState<string | null>(null);
  const [runForm, setRunForm] = useState(false);
  const released = useRef(false);
  const pendingStart = useRef<{ input: string; key: string } | null>(null);
  const save = useAtomCommand(serverEnvironment.saveWorkflowDefinition, "publish visual workflow");
  const start = useAtomCommand(serverEnvironment.it3StartWorkflow, "start visual workflow");
  const history = useEnvironmentQuery(
    serverEnvironment.workflowsLive({ environmentId: env, input: {} }),
  );
  const recent = (history.data?.runs ?? [])
    .filter((r) => r.workflow === doc.name && r.version <= doc.revisions.length)
    .slice(0, 12);
  const run = useEnvironmentQuery(
    runId ? serverEnvironment.workflowRun({ environmentId: env, input: { runId } }) : null,
  );
  const runData = run.data?.run.runId === runId ? run.data : null;
  const modified = graph !== doc.revisions.at(-1) || layout !== doc.layout;
  const dirty = base === null || modified;
  const stale =
    source !== base &&
    source === seen &&
    !(writeEcho !== null && writeEcho.previous === source && writeEcho.saved === base);
  const unmanaged = source !== null && persisted?.name !== file.replace(/\.flow\.ts$/, "");
  const adopt = (text: string | null) => {
    const next =
      readCanvas(text ?? "") ?? suiteTemplate(file.replace(/\.flow\.ts$/, ""), projectId);
    setDoc(next);
    setGraph(next.revisions.at(-1)!);
    setLayout(next.layout);
    setBase(text);
    select("start");
    setMessage("");
  };
  if (source !== seen) {
    setSeen(source);
    setWriteEcho(null);
    if (!dirty && source !== base) adopt(source);
  }
  useBlocker({
    shouldBlockFn: async () =>
      modified &&
      !released.current &&
      !(await (requestConfirmDialog(gt("Discard unpublished workflow changes?")) ??
        Promise.resolve(false))),
    enableBeforeUnload: () => modified && !released.current,
  });
  const latest = doc.revisions.length;
  const shown = runData ? (doc.revisions[runData.run.version - 1] ?? graph) : graph;
  const steps = new Map(runData?.steps.map((s) => [s.name, s]));
  const node = shown.nodes.find((n) => n.id === selected) ?? shown.nodes[0]!;
  const problem = graphProblem(graph);
  const locked = !writable || offline || busy || runId !== null;
  const patchNode = (patch: Partial<CanvasNode>) =>
    setGraph({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
    });
  const connect = (from: string, port: CanvasPort, to: string | null) => {
    if (locked) return;
    const edges = graph.edges.filter((e) => !(e.from === from && e.port === port));
    if (to) edges.push({ from, port, to });
    setGraph({ ...graph, edges });
  };
  const wire = (c: Connection) => {
    if (
      c.source &&
      c.target &&
      c.source !== c.target &&
      c.sourceHandle &&
      ["next", "yes", "no"].includes(c.sourceHandle)
    )
      connect(c.source, c.sourceHandle as CanvasPort, c.target);
  };
  const add = () => {
    const id = kind + "-" + randomUUID().slice(0, 8);
    const position = layout[node.id] ?? { x: 0, y: 0 };
    setLayout({ ...layout, [id]: { x: position.x + 40, y: position.y + 140 } });
    setGraph({
      ...graph,
      nodes: [...graph.nodes, { id, kind, label: kind, predicate: "failed", output: "summary" }],
    });
    select(id);
  };
  const removeNode = () => {
    const positions = { ...layout };
    delete positions[node.id];
    setLayout(positions);
    setGraph({
      nodes: graph.nodes.filter((n) => n.id !== node.id),
      edges: graph.edges.filter((e) => e.from !== node.id && e.to !== node.id),
    });
    select("start");
  };
  const publish = async () => {
    if (locked || stale || problem) return;
    const next =
        base === null ? { ...doc, revisions: [graph], layout } : reviseCanvas(doc, graph, layout),
      text = canvasSource(next);
    setBusy(true);
    setMessage("");
    try {
      const result = await save({
        environmentId: env,
        input: { name: file, source: text, expectedSource: base },
      });
      if (result._tag !== "Success") {
        setMessage(String(squashAtomCommandFailure(result)));
        return;
      }
      setMessage(result.value.problems.map((p) => p.message).join("\n") || gt("Published"));
      if (result.value.changed) {
        setWriteEcho({ previous: base, saved: text });
        setBase(text);
        setDoc(next);
        setGraph(next.revisions.at(-1)!);
        setLayout(next.layout);
      }
    } finally {
      setBusy(false);
    }
  };
  const launch = async () => {
    if (locked || dirty || stale) return;
    let input;
    try {
      input = JSON.parse(payload);
    } catch {
      setMessage(gt("Enter a valid JSON report."));
      return;
    }
    const signature = JSON.stringify([latest, payload]);
    if (pendingStart.current?.input !== signature)
      pendingStart.current = { input: signature, key: randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const result = await start({
        environmentId: env,
        input: {
          name: doc.name,
          version: latest,
          key: pendingStart.current.key,
          file,
          expectedSource: base!,
          input,
        },
      });
      if (result._tag !== "Success") {
        setMessage(String(squashAtomCommandFailure(result)));
        return;
      }
      pendingStart.current = null;
      setRunId(result.value.runId);
      setRunForm(false);
    } finally {
      setBusy(false);
    }
  };
  const status = runData?.run.status;
  if (unmanaged && base === source)
    return (
      <div className={styles.notice}>
        <p>
          <T>This file uses a different source format. Open it in the native editor.</T>
        </p>
        <Button size="sm" onClick={onSource}>
          <T>Open source</T>
        </Button>
      </div>
    );
  return (
    <section className={styles.editor} aria-label={gt("Visual workflow editor")}>
      <header className={styles.bar}>
        <div>
          <div className={styles.kicker}>
            <GitBranch size={14} />
            <T>Workflow canvas</T>
          </div>
          <h2>{doc.name}</h2>
        </div>
        <span className={styles.meta}>
          {base === null
            ? gt("Draft")
            : gt("Version {version}", { version: runData?.run.version ?? latest })}
          {dirty && base !== null && " · " + gt("Unpublished")}
        </span>
        {runId ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setRunId(null)}>
              <T>Back to editing</T>
            </Button>
            <Link to="/workflows" search={{ env, run: runId }}>
              <T>Open native run</T>
            </Link>
          </>
        ) : (
          <>
            {base !== null && (
              <Button size="sm" variant="ghost" disabled={dirty || busy} onClick={onSource}>
                <T>Source</T>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={locked || dirty || stale}
              onClick={() => setRunForm(!runForm)}
            >
              <Play size={14} />
              <T>Run workflow</T>
            </Button>
            <Button
              size="sm"
              disabled={locked || !dirty || stale || !!problem}
              onClick={() => void publish()}
            >
              <T>Publish</T>
            </Button>
          </>
        )}
      </header>
      {stale && (
        <div className={styles.notice} role="status">
          <T>The saved definition changed.</T>{" "}
          <button
            onClick={async () => {
              if (
                !dirty ||
                (await requestConfirmDialog(gt("Discard unpublished workflow changes?")))
              )
                adopt(source);
            }}
          >
            <T>Reload saved version</T>
          </button>
        </div>
      )}
      {message && (
        <div role="status" className={styles.notice}>
          {message}
        </div>
      )}
      {offline && (
        <div className={styles.notice}>
          <T>Host disconnected</T>
        </div>
      )}
      {runForm && (
        <form
          className={styles.input}
          onSubmit={(e) => {
            e.preventDefault();
            void launch();
          }}
        >
          <label>
            <T>Suite report (JSON)</T>
            <textarea rows={5} value={payload} onChange={(e) => setPayload(e.target.value)} />
          </label>
          <Button type="submit" size="sm" disabled={locked || dirty || stale}>
            <T>Start run</T>
          </Button>
        </form>
      )}
      <div className={styles.body}>
        <div className={styles.stage}>
          <ReactFlow
            nodes={shown.nodes.map((n, i) => ({
              id: n.id,
              type: "card",
              position: layout[n.id] ?? fallbackPosition(i),
              data: {
                node: n,
                selected: n.id === node.id,
                status: steps.get(n.id)?.status ?? null,
              },
            }))}
            edges={shown.edges.map((e) => ({
              id: e.from + "/" + e.port,
              source: e.from,
              sourceHandle: e.port,
              target: e.to,
              label: e.port === "next" ? undefined : portLabels[e.port],
              markerEnd: { type: MarkerType.ArrowClosed },
            }))}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => select(n.id)}
            onConnect={wire}
            onNodesChange={(changes) => {
              if (!locked)
                setLayout((old) => {
                  let next = old;
                  for (const c of changes)
                    if (c.type === "position" && c.position) {
                      if (next === old) next = { ...old };
                      Object.assign(next, { [c.id]: c.position });
                    }
                  return next;
                });
            }}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={2}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className={styles.inspector}>
          <div className={styles.kicker}>
            <T>Inspector</T>
            <ChevronRight size={12} />
            {node.kind}
          </div>
          <label>
            <T>Selected node</T>
            <select
              aria-label={gt("Selected node")}
              value={node.id}
              onChange={(e) => select(e.target.value)}
            >
              {shown.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T>Node label</T>
            <input
              maxLength={160}
              value={node.label}
              disabled={locked}
              onChange={(e) => patchNode({ label: e.target.value })}
            />
          </label>
          {node.kind === "result" && (
            <label>
              <T>Result format</T>
              <select
                value={node.output}
                disabled={locked}
                onChange={(e) =>
                  patchNode({ output: e.target.value === "brief" ? "brief" : "summary" })
                }
              >
                <option value="summary">
                  <T>Suite summary</T>
                </option>
                <option value="brief">
                  <T>Diagnosis brief</T>
                </option>
              </select>
            </label>
          )}
          {node.kind === "branch" && (
            <label>
              <T>Condition</T>
              <select
                value={node.predicate}
                disabled={locked}
                onChange={(e) =>
                  patchNode({ predicate: e.target.value === "skipped" ? "skipped" : "failed" })
                }
              >
                <option value="failed">
                  <T>Has failed tests</T>
                </option>
                <option value="skipped">
                  <T>Has skipped tests</T>
                </option>
              </select>
            </label>
          )}
          {portsFor(node.kind).map((port) => (
            <label key={port}>
              {portLabels[port]}
              <select
                aria-label={portLabels[port]}
                disabled={locked}
                value={shown.edges.find((e) => e.from === node.id && e.port === port)?.to ?? ""}
                onChange={(e) => connect(node.id, port, e.target.value || null)}
              >
                <option value="">
                  <T>Choose destination</T>
                </option>
                {shown.nodes
                  .filter((n) => n.kind !== "start" && n.id !== node.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          {runId ? (
            <section>
              <h3>
                <T>Run evidence</T>
              </h3>
              <p>{run.error ?? status ?? gt("Loading run…")}</p>
              {steps.has(node.id) ? (
                <pre>
                  {JSON.stringify(
                    steps.get(node.id)?.result ??
                      steps.get(node.id)?.detail ??
                      steps.get(node.id)?.status,
                    null,
                    2,
                  )}
                </pre>
              ) : (
                <p>
                  <T>No recorded step here.</T>
                </p>
              )}
            </section>
          ) : (
            <>
              {node.kind !== "start" && (
                <Button variant="outline" size="sm" disabled={locked} onClick={removeNode}>
                  <T>Remove node</T>
                </Button>
              )}
              <section>
                <label>
                  <T>Node type</T>
                  <select
                    disabled={locked}
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  >
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked || graph.nodes.length >= 12}
                  onClick={add}
                >
                  <T>Add node</T>
                </Button>
              </section>
              {recent.length > 0 && (
                <section>
                  <label>
                    <T>Inspect a previous run</T>
                    <select
                      value=""
                      disabled={dirty || busy}
                      onChange={(e) => {
                        if (e.target.value) {
                          setRunId(e.target.value);
                          setRunForm(false);
                        }
                      }}
                    >
                      <option value="">
                        <T>Select run</T>
                      </option>
                      {recent.map((r) => (
                        <option key={r.runId} value={r.runId}>
                          {r.title} · v{r.version} · {r.status} ·{" "}
                          {new Date(r.startedAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              )}
              {problem && <p role="status">{problem}</p>}
              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked}
                  onClick={async () => {
                    if (await onDelete()) {
                      released.current = true;
                      onDeleted();
                    }
                  }}
                >
                  <T>Delete workflow</T>
                </Button>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
