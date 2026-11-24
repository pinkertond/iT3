import * as Schema from "effect/Schema";

import { workflowComponents } from "./it3WorkflowRegistry.ts";
export { workflowComponents };
export { componentAccess } from "./it3WorkflowRegistry.ts";
const kinds = Object.keys(workflowComponents) as [
  keyof typeof workflowComponents,
  ...(keyof typeof workflowComponents)[],
];
const Kind = Schema.Literals(kinds);
export type CanvasKind = typeof Kind.Type;
const Predicate = Schema.Literals(["failed", "skipped"]);
const identifier = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,79}$/));
const label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160));
const GraphNode = Schema.Struct({
  id: identifier,
  kind: Kind,
  label,
  predicate: Schema.optionalKey(Predicate),
  output: Schema.optionalKey(Schema.Literals(["summary", "brief"])),
  target: Schema.optionalKey(
    Schema.Struct({
      workflow: identifier,
      version: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
    }),
  ),
  copiedFrom: Schema.optionalKey(
    Schema.Struct({
      workflow: identifier,
      version: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
      node: identifier,
    }),
  ),
  field: Schema.optionalKey(Schema.String),
  literal: Schema.optionalKey(Schema.String),
});
export type CanvasNode = typeof GraphNode.Type;
const Port = Schema.Literals(["next", "yes", "no"]);
export type CanvasPort = typeof Port.Type;
const Edge = Schema.Struct({ from: identifier, port: Port, to: identifier });
const Graph = Schema.Struct({
  nodes: Schema.Array(GraphNode).check(Schema.isMaxLength(12)),
  edges: Schema.Array(Edge).check(Schema.isMaxLength(24)),
});
export type CanvasGraph = typeof Graph.Type;
const Positions = Schema.Record(identifier, Schema.Struct({ x: Schema.Finite, y: Schema.Finite }));
export type CanvasLayout = typeof Positions.Type;
const Document = Schema.Struct({
  format: Schema.Literals([1, 2, 3]),
  legacyVersions: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  name: identifier,
  projectId: Schema.NullOr(label),
  revisions: Schema.Array(Graph).check(Schema.isMinLength(1)),
  layout: Positions,
});
export type CanvasDocument = typeof Document.Type;
const decode = Schema.decodeUnknownSync(Document);
export const portsFor = (kind: CanvasKind): readonly CanvasPort[] => workflowComponents[kind].ports;
export function graphProblem(graph: CanvasGraph): string | null {
  if (graph.nodes.length > 12) return "A graph can have up to 12 nodes.";
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  if (nodes.size !== graph.nodes.length) return "Node IDs must be unique.";
  const starts = graph.nodes.filter((n) => n.kind === "start");
  if (starts.length !== 1) return "A workflow needs one start node.";
  const outputs = new Set<string>();
  for (const e of graph.edges) {
    const from = nodes.get(e.from),
      to = nodes.get(e.to);
    if (!from || !to || to.kind === "start" || !portsFor(from.kind).includes(e.port))
      return "This connection has an invalid port or target.";
    const socket = e.from + "/" + e.port;
    if (outputs.has(socket)) return "Each output can have one destination.";
    outputs.add(socket);
  }
  for (const node of nodes.values()) {
    if (!node.label.trim() || node.label.length > 160)
      return "Give each node a label of 1 to 160 characters.";
    for (const port of portsFor(node.kind))
      if (!outputs.has(node.id + "/" + port)) return "Connect " + node.label + " (" + port + ").";
  }
  const visited = new Set<string>(),
    path = new Set<string>();
  function visit(id: string): boolean {
    if (path.has(id)) return false;
    if (visited.has(id)) return true;
    path.add(id);
    for (const e of graph.edges) if (e.from === id && !visit(e.to)) return false;
    path.delete(id);
    visited.add(id);
    return true;
  }
  if (!visit(starts[0]!.id))
    return "This version supports acyclic workflows. Remove the circular connection.";
  if (visited.size !== nodes.size) return "Connect every node to the start or remove unused nodes.";
  return null;
}

export function blankWorkflow(name: string, projectId: string | null): CanvasDocument {
  return {
    format: 2,
    name,
    projectId,
    revisions: [{ nodes: [{ id: "start", kind: "start", label: "Workflow input" }], edges: [] }],
    layout: { start: { x: 0, y: 0 } },
  };
}

