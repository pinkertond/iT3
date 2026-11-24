import { useId } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Check,
  X,
  ArrowRight,
  Braces,
  CheckCheck,
  Flag,
  GitBranch,
  LogIn,
  Plus,
  UserRound,
  Workflow,
  ListChecks,
  ClipboardList,
} from "lucide-react";
import { useGT } from "gt-react";
import {
  portsFor,
  workflowComponents,
  type CanvasGraph,
  type CanvasKind,
  type CanvasNode,
  type CanvasPort,
} from "@t3tools/shared/it3WorkflowGraph";
import { ActivityStatus } from "../shared/ActivityStatus";
import styles from "./workflowCanvas.module.css";

export function nodeLibrary(gt: ReturnType<typeof useGT>, suite: boolean) {
  const icons = {
    LogIn,
    Braces,
    GitBranch,
    UserRound,
    Flag,
    Workflow,
    ListChecks,
    CheckCheck,
    ClipboardList,
  };
  const entries = Object.entries(workflowComponents).map(
    ([key, c]) =>
      [
        key,
        {
          title: gt(c.title),
          icon: icons[c.icon],
          hint:
            suite && key === "start"
              ? gt("Summarize the suite report")
              : suite && key === "branch"
                ? gt("Branch on test outcomes")
                : suite && key === "result"
                  ? gt("Return the suite result")
                  : gt(c.description),
        },
      ] as const,
  );
  return Object.fromEntries(entries) as Record<CanvasKind, (typeof entries)[number][1]>;
}
export const insertableKinds = (suite: boolean, registered = false): readonly CanvasKind[] =>
  registered
    ? (Object.keys(workflowComponents) as CanvasKind[]).filter(
        (k) => k !== "start" && k !== "subflow",
      )
    : [suite ? "check" : "set", "branch", "review", "result"];
type CardData = {
  node: CanvasNode;
  selected: boolean;
  status: string | null;
  trace: "current" | "visited" | "unvisited" | null;
  suite: boolean;
  open: readonly CanvasPort[];
  canInsert: boolean;
  onInsert: (port: CanvasPort) => void;
};
export function WorkflowCard({ data }: NodeProps<Node<CardData>>) {
  const gt = useGT();
  const { node, status, selected, suite } = data;
  const { title, hint, icon: Icon } = nodeLibrary(gt, suite)[node.kind];
  const ports = portsFor(node.kind);
  const detail =
    !suite && (node.kind === "branch" || node.kind === "set")
      ? (node.field || "…") +
        " " +
        (node.kind === "branch" ? "=" : "←") +
        " " +
        (node.literal || "…")
      : suite && node.kind === "branch"
        ? node.predicate === "skipped"
          ? gt("Has skipped tests")
          : gt("Has failed tests")
        : node.kind === "subflow" && node.target
          ? node.target.workflow + " · v" + node.target.version
          : hint;
  return (
    <div
      className={styles.card}
      data-kind={node.kind}
      data-selected={selected}
      data-trace={data.trace ?? undefined}
      data-status={status ?? undefined}
    >
      {node.kind !== "start" && (
        <Handle className={styles.inlet} type="target" position={Position.Left} />
      )}
      <div className={styles.cardType}>
        <span className={styles.tile}>
          <Icon size={17} />
        </span>
        <span>{title}</span>
      </div>
      <strong>{node.label}</strong>
      <div className={styles.detail}>{detail}</div>
      {status && <ActivityStatus state={status} />}
      {ports.length > 0 && (
        <div className={styles.sockets}>
          {ports.map((port) => (
            <div className={styles.socket} key={port} data-port={port}>
              <span>
                {port === "yes" ? (
                  <Check size={11} />
                ) : port === "no" ? (
                  <X size={11} />
                ) : (
                  <ArrowRight size={11} />
                )}{" "}
                {port === "next" ? gt("Next") : port === "yes" ? gt("Yes") : gt("No")}
              </span>
              {data.canInsert && (
                <button
                  type="button"
                  className={styles.socketButton}
                  data-connected={!data.open.includes(port)}
                  aria-label={gt("Add step after {node} ({port})", { node: node.label, port })}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onInsert(port);
                  }}
                >
                  <Plus size={13} />
                </button>
              )}
              <Handle type="source" id={port} position={Position.Right} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function arrangeNodes(graph: CanvasGraph) {
  // A join belongs after its deepest predecessor. Drafts may also contain disconnected nodes.
  const incoming = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const edge of graph.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const depth = new Map<string, number>();
  const queue = graph.nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const edge of graph.edges.filter((e) => e.from === id)) {
      depth.set(edge.to, Math.max(depth.get(edge.to) ?? 0, (depth.get(id) ?? 0) + 1));
      const left = (incoming.get(edge.to) ?? 1) - 1;
      incoming.set(edge.to, left);
      if (left === 0) queue.push(edge.to);
    }
  }
  const positions: Record<string, { x: number; y: number }> = {};
  const occupied = new Map<number, number[]>();
  for (const id of [
    ...queue,
    ...graph.nodes.filter((n) => !queue.includes(n.id)).map((n) => n.id),
  ]) {
    const x = (depth.get(id) ?? 0) * 265;
    const candidates = graph.edges
      .filter((e) => e.to === id && positions[e.from])
      .map((e) => {
        const from = positions[e.from]!;
        return from.y + (e.port === "yes" ? -110 : e.port === "no" ? 110 : 0);
      })
      .sort((a, b) => a - b);
    const middle = Math.floor(candidates.length / 2);
    let y =
      candidates.length === 0
        ? 0
        : (candidates[middle]! + candidates[Math.floor((candidates.length - 1) / 2)]!) / 2;
    const lane = occupied.get(x) ?? [];
    while (lane.some((other) => Math.abs(other - y) < 205)) y += 205;
    positions[id] = { x, y };
    lane.push(y);
    occupied.set(x, lane);
  }
  return positions;
}

export function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; text: string }[];
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choices}>
      <legend>{label}</legend>
      <div>
        {options.map((o) => (
          <label key={o.id}>
            <input
              name={name}
              type="radio"
              checked={o.id === value}
              onChange={() => onChange(o.id)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ScalarValue({
  literal,
  label,
  onChange,
}: {
  literal: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const gt = useGT();
  const type = literal.startsWith('"')
    ? "text"
    : literal === "true" || literal === "false"
      ? "boolean"
      : literal === "null"
        ? "null"
        : "number";
  return (
    <>
      <Choices
        label={gt("Value type")}
        value={type}
        options={[
          { id: "text", text: gt("Text") },
          { id: "number", text: gt("Number") },
          { id: "boolean", text: gt("Boolean") },
          { id: "null", text: gt("Null") },
        ]}
        onChange={(v) =>
          onChange(
            ({ text: '""', number: "0", boolean: "true", null: "null" } as Record<string, string>)[
              v
            ]!,
          )
        }
      />
      {type === "boolean" ? (
        <Choices
          label={label}
          value={literal}
          options={[
            { id: "true", text: "true" },
            { id: "false", text: "false" },
          ]}
          onChange={onChange}
        />
      ) : (
        type !== "null" && (
          <label>
            {label}
            <input
              aria-label={label}
              type={type === "text" ? "text" : "number"}
              step={type === "number" ? "any" : undefined}
              value={type === "text" ? JSON.parse(literal) : literal}
              onChange={(e) =>
                onChange(type === "text" ? JSON.stringify(e.target.value) : e.target.value)
              }
            />
          </label>
        )
      )}
    </>
  );
}
