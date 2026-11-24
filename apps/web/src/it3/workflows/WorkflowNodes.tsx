import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Braces, CheckCheck, Flag, GitBranch, LogIn, Plus, UserRound } from "lucide-react";
import { useGT } from "gt-react";
import {
  portsFor,
  type CanvasGraph,
  type CanvasKind,
  type CanvasNode,
  type CanvasPort,
} from "@t3tools/shared/it3WorkflowGraph";
import styles from "./workflowCanvas.module.css";

export function nodeLibrary(gt: ReturnType<typeof useGT>, suite: boolean) {
  return {
    start: {
      icon: LogIn,
      title: gt("Input"),
      hint: suite ? gt("Summarize the suite report") : gt("Receive a JSON object"),
    },
    set: { icon: Braces, title: gt("Set field"), hint: gt("Write a value into the data") },
    check: {
      icon: CheckCheck,
      title: gt("Check report"),
      hint: gt("Require a completed test suite"),
    },
    branch: {
      icon: GitBranch,
      title: gt("Condition"),
      hint: suite ? gt("Branch on test outcomes") : gt("Compare a field with a value"),
    },
    review: { icon: UserRound, title: gt("Approval"), hint: gt("Ask a person to choose a path") },
    result: {
      icon: Flag,
      title: gt("Output"),
      hint: suite ? gt("Return the suite result") : gt("Return the current data"),
    },
  };
}
export const insertableKinds = (suite: boolean): readonly CanvasKind[] => [
  suite ? "check" : "set",
  "branch",
  "review",
  "result",
];

type CardData = {
  node: CanvasNode;
  selected: boolean;
  status: string | null;
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
        : hint;
  return (
    <div
      className={styles.card}
      data-kind={node.kind}
      data-selected={selected}
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
      {status && <small>{status}</small>}
      {ports.length > 0 && (
        <div className={styles.sockets}>
          {ports.map((port) => (
            <div className={styles.socket} key={port}>
              <span>{port === "next" ? gt("Next") : port === "yes" ? gt("Yes") : gt("No")}</span>
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

export function ScalarValue({
  literal,
  label,
  disabled,
  onChange,
}: {
  literal: string;
  label: string;
  disabled: boolean;
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
    <div className={styles.valueEditor}>
      <label>
        {gt("Value type")}
        <select
          aria-label={gt("Value type")}
          value={type}
          disabled={disabled}
          onChange={(e) => {
            const values: Record<string, string> = {
              text: '""',
              number: "0",
              boolean: "true",
              null: "null",
            };
            onChange(values[e.target.value]!);
          }}
        >
          <option value="text">{gt("Text")}</option>
          <option value="number">{gt("Number")}</option>
          <option value="boolean">{gt("Boolean")}</option>
          <option value="null">{gt("Null")}</option>
        </select>
      </label>
      {type !== "null" && (
        <label>
          {label}
          {type === "boolean" ? (
            <select
              aria-label={label}
              value={literal}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              aria-label={label}
              type={type === "text" ? "text" : "number"}
              step={type === "number" ? "any" : undefined}
              disabled={disabled}
              value={type === "text" ? JSON.parse(literal) : literal}
              onChange={(e) =>
                onChange(type === "text" ? JSON.stringify(e.target.value) : e.target.value)
              }
            />
          )}
        </label>
      )}
    </div>
  );
}
