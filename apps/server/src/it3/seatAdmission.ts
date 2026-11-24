import {
  TaskLedgerError,
  type OrchestrationV2ThreadShell,
  type ProjectId,
  type ProjectTaskSeat,
  type ServerSettings,
  type TaskWrite,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { previewSeat, type PreviewInput } from "./queuePreview.ts";
import { taskWatermark } from "./taskLedger.ts";

export function makeSeatAdmission<E, F>(
  directory: string,
  readSettings: Effect.Effect<ServerSettings, E>,
  getShell: (id: ThreadId) => Effect.Effect<OrchestrationV2ThreadShell | null, F>,
  readQueue: (
    offset: number,
    reviewerOnly: boolean,
    project: ProjectId,
  ) => Effect.Effect<PreviewInput, TaskLedgerError>,
) {
  const settings = readSettings.pipe(
    Effect.mapError(
      () => new TaskLedgerError({ detail: "Could not read the project seats and policy." }),
    ),
  );
  const resolve = (project: ProjectId, seat: ProjectTaskSeat) =>
    settings.pipe(Effect.map((s) => s.it3Workspaces?.projects?.[project]?.seats?.[seat] ?? null));
  const check = Effect.fn("it3.seat.admit")(function* (input: typeof TaskWrite.Type, id: ThreadId) {
    const place = (yield* settings).it3Workspaces?.projects?.[input.projectId];
    if ((place?.status ?? "active") !== "active")
      return yield* new TaskLedgerError({ detail: "Activate this project before routing work." });
    const shell = yield* getShell(id).pipe(
      Effect.mapError(() => new TaskLedgerError({ detail: "Could not read seat permissions." })),
    );
    if (
      !shell ||
      shell.interactionMode !== "plan" ||
      !["auto", "approval-required"].includes(shell.runtimeMode)
    )
      return yield* new TaskLedgerError({
        detail: "Choose a Plan chat using Auto or approval-required permissions.",
      });
    if (shell.pendingRuntimeRequest?.blocking !== false && shell.pendingRuntimeRequest)
      return yield* new TaskLedgerError({
        detail: "Answer the pending request in the seat chat first.",
      });
    if (!place?.queuePolicy) return;
    const watermark = yield* taskWatermark(directory);
    const queue = yield* readQueue(0, false, input.projectId);
    const focus = { projectId: input.projectId, key: input.edit.key, attempt: input.edit.attempt };
    const own = queue.attempts.find(
      (a) => a.projectId === focus.projectId && a.key === focus.key && a.attempt === focus.attempt,
    );
    const tier = own?.step?.route,
      route = tier && tier !== "check" ? place.queuePolicy[tier] : null;
    if (
      !route ||
      shell.modelSelection.instanceId !== route.instanceId ||
      shell.modelSelection.model !== route.model
    )
      return yield* new TaskLedgerError({
        detail: "Save a paid queue step and bind a Plan chat on its configured provider and model.",
      });
    const row = previewSeat(queue, focus).rows[0];
    if (row?.reason !== "ready")
      return yield* new TaskLedgerError({
        detail: row?.detail ?? "The project queue cannot admit this seat assignment.",
      });
    return watermark;
  });
  return { resolve, check };
}
