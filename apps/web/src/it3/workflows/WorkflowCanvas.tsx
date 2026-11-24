import { useRef, useState } from "react";
import { Background, Controls, Panel, MarkerType, ReactFlow, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { T, useGT } from "gt-react";
import { Link, useBlocker } from "@tanstack/react-router";
import { GitBranch, Play, Plus, Network, LayoutTemplate } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  blankWorkflow,
  configurationProblem,
  type CanvasKind,
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
import { StepLibrary } from "./StepLibrary";

import { ScalarValue, WorkflowCard, arrangeNodes, nodeLibrary } from "./WorkflowNodes";
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
const nodeTypes = { card: WorkflowCard };
const portLabels = { next: "Next", yes: "Yes", no: "No" };
const fallbackPosition = (i: number) => ({ x: (i % 4) * 225, y: Math.floor(i / 4) * 150 });

interface Props {
  composable: boolean;
  definitionFiles: readonly { readonly name: string; readonly source: string }[];
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
  composable,
  definitionFiles,
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
  const createBlank = composable ? blankWorkflow : suiteTemplate;
  const initial = () => persisted ?? createBlank(file.replace(/\.flow\.ts$/, ""), projectId);
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
  const suite = doc.format === 1;
  const library = nodeLibrary(gt, suite);
  const [palette, setPalette] = useState<{ from: string; port: CanvasPort } | null>(null);
  const fitCanvas = useRef<() => void>(() => {});
  const [payload, setPayload] = useState(suite ? sample : '{\n  "status": "ready"\n}'),
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
    const next = readCanvas(text ?? "") ?? createBlank(file.replace(/\.flow\.ts$/, ""), projectId);
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
  const problem = configurationProblem(graph, doc.format) ?? graphProblem(graph);
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
  const origin = palette && graph.nodes.find((n) => n.id === palette.from);
  const fit = () => requestAnimationFrame(() => fitCanvas.current());
  const openPalette = (from: string, port: CanvasPort) => {
    select(from);
    setPalette({ from, port });
  };
  const add = (kind: CanvasKind, preset?: CanvasNode) => {
    if (locked || !palette || !origin || graph.nodes.length >= 12) return;
    const { from, port } = palette;
    const onward = graph.edges.find((e) => e.from === from && e.port === port);
    const first = portsFor(kind)[0];
    if (onward && !first) return;
    const id = kind + "-" + randomUUID().slice(0, 8);
    const label = kind === "review" ? gt("Approve this request?") : library[kind].title;
    const created: CanvasNode = preset
      ? { ...preset, id }
      : suite
        ? { id, kind, label, predicate: "failed", output: "summary" }
        : kind === "branch" || kind === "set"
          ? { id, kind, label, field: "status", literal: '"ready"' }
          : { id, kind, label };
    const edges = graph.edges.filter((e) => e !== onward);
    edges.push({ from, port, to: id });
    if (onward && first) edges.push({ from: id, port: first, to: onward.to });
    const next = { nodes: [...graph.nodes, created], edges };
    const start = layout[from] ?? { x: 0, y: 0 };
    let y = start.y + (port === "no" ? 205 : 0);
    const x = start.x + 265;
    while (Object.values(layout).some((p) => Math.abs(p.x - x) < 205 && Math.abs(p.y - y) < 180))
      y += 205;
    setLayout({ ...layout, [id]: { x, y } });
    setGraph(next);
    select(id);
    setPalette(null);
    fit();
  };
  const removeNode = () => {
    const positions = { ...layout };
    delete positions[node.id];
    setLayout(positions);
    const successor = graph.edges.find((e) => e.from === node.id && e.port === "next")?.to;
    const edges = graph.edges.filter((e) => e.from !== node.id && e.to !== node.id);
    if (successor)
      edges.push(
        ...graph.edges
          .filter((e) => e.to === node.id && e.from !== node.id && e.from !== successor)
          .map((e) => ({ ...e, to: successor })),
      );
    setPalette(null);
    setGraph({
      nodes: graph.nodes.filter((n) => n.id !== node.id),
      edges,
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
      setMessage(gt("Enter valid JSON."));
      return;
    }
    if (!suite && (input === null || typeof input !== "object" || Array.isArray(input))) {
      setMessage(gt("Enter a JSON object with named fields."));
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
            {suite ? gt("Suite report (JSON)") : gt("Workflow input (JSON object)")}
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
            onInit={(instance) => {
              fitCanvas.current = () => {
                void instance.fitView({ padding: 0.22, maxZoom: 1, duration: 200 });
              };
            }}
            nodes={shown.nodes.map((n, i) => ({
              id: n.id,
              type: "card",
              position: layout[n.id] ?? fallbackPosition(i),
              data: {
                node: n,
                suite,
                open: portsFor(n.kind).filter(
                  (port) => !shown.edges.some((e) => e.from === n.id && e.port === port),
                ),
                canInsert: !locked && graph.nodes.length < 12,
                onInsert: (port: CanvasPort) => openPalette(n.id, port),
                selected: n.id === node.id,
                status: steps.get(n.id)?.status ?? null,
              },
            }))}
            edges={shown.edges.map((e) => ({
              id: e.from + "/" + e.port,
              source: e.from,
              sourceHandle: e.port,
              target: e.to,
              style:
                e.from === node.id || e.to === node.id
                  ? { stroke: "var(--foreground)", strokeWidth: 2.2 }
                  : {},
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color:
                  e.from === node.id || e.to === node.id
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
              },
            }))}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => {
              select(n.id);
              setPalette(null);
            }}
            onPaneClick={() => setPalette(null)}
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
            <Panel position="top-left" className={styles.toolbox}>
              <div className={styles.tools}>
                <button
                  type="button"
                  disabled={locked || graph.nodes.length >= 12}
                  onClick={() => {
                    if (palette) {
                      setPalette(null);
                      return;
                    }
                    const anchor = portsFor(node.kind).length
                      ? node
                      : shown.nodes.find((n) => n.kind === "start")!;
                    const ports = portsFor(anchor.kind);
                    openPalette(
                      anchor.id,
                      ports.find(
                        (port) => !graph.edges.some((e) => e.from === anchor.id && e.port === port),
                      ) ?? ports[0]!,
                    );
                  }}
                >
                  <Plus size={16} />
                  <T>Add step</T>
                </button>
                <button
                  type="button"
                  disabled={locked || graph.nodes.length < 2}
                  onClick={() => {
                    setLayout(arrangeNodes(graph));
                    fit();
                  }}
                >
                  <Network size={15} />
                  <T>Arrange</T>
                </button>
                {base === null && suite && composable && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={async () => {
                      if (
                        modified &&
                        !(await requestConfirmDialog(
                          gt("Replace this draft with a blank workflow?"),
                        ))
                      )
                        return;
                      const blank = blankWorkflow(doc.name, projectId);
                      setDoc(blank);
                      setGraph(blank.revisions[0]!);
                      setLayout(blank.layout);
                      select("start");
                      setPayload("{}");
                      setPalette(null);
                      fit();
                    }}
                  >
                    <Plus size={15} />
                    <T>Start blank</T>
                  </button>
                )}
                {base === null && !modified && !suite && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      const template = suiteTemplate(doc.name, projectId);
                      setDoc(template);
                      setGraph(template.revisions[0]!);
                      setLayout(arrangeNodes(template.revisions[0]!));
                      setPayload(sample);
                      setPalette(null);
                      fit();
                    }}
                  >
                    <LayoutTemplate size={15} />
                    <T>Use suite template</T>
                  </button>
                )}
              </div>
              {palette && origin && !locked && (
                <StepLibrary
                  key={origin.id + "/" + palette.port}
                  definitionFiles={definitionFiles}
                  projectId={doc.projectId}
                  suite={suite}
                  connection={origin.label + " → " + portLabels[palette.port]}
                  occupied={graph.edges.some(
                    (e) => e.from === origin.id && e.port === palette.port,
                  )}
                  add={add}
                  close={() => setPalette(null)}
                />
              )}
            </Panel>
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className={styles.inspector}>
          <div className={styles.inspectorTitle}>
            <strong>{library[node.kind].title}</strong>
            <span>
              <T>Inspector</T>
            </span>
          </div>
          <label>
            <T>Selected node</T>
            <select
              aria-label={gt("Selected node")}
              value={node.id}
              onChange={(e) => {
                select(e.target.value);
                setPalette(null);
              }}
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
          {suite && node.kind === "result" && (
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
          {suite && node.kind === "branch" && (
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
          {node.copiedFrom && (
            <small className={styles.origin}>
              {gt("Copied from {workflow}, version {version}", {
                workflow: node.copiedFrom.workflow,
                version: node.copiedFrom.version,
              })}{" "}
              · {node.copiedFrom.node}
            </small>
          )}
          {!suite && (node.kind === "set" || node.kind === "branch") && (
            <>
              <label>
                <T>Field name</T>
                <input
                  value={node.field ?? ""}
                  disabled={locked}
                  maxLength={160}
                  onChange={(e) => patchNode({ field: e.target.value })}
                />
              </label>
              <ScalarValue
                literal={node.literal ?? '""'}
                label={node.kind === "branch" ? gt("Equals") : gt("Value")}
                disabled={locked}
                onChange={(literal) => patchNode({ literal })}
              />
            </>
          )}
          {portsFor(node.kind).length > 0 && (
            <h3 className={styles.sectionLabel}>
              <T>Connections</T>
            </h3>
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
              {problem && (
                <p className={styles.validation} role="status">
                  {graph.nodes.length === 1
                    ? gt("Choose Add step to connect your first step.")
                    : problem}
                </p>
              )}
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
