import {
  BaseEdge,
  Position,
  type ConnectionLineComponentProps,
  type EdgeProps,
} from "@xyflow/react";
import type { CanvasPort } from "@t3tools/shared/it3WorkflowGraph";
import styles from "./workflowCanvas.module.css";

const outward = {
  [Position.Left]: [-1, 0],
  [Position.Right]: [1, 0],
  [Position.Top]: [0, -1],
  [Position.Bottom]: [0, 1],
} as const;

const point = (x: number, y: number) => `${x},${y}`;

// Keep the tip on the inlet and end the shaft at the centre of the rear face.
export function workflowConnector(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  from: Position,
  to: Position,
) {
  const [ax, ay] = outward[from],
    [bx, by] = outward[to];
  const x = tx + bx * 10,
    y = ty + by * 10;
  const shoulderX = x + bx * 4,
    shoulderY = y + by * 4;
  const distance = Math.hypot(shoulderX - sx, shoulderY - sy);
  const forward = (shoulderX - sx) * ax + (shoulderY - sy) * ay;
  const lead =
    forward > 0 ? Math.min(forward / 2, 95) : Math.max(16, Math.min(95, distance * 0.42));
  const start = point(sx, sy),
    first = point(sx + ax * lead, sy + ay * lead);
  const last = point(shoulderX + bx * lead, shoulderY + by * lead),
    end = point(shoulderX, shoulderY);
  let path = `M ${start} C ${first} ${last} ${end}`;
  if (from === Position.Right && to === Position.Left && shoulderX <= sx && Math.abs(y - sy) < 35) {
    const lane = Math.max(y, sy) + 70;
    path = `M ${start} C ${first} ${point(sx + lead, lane)} ${point((shoulderX + sx) / 2, lane)} S ${last} ${end}`;
  }
  const head = `M ${point(tx, ty)} L ${point(x - by * 4.5, y + bx * 4.5)} L ${point(x + by * 4.5, y - bx * 4.5)} Z`;
  const join = `M ${end} L ${point(x, y)}`;
  return { path, head, join };
}
export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  data,
}: EdgeProps) {
  const port: CanvasPort =
    sourceHandleId === "yes" ? "yes" : sourceHandleId === "no" ? "no" : "next";
  return (
    <Wire
      id={id}
      port={port}
      active={data?.active === true}
      geometry={workflowConnector(
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      )}
    />
  );
}

export function WorkflowConnectionPreview({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromHandle,
  toHandle,
}: ConnectionLineComponentProps) {
  const forward = fromHandle.type === "source";
  const port = (forward ? fromHandle : toHandle)?.id;
  const geometry = forward
    ? workflowConnector(fromX, fromY, toX, toY, fromPosition, toPosition)
    : workflowConnector(toX, toY, fromX, fromY, toPosition, fromPosition);
  return <Wire port={port === "yes" || port === "no" ? port : "next"} active geometry={geometry} />;
}

function Wire({
  id,
  port,
  active,
  geometry: { path, head, join },
}: {
  id?: string;
  port: CanvasPort;
  active: boolean;
  geometry: ReturnType<typeof workflowConnector>;
}) {
  return (
    <g className={styles.wire} data-port={port} data-active={active}>
      <BaseEdge
        {...(id ? { id } : { interactionWidth: 0 })}
        path={path}
        style={{
          stroke: "var(--wire)",
          strokeWidth: active ? 2.5 : 1.8,
          strokeDasharray: port === "no" ? "6 4" : undefined,
          strokeLinecap: "butt",
        }}
      />
      <path
        d={join}
        stroke="var(--wire)"
        strokeWidth={active ? 2.5 : 1.8}
        fill="none"
        pointerEvents="none"
        aria-hidden="true"
      />
      <path d={head} fill="var(--wire)" pointerEvents="none" aria-hidden="true" />
    </g>
  );
}
