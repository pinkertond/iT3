import { useRef, useState } from "react";
import { Background, Controls, Panel, ReactFlow, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { T, useGT } from "gt-react";
import { Link, useBlocker } from "@tanstack/react-router";
import { GitBranch, Play, Plus, Network, LayoutTemplate } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  blankWorkflow,
  suiteReviewPair,
  type CanvasDocument,
  configurationProblem,
  workflowComponents,
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
import { ActivityStatus } from "../shared/ActivityStatus";
import { descendantQuestion, traceRun } from "./runOverlay";
import { ExtractSubflow } from "./ExtractSubflow";
import { StepLibrary } from "./StepLibrary";

import { StepInspector } from "./StepInspector";
import { WorkflowEdge, WorkflowConnectionPreview } from "./WorkflowEdge";
import { WorkflowCard, arrangeNodes, nodeLibrary } from "./WorkflowNodes";
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
const edgeTypes = { workflow: WorkflowEdge };
const nodeTypes = { card: WorkflowCard };
const portLabels = { next: "Next", yes: "Yes", no: "No" };
const fallbackPosition = (i: number) => ({ x: (i % 4) * 225, y: Math.floor(i / 4) * 150 });

interface Props {
  registered?: boolean;
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
  registered = false,
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
  const createBlank = (name: string, project: string | null): CanvasDocument =>
    registered
      ? { ...blankWorkflow(name, project), format: 3 }
      : composable
        ? blankWorkflow(name, project)
        : suiteTemplate(name, project);
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
  const [drill, setDrill] = useState<
    { doc: CanvasDocument; version: number; previous: string; runId: string | null }[]
  >([]);
  const [pending, setPending] = useState<CanvasDocument[]>([]);
  const publishedChildren = useRef(new Map<string, string>());
  const [extracting, setExtracting] = useState(false);
  const layer = drill.at(-1),
    viewDoc = layer?.doc ?? doc;
  const suite = viewDoc.format === 1;
  const canCompose = registered && !suite;
  const catalog = definitionFiles.flatMap((f) => {
    const d = f.name.endsWith(".flow.ts") ? readCanvas(f.source) : null;
    return d && d.projectId === doc.projectId && f.name === d.name + ".flow.ts" ? [d] : [];
  });
  const documents = [...catalog, ...pending.filter((d) => !catalog.some((c) => c.name === d.name))];
  const library = nodeLibrary(gt, suite);
  const [palette, setPalette] = useState<{ from: string; port: CanvasPort } | null>(null);
  const fitCanvas = useRef<() => void>(() => {});
  const suiteInput =
    suite ||
    graph.nodes.some(
      (n) =>
        n.kind === "suite-read" ||
        (n.target &&
          documents
            .find((d) => d.name === n.target?.workflow)
            ?.revisions[n.target.version - 1]?.nodes.some((step) => step.kind === "suite-read")),
    );
  const [payload, setPayload] = useState(suiteInput ? sample : '{\n  "status": "ready"\n}'),
    [runId, setRunId] = useState<string | null>(null);
  const viewingRun = layer ? layer.runId : runId;
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
    viewingRun
      ? serverEnvironment.workflowRun({ environmentId: env, input: { runId: viewingRun } })
      : null,
  );
  const runData = run.data?.run.runId === viewingRun ? run.data : null;
  const modified = graph !== doc.revisions.at(-1) || layout !== doc.layout;
  const dirty = base === null || modified;
  const stale =
    source !== base &&
    source === seen &&
    !(writeEcho !== null && writeEcho.previous === source && writeEcho.saved === base);
  const unmanaged = source !== null && persisted?.name !== file.replace(/\.flow\.ts$/, "");
  const adopt = (text: string | null) => {
    const next = readCanvas(text ?? "") ?? createBlank(file.replace(/\.flow\.ts$/, ""), projectId);
    setPending([]);
    setDrill([]);
    setExtracting(false);
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
  const shown = layer
    ? layer.doc.revisions[layer.version - 1]!
    : runData
      ? (doc.revisions[runData.run.version - 1] ?? graph)
      : graph;
  const shownLayout = layer ? { ...arrangeNodes(shown), ...layer.doc.layout } : layout;
  const trace = traceRun(shown, runData),
    steps = trace.steps;
  const waitingQuestion = history.data?.questions?.find((q) => q.runId === viewingRun);
  const childReceipt = trace.active && steps.get(trace.active + "/start")?.result;
  const childQuestion =
    typeof childReceipt === "string"
      ? descendantQuestion(childReceipt, history.data?.runs ?? [], history.data?.questions ?? [])
      : null;
  const question = waitingQuestion ?? childQuestion;
  const state = question ? "needs-input" : runData?.run.status;
  const node = shown.nodes.find((n) => n.id === selected) ?? shown.nodes[0]!;
  const problem =
    configurationProblem(graph, registered && doc.format === 2 ? 3 : doc.format) ??
    graphProblem(graph);
  const locked = !writable || offline || busy || runId !== null || !!layer;
  const child = node.target && documents.find((d) => d.name === node.target?.workflow);
  const parentPins = documents.flatMap((d) =>
    d.revisions
      .at(-1)!
      .nodes.filter((n) => n.kind === "subflow" && n.target?.workflow === viewDoc.name)
      .map((n) => ({ name: d.name, step: n.id, version: n.target!.version })),
  );
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
    setExtracting(false);
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
        : workflowComponents[kind].settings === "scalar"
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
    const upgrading =
      registered &&
      doc.format === 2 &&
      graph.nodes.some((n) => !["start", "branch", "set", "result", "review"].includes(n.kind));
    const targetDoc = upgrading
      ? { ...doc, format: 3 as const, legacyVersions: base === null ? 0 : doc.revisions.length }
      : doc;
    const next =
        base === null
          ? { ...targetDoc, revisions: [graph], layout }
          : reviseCanvas(targetDoc, graph, layout),
      text = canvasSource(next);
    setBusy(true);
    setMessage("");
    try {
      for (const childDoc of pending) {
        const childFile = childDoc.name + ".flow.ts",
          source = canvasSource(childDoc);
        const existing = definitionFiles.find((f) => f.name === childFile);
        if (
          existing?.source === source ||
          (!existing && publishedChildren.current.get(childFile) === source)
        )
          continue;
        const written = await save({
          environmentId: env,
          input: { name: childFile, source, expectedSource: null },
        });
        if (written._tag !== "Success") {
          setMessage(String(squashAtomCommandFailure(written)));
          return;
        }
        if (!written.value.changed || written.value.problems.length) {
          setMessage(
            written.value.problems.map((p) => p.message).join("\n") ||
              gt("The subflow could not be published."),
          );
          return;
        }
        publishedChildren.current.set(childFile, source);
      }
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
        publishedChildren.current.clear();
        setPending([]);
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
  const stepState = (id: string) => {
    const recorded = steps.get(id)?.status ?? (steps.has(id + "/start") ? "running" : null);
    if (waitingQuestion?.name === id || (childQuestion && trace.active === id))
      return "needs-input";
    if (trace.active === id && recorded === "running" && runData) return runData.run.status;
    return recorded;
  };
  const observed = steps.get(node.id);
  const evidence = observed?.result ?? observed?.detail;
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
          <h2>{viewDoc.name}</h2>
        </div>
        <span className={styles.meta}>
          {layer
            ? gt("Version {version}", { version: layer.version })
            : base === null
              ? gt("Draft")
              : gt("Version {version}", { version: runData?.run.version ?? latest })}
          {dirty && base !== null && " · " + gt("Unpublished")}
        </span>
        {layer ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              select(layer.previous);
              setDrill(drill.slice(0, -1));
              fit();
            }}
          >
            <T>Back to parent</T>
          </Button>
        ) : runId ? (
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
      {runData && (
        <div className={styles.runSummary}>
          <ActivityStatus
            state={state ?? runData.run.status}
            startedAt={runData.run.startedAt}
            endedAt={runData.run.endedAt}
          />
          <strong>{shown.nodes.find((n) => n.id === trace.active)?.label}</strong>
          <span>
            {question &&
            typeof question.request === "object" &&
            question.request &&
            "title" in question.request
              ? String(question.request.title)
              : runData.run.detail}
          </span>
          {childQuestion && typeof childReceipt === "string" && (
            <Link to="/workflows" search={{ env, run: childQuestion.runId }}>
              <T>Open child question</T>
            </Link>
          )}
          <span>
            {gt("{count} of {total} steps visited", {
              count: trace.visited.size,
              total: shown.nodes.length,
            })}
          </span>
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
              position: shownLayout[n.id] ?? fallbackPosition(i),
              data: {
                node: n,
                suite,
                open: portsFor(n.kind).filter(
                  (port) => !shown.edges.some((e) => e.from === n.id && e.port === port),
                ),
                canInsert: !locked && graph.nodes.length < 12,
                onInsert: (port: CanvasPort) => openPalette(n.id, port),
                selected: n.id === node.id,
                trace: runData
                  ? n.id === trace.active
                    ? "current"
                    : trace.visited.has(n.id)
                      ? "visited"
                      : "unvisited"
                  : null,
                status: stepState(n.id),
              },
            }))}
            edges={shown.edges.map((e) => ({
              id: e.from + "/" + e.port,
              source: e.from,
              sourceHandle: e.port,
              target: e.to,
              type: "workflow",
              data: {
                active: runData
                  ? trace.edges.has(e.from + "/" + e.port)
                  : e.from === node.id || e.to === node.id,
                trace: runData
                  ? trace.edges.has(e.from + "/" + e.port)
                    ? "taken"
                    : "untaken"
                  : undefined,
              },
            }))}
            connectionLineComponent={WorkflowConnectionPreview}
            edgeTypes={edgeTypes}
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
                    setExtracting(false);
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
                {canCompose && !locked && (
                  <button
                    type="button"
                    disabled={!!problem || graph.nodes.length < 3}
                    onClick={() => {
                      setExtracting(!extracting);
                      setPalette(null);
                    }}
                  >
                    <Network size={15} />
                    <T>Extract subflow</T>
                  </button>
                )}
                {base === null &&
                  (suite ||
                    pending.length > 0 ||
                    graph.nodes.some((n) => n.id === "review-suite")) &&
                  composable &&
                  !layer && (
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
                        const blank = createBlank(doc.name, projectId);
                        publishedChildren.current.clear();
                        setPending([]);
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
                {base === null && !modified && !suite && !layer && !pending.length && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      const pair = registered ? suiteReviewPair(doc.name, projectId) : null;
                      const template = pair?.parent ?? suiteTemplate(doc.name, projectId);
                      if (pair) {
                        const existing = documents.find((d) => d.name === pair.child.name);
                        if (
                          existing &&
                          JSON.stringify(readCanvas(canvasSource(pair.child))?.revisions[0]) !==
                            JSON.stringify(existing.revisions[0])
                        ) {
                          setMessage(gt("The suite template name is already in use."));
                          return;
                        }
                        setPending(existing ? [] : [pair.child]);
                      }
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
              {extracting && !locked && (
                <ExtractSubflow
                  graph={graph}
                  projectId={doc.projectId}
                  names={[
                    doc.name,
                    ...definitionFiles.map((f) => f.name.replace(/\.flow\.ts$/, "")),
                    ...pending.map((d) => d.name),
                  ]}
                  close={() => setExtracting(false)}
                  apply={(child, parent, entry) => {
                    setPending([...pending, child]);
                    setGraph(parent);
                    setLayout(arrangeNodes(parent));
                    select(entry);
                    setExtracting(false);
                    fit();
                  }}
                />
              )}
              {palette && origin && !locked && (
                <StepLibrary
                  key={origin.id + "/" + palette.port}
                  subflows={documents.filter((d) => d.name !== doc.name)}
                  registered={canCompose}
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
          <StepInspector
            key={node.id + "/" + (runId ?? "edit")}
            node={node}
            graph={shown}
            locked={locked}
            suite={suite}
            select={(id) => {
              select(id);
              setPalette(null);
            }}
            patch={patchNode}
            wire={(port, to) => connect(node.id, port, to)}
            add={(port) => openPalette(node.id, port)}
            remove={removeNode}
          />
          {node.target && (
            <section className={styles.subflowActions}>
              <strong>
                {node.target.workflow} · v{node.target.version}
              </strong>
              {child && child.revisions[node.target.version - 1] && (
                <button
                  type="button"
                  onClick={() => {
                    const id = steps.get(node.id + "/start")?.result;
                    setDrill([
                      ...drill,
                      {
                        doc: child,
                        version: node.target!.version,
                        previous: node.id,
                        runId: typeof id === "string" ? id : null,
                      },
                    ]);
                    select(
                      child.revisions[node.target!.version - 1]!.nodes.find(
                        (n) => n.kind === "start",
                      )!.id,
                    );
                    setPalette(null);
                    fit();
                  }}
                >
                  <T>Inspect pinned subflow</T>
                </button>
              )}
              {child && !locked && child.revisions.length > node.target.version && (
                <button
                  type="button"
                  onClick={() =>
                    patchNode({ target: { workflow: child.name, version: child.revisions.length } })
                  }
                >
                  {gt("Adopt version {version}", { version: child.revisions.length })}
                </button>
              )}
              {child && catalog.some((d) => d.name === child.name) && (
                <Link
                  to="/workflows"
                  search={{
                    env,
                    ...(doc.projectId ? { project: doc.projectId } : {}),
                    definitions: true,
                    file: child.name + ".flow.ts",
                    visual: true,
                  }}
                >
                  <T>Edit published subflow</T>
                </Link>
              )}
            </section>
          )}
          {!!parentPins.length && (
            <details>
              <summary>
                <T>Used by</T> ({parentPins.length})
              </summary>
              {parentPins.map((p) => (
                <p key={p.name + "/" + p.step}>
                  <Link
                    to="/workflows"
                    search={{
                      env,
                      ...(doc.projectId ? { project: doc.projectId } : {}),
                      definitions: true,
                      file: p.name + ".flow.ts",
                      visual: true,
                    }}
                  >
                    {p.name}
                  </Link>{" "}
                  · {p.step} · v{p.version}
                </p>
              ))}
            </details>
          )}
          {viewingRun ? (
            <section>
              <h3>
                <T>Run evidence</T>
              </h3>
              {(run.error || !runData) && <p>{run.error ?? gt("Loading run…")}</p>}
              {observed && (
                <p>
                  <ActivityStatus
                    state={stepState(node.id) ?? observed.status}
                    startedAt={observed.startedAt}
                    endedAt={observed.endedAt ?? runData?.run.endedAt}
                  />
                  {" · "}
                  {observed.attempts === 1
                    ? gt("1 attempt")
                    : gt("{count} attempts", { count: observed.attempts })}
                </p>
              )}
              {layer && (
                <Link to="/workflows" search={{ env, run: viewingRun }}>
                  <T>Open native run</T>
                </Link>
              )}
              {evidence != null && <pre>{JSON.stringify(evidence, null, 2)}</pre>}
              {!observed && runData && (
                <p>
                  {steps.has(node.id + "/start")
                    ? gt("Child workflow started.")
                    : gt("No recorded step here.")}
                </p>
              )}
            </section>
          ) : (
            <>
              {!layer && recent.length > 0 && (
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
              {!layer && problem && (
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