export function configurationProblem(graph: CanvasGraph, format: 1 | 2 | 3): string | null {
  for (const n of graph.nodes) {
    if (format !== 3 && !["start", "set", "review", "check", "branch", "result"].includes(n.kind))
      return "This component needs workflow format 3.";
    if (
      workflowComponents[n.kind].settings === "workflow" &&
      (!n.target ||
        !/^[a-z][a-z0-9-]{0,79}$/.test(n.target.workflow) ||
        !Number.isSafeInteger(n.target.version) ||
        n.target.version < 1)
    )
      return "Choose a published workflow version.";
    if (format === 1) {
      if (n.kind === "set" || n.predicate === undefined || n.output === undefined)
        return "Invalid suite node configuration.";
      continue;
    }
    if (format === 2 && n.kind === "check") return "Suite checks belong to the suite template.";
    if (workflowComponents[n.kind].settings === "scalar") {
      if (!n.field?.trim() || n.field.length > 160)
        return "Enter a field name for " + n.label + ".";
      try {
        const value = JSON.parse(n.literal ?? "");
        if (
          (typeof value === "number" && !Number.isFinite(value)) ||
          (value !== null && typeof value === "object")
        )
          return "Use a JSON string, number, boolean or null for " + n.label + ".";
      } catch {
        return "Enter a valid JSON value for " + n.label + ".";
      }
    }
  }
  return null;
}

export function suiteTemplate(name: string, projectId: string | null): CanvasDocument {
  const node = (id: string, kind: CanvasKind, title: string): CanvasNode => ({
    id,
    kind,
    label: title,
    predicate: "failed",
    output: id === "brief" ? "brief" : "summary",
  });
  return {
    format: 1,
    name,
    projectId,
    layout: {
      start: { x: 0, y: 90 },
      check: { x: 210, y: 90 },
      branch: { x: 420, y: 90 },
      review: { x: 630, y: 0 },
      brief: { x: 850, y: 0 },
      finish: { x: 850, y: 180 },
    },
    revisions: [
      {
        nodes: [
          node("start", "start", "Suite report"),
          node("check", "check", "Verify report"),
          node("branch", "branch", "Any failures?"),
          node("review", "review", "Prepare a diagnosis brief?"),
          node("brief", "result", "Diagnosis brief"),
          node("finish", "result", "Record result"),
        ],
        edges: [
          { from: "start", port: "next", to: "check" },
          { from: "check", port: "next", to: "branch" },
          { from: "branch", port: "yes", to: "review" },
          { from: "branch", port: "no", to: "finish" },
          { from: "review", port: "yes", to: "brief" },
          { from: "review", port: "no", to: "finish" },
        ],
      },
    ],
  };
}

