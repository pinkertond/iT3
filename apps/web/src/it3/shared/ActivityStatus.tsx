import { useSyncExternalStore } from "react";
import { secondTick } from "@t3tools/client-runtime/clock";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { useGT } from "gt-react";
import {
  Circle,
  CircleCheck,
  CirclePause,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageCircleQuestion,
} from "lucide-react";
const staticSubscribe = () => () => {},
  staticTime = () => 0;
export function ActivityStatus({
  state,
  label,
  startedAt,
  endedAt,
}: {
  state: string;
  label?: string;
  startedAt?: string | undefined;
  endedAt?: string | null | undefined;
}) {
  const gt = useGT();
  const live =
    !!startedAt &&
    !endedAt &&
    ["running", "working", "waiting", "needs-input", "paused"].includes(state);
  const now = useSyncExternalStore(
    live ? secondTick.subscribe : staticSubscribe,
    live ? secondTick.getSnapshot : staticTime,
    staticTime,
  );
  const ms = startedAt ? (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt) : NaN;
  const [Icon, color, text] =
    state === "needs-input"
      ? ([MessageCircleQuestion, "text-warning", gt("Needs you")] as const)
      : state === "running" || state === "working"
        ? ([LoaderCircle, "text-info", gt("Running")] as const)
        : state === "waiting"
          ? ([Clock3, "text-warning", gt("Waiting")] as const)
          : state === "paused"
            ? ([CirclePause, "text-warning", gt("Paused")] as const)
            : ["completed", "accepted", "done"].includes(state)
              ? ([CircleCheck, "text-success", gt("Completed")] as const)
              : ["stopped", "cancelled", "failed"].includes(state)
                ? ([CircleX, "text-destructive", state] as const)
                : ([Circle, "text-muted-foreground", state] as const);
  return (
    <span data-activity-state={state} className="inline-flex items-center gap-1 text-xs">
      <Icon size={13} className={color} aria-hidden />
      {label ?? text}
      {Number.isFinite(ms) && ms >= 0 && (
        <span className="text-muted-foreground"> · {formatDuration(ms)}</span>
      )}
    </span>
  );
}
