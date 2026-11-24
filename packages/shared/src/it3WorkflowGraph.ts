import * as Schema from "effect/Schema";

const Kind = Schema.Literals(["start", "check", "branch", "review", "result", "set"]);
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
  format: Schema.Literals([1, 2]),
  name: identifier,
  projectId: Schema.NullOr(label),
  revisions: Schema.Array(Graph).check(Schema.isMinLength(1)),
  layout: Positions,
});
export type CanvasDocument = typeof Document.Type;
const decode = Schema.decodeUnknownSync(Document);
export const portsFor = (kind: CanvasKind): readonly CanvasPort[] =>
  kind === "result" ? [] : kind === "review" || kind === "branch" ? ["yes", "no"] : ["next"];
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

export function configurationProblem(graph: CanvasGraph, format: 1 | 2): string | null {
  for (const n of graph.nodes) {
    if (format === 1) {
      if (n.kind === "set" || n.predicate === undefined || n.output === undefined)
        return "Invalid suite node configuration.";
      continue;
    }
    if (n.kind === "check") return "Suite checks belong to the suite template.";
    if (n.kind === "branch" || n.kind === "set") {
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
export function canvasSource(doc: CanvasDocument) {
  const { prefix, runtime } = formats[doc.format];
  return prefix + JSON.stringify(doc, null, 2) + ";\n" + runtime;
}
export function readCanvas(source: string): CanvasDocument | null {
  const format = source.startsWith(formats[2].prefix) ? 2 : 1;
  const { prefix, runtime } = formats[format];
  if (!source.startsWith(prefix) || !source.endsWith(";\n" + runtime)) return null;
  try {
    const doc = decode(JSON.parse(source.slice(prefix.length, -(2 + runtime.length))));
    return doc.format === format &&
      doc.revisions.every((g) => !graphProblem(g) && !configurationProblem(g, format))
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