// Keep the interpreter for this format immutable. Old in-flight revisions replay it after restart.
// Only the JSON above it varies between definitions. File decoding checks the complete wrapper.
const interpreter = `
const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240));
const payload = Schema.Struct({
  suite: text, revision: text, evidence: text, complete: Schema.Boolean,
  cases: Schema.Array(Schema.Struct({name:text,outcome:Schema.Literals(["passed","failed","skipped"])})).check(Schema.isMaxLength(10000)),
});
for (const [index, graph] of canvas.revisions.entries()) {
  T3.workflow(canvas.name, {version:index+1,payload}, Effect.fn(function* (input) {
    yield* T3.title(input.suite + " · " + input.revision);
    let current = graph.nodes.find(n => n.kind === "start");
    let summary;
    while (current) {
      const {id,kind,label} = current;
      let port = "next";
      if (kind === "start") {
        summary = yield* T3.step(id,{returns:Schema.Json},Effect.sync(() => {
          const out={suite:input.suite,revision:input.revision,evidence:input.evidence,complete:input.complete,passed:0,failed:0,skipped:0,examples:[]};
          for (const t of input.cases) {
            out[t.outcome]++;
            if(t.outcome==="failed" && out.examples.length<3)out.examples.push(t.name);
          }
          return out;
        }));
      } else if(kind === "check") {
        const verdict = yield* T3.step(id,{returns:Schema.String},Effect.succeed(!summary.complete ? "Incomplete suite report" : summary.failed+summary.passed===0 ? "No tests executed" : "Complete"));
        if(verdict!=="Complete")return yield* T3.stop(verdict);
      } else if(kind === "branch") {
        const yes=yield* T3.step(id,{returns:Schema.Boolean},Effect.succeed(summary[current.predicate]>0));
        port=yes?"yes":"no";
      } else if(kind === "review") {
        const answer=yield* T3.ask(id,{title:label,choices:["Yes","No"],data:summary});
        port=Option.isSome(answer) && answer.value.choice==="Yes"?"yes":"no";
      } else {
        const result=current.output==="brief"
          ? {result:label,outcome:"diagnosis-requested",verification:"Rerun the failing cases, then the complete suite against the candidate revision.",projectId:canvas.projectId,...summary}
          : {result:label,outcome:"reported",projectId:canvas.projectId,...summary};
        return yield* T3.step(id,{returns:Schema.Json},Effect.succeed(result));
      }
      const edge=graph.edges.find(e=>e.from===id && e.port===port);
      current=graph.nodes.find(n=>n.id===edge?.to);
    }
    return yield* T3.stop("Missing workflow destination");
  }));
}
`;
// Format 1 keeps its original executable source for saved suite workflows.
const genericInterpreter = `
const payload = Schema.Record(Schema.String, Schema.Json);
for (const [index, graph] of canvas.revisions.entries()) {
  T3.workflow(canvas.name, {version:index+1,payload}, Effect.fn(function* (input) {
    let data=input;
    let node=graph.nodes.find(n=>n.kind==="start");
    while(node){
      let port="next";
      const {id,kind,field,literal,label}=node;
      if(kind==="start"){
        data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed(data));
      }else if(kind==="set"){
        data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed({...data,[field]:JSON.parse(literal)}));
      }else if(kind==="branch"){
        const match=Object.hasOwn(data,field) && data[field]===JSON.parse(literal);
        port=(yield* T3.step(id,{returns:Schema.Boolean},Effect.succeed(match)))?"yes":"no";
      }else if(kind==="review"){
        const answer=yield* T3.ask(id,{title:label,choices:["Yes","No"],data});
        port=Option.isSome(answer) && answer.value.choice==="Yes"?"yes":"no";
      }else if(kind==="result"){
        return yield* T3.step(id,{returns:Schema.Json},Effect.succeed(data));
      }
      const edge=graph.edges.find(e=>e.from===id && e.port===port);
      node=graph.nodes.find(n=>n.id===edge?.to);
    }
    return yield* T3.stop("Missing workflow destination");
  }));
}
`;
const formats = {
  1: { prefix: "// iT3 visual workflow v1\nconst canvas = ", runtime: interpreter },
  2: { prefix: "// iT3 visual workflow v2\nconst canvas = ", runtime: genericInterpreter },
} as const;
const v3Prefix = "// iT3 visual workflow v3\nconst canvas = ";
function registeredRuntime(doc: CanvasDocument) {
  const legacy = doc.legacyVersions ?? 0;
  const used = new Set(doc.revisions.slice(legacy).flatMap((g) => g.nodes.map((n) => n.kind)));
  const handlers = [...used]
    .sort()
    .map((k) => "case " + JSON.stringify(k) + ": {" + workflowComponents[k].handler + " break;}")
    .join("\n");
  const old = legacy
    ? genericInterpreter.replace(
        "canvas.revisions.entries()",
        "canvas.revisions.slice(0,canvas.legacyVersions).entries()",
      )
    : "";
  return (
    old +
    "\n" +
    `for(const [index,graph] of canvas.revisions.entries()){
 if(index<${legacy})continue;
 T3.workflow(canvas.name,{version:index+1,payload:Schema.Record(Schema.String,Schema.Json)},Effect.fn(function* (input){
 let data=input,node=graph.nodes.find(n=>n.kind==="start");
 while(node){const id=node.id;let port="next";
 switch(node.kind){${handlers}}
 const edge=graph.edges.find(e=>e.from===id && e.port===port);node=graph.nodes.find(n=>n.id===edge?.to);}
 return yield* T3.stop("Missing workflow destination");
 }));}\n`
  );
}
export function canvasSource(doc: CanvasDocument) {
  const { prefix, runtime } =
    doc.format === 3 ? { prefix: v3Prefix, runtime: registeredRuntime(doc) } : formats[doc.format];
  return prefix + JSON.stringify(doc, null, 2) + ";\n" + runtime;
}
export function readCanvas(source: string): CanvasDocument | null {
  const format = source.startsWith(v3Prefix) ? 3 : source.startsWith(formats[2].prefix) ? 2 : 1;
  const prefix = format === 3 ? v3Prefix : formats[format].prefix;
  if (!source.startsWith(prefix)) return null;
  try {
    const end = source.indexOf(";\n", prefix.length);
    const doc = decode(JSON.parse(source.slice(prefix.length, end)));
    const runtime = format === 3 ? registeredRuntime(doc) : formats[format].runtime;
    const legacy = doc.legacyVersions ?? 0;
    return end >= 0 &&
      doc.format === format &&
      legacy <= doc.revisions.length &&
      (!legacy || format === 3) &&
      source.slice(end + 2) === runtime &&
      doc.revisions.every(
        (g, i) => !graphProblem(g) && !configurationProblem(g, i < legacy ? 2 : format),
      )
      ? doc
      : null;
  } catch {
    return null;
  }
}
export function reviseCanvas(
  doc: CanvasDocument,
  graph: CanvasGraph,
  layout: CanvasLayout,
): CanvasDocument {
  return {
    ...doc,
    layout,
    revisions:
      JSON.stringify(doc.revisions.at(-1)) === JSON.stringify(graph)
        ? doc.revisions
        : [...doc.revisions, graph],
  };
}

export function suiteReviewPair(name: string, projectId: string | null) {
  const childName = name.slice(0, 61) + "-suite-review";
  const childGraph: CanvasGraph = {
    nodes: [
      { id: "start", kind: "start", label: "Suite report" },
      { id: "read", kind: "suite-read", label: "Summarize outcomes" },
      { id: "check", kind: "check", label: "Verify report" },
      {
        id: "branch",
        kind: "branch",
        label: "Any failures?",
        field: "hasFailures",
        literal: "true",
      },
      { id: "review", kind: "review", label: "Prepare a diagnosis brief?" },
      { id: "brief", kind: "suite-brief", label: "Prepare brief" },
      { id: "result", kind: "result", label: "Return evidence" },
    ],
    edges: [
      { from: "start", port: "next", to: "read" },
      { from: "read", port: "next", to: "check" },
      { from: "check", port: "next", to: "branch" },
      { from: "branch", port: "yes", to: "review" },
      { from: "branch", port: "no", to: "result" },
      { from: "review", port: "yes", to: "brief" },
      { from: "review", port: "no", to: "result" },
      { from: "brief", port: "next", to: "result" },
    ],
  };
  const child: CanvasDocument = {
    format: 3,
    name: childName,
    projectId,
    revisions: [childGraph],
    layout: {},
  };
  const parent: CanvasDocument = {
    format: 3,
    name,
    projectId,
    layout: {},
    revisions: [
      {
        nodes: [
          { id: "start", kind: "start", label: "Suite report" },
          {
            id: "review-suite",
            kind: "subflow",
            label: "Review test report",
            target: { workflow: childName, version: 1 },
          },
          { id: "result", kind: "result", label: "Return evidence" },
        ],
        edges: [
          { from: "start", port: "next", to: "review-suite" },
          { from: "review-suite", port: "next", to: "result" },
        ],
      },
    ],
  };
  return { parent, child };
}

export function extractSubflow(
  graph: CanvasGraph,
  ids: readonly string[],
  name: string,
  projectId: string | null,
): { error: string } | { child: CanvasDocument; parent: CanvasGraph; entry: string } {
  const chosen = new Set(ids),
    nodes = graph.nodes.filter((n) => chosen.has(n.id));
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(name))
    return { error: "Use a lowercase workflow name with letters, numbers and hyphens." };
  if (!nodes.length || nodes.some((n) => n.kind === "start" || n.kind === "result"))
    return { error: "Select inner steps between input and output." };
  const enters = graph.edges.filter((e) => !chosen.has(e.from) && chosen.has(e.to));
  const exits = graph.edges.filter((e) => chosen.has(e.from) && !chosen.has(e.to));
  const entry = enters[0]?.to,
    exit = exits[0]?.to;
  if (!entry || !exit || enters.some((e) => e.to !== entry) || exits.some((e) => e.to !== exit))
    return { error: "Select a region with one entry step and one shared destination." };
  const fresh = (base: string) => {
    let id = base;
    while (chosen.has(id)) id += "-";
    return id;
  };
  const start = fresh("input"),
    result = fresh("output");
  const inside: CanvasGraph = {
    nodes: [
      { id: start, kind: "start", label: "Input" },
      ...nodes,
      { id: result, kind: "result", label: "Output" },
    ],
    edges: [
      { from: start, port: "next", to: entry },
      ...graph.edges
        .filter((e) => chosen.has(e.from))
        .map((e) => (chosen.has(e.to) ? e : { ...e, to: result })),
    ],
  };
  const parent: CanvasGraph = {
    nodes: [
      ...graph.nodes.filter((n) => !chosen.has(n.id)),
      { id: entry, kind: "subflow", label: name, target: { workflow: name, version: 1 } },
    ],
    edges: [
      ...graph.edges.filter((e) => !chosen.has(e.from)),
      { from: entry, port: "next", to: exit },
    ],
  };
  const error = graphProblem(inside) ?? graphProblem(parent);
  if (error) return { error };
  return { entry, parent, child: { name, projectId, format: 3, revisions: [inside], layout: {} } };
}
