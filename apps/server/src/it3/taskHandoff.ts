// @effect-diagnostics nodeBuiltinImport:off -- deterministic native message and command IDs.
import * as NodeCrypto from "node:crypto";
import {
  CommandId,
  MessageId,
  TaskLedgerError,
  type ThreadId,
  type ProjectId,
  type OrchestrationV2ThreadShell,
  type TaskWrite,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

import { readTask, writeTask } from "./taskLedger.ts";

export const handleTaskWrite = Effect.fn("it3.task.edit")(function* <
  ReadError,
  SendError,
  ProjectError,
>(
  directory: string,
  input: typeof TaskWrite.Type,
  operator: string,
  threads: {
    getThreadShell: (
      id: ThreadId,
    ) => Effect.Effect<
      Pick<
        OrchestrationV2ThreadShell,
        "projectId" | "archivedAt" | "deletedAt" | "worktreePath"
      > | null,
      ReadError
    >;
    sendToThread: (
      input: Parameters<ThreadManagementService["Service"]["sendToThread"]>[0],
    ) => Effect.Effect<unknown, SendError>;
  },
  projects: { getById: (id: ProjectId) => Effect.Effect<Option.Option<unknown>, ProjectError> },
) {
  const { projectId, edit } = input;
  const actor = { kind: "operator" as const, id: operator };
  const project = yield* projects
    .getById(projectId)
    .pipe(Effect.mapError(() => new TaskLedgerError({ detail: "Could not read this project." })));
  if (Option.isNone(project))
    return yield* new TaskLedgerError({ detail: "Project does not exist." });
  if (edit.change.action !== "handoff" && edit.change.action !== "notify")
    return yield* writeTask(directory, projectId, edit, actor);
  const before = yield* readTask(directory, projectId, edit.key);
  const slot = before.brief?.attempts.find((a) => a.number === edit.attempt);
  const target = edit.change.action === "handoff" ? edit.change.target : slot?.owner;
  if (!target) return yield* new TaskLedgerError({ detail: "Choose a receiving chat." });
  const shell = yield* threads
    .getThreadShell(target)
    .pipe(
      Effect.mapError(() => new TaskLedgerError({ detail: "Could not read the receiving chat." })),
    );
  if (!shell || shell.projectId !== projectId || shell.archivedAt || shell.deletedAt)
    return yield* new TaskLedgerError({ detail: "Choose an available chat in this project." });
  if (
    before.brief?.comparison &&
    (!shell.worktreePath ||
      before.brief.attempts.some(
        (other) =>
          other.number !== edit.attempt &&
          (other.owner === target || other.worktree === shell.worktreePath),
      ))
  )
    return yield* new TaskLedgerError({
      detail: "Choose a separate worktree chat for each attempt.",
    });
  if (slot?.hasClaimed && slot.worktree !== shell.worktreePath)
    return yield* new TaskLedgerError({ detail: "Choose a chat in the attempt’s worktree." });
  const saved =
    edit.change.action === "handoff"
      ? yield* writeTask(directory, projectId, edit, actor)
      : before.brief!;
  const a = saved.attempts.find((x) => x.number === edit.attempt)!;
  const generation = edit.generation + (edit.change.action === "handoff" ? 1 : 0);
  if (
    a.generation !== generation ||
    a.owner !== target ||
    a.stage !== "assigned" ||
    a.delivery === "queued"
  )
    return saved;
  const receipt = NodeCrypto.createHash("sha256")
    .update([projectId, edit.key, a.number, a.generation].join("\u0000"))
    .digest("hex");
  yield* threads
    .sendToThread({
      projectId,
      commandId: CommandId.make("it3-task-" + receipt),
      threadId: target,
      messageId: MessageId.make("it3-task-" + receipt),
      text: `iT3 task assignment ${edit.key}, attempt ${a.number}, generation ${a.generation}. Read t3_task_brief with this key. If its owner, attempt and generation still match this notice, use t3_task_update to claim it, declare intended files, verify the saved checkpoint and continue. Save progress after each subtask.`,
      attachments: [],
      mode: "queue",
      createdBy: "system",
      creationSource: "server",
    })
    .pipe(
      Effect.mapError(
        () =>
          new TaskLedgerError({
            detail: "Assignment saved. Chat delivery is unconfirmed. Use Retry delivery.",
          }),
      ),
    );
  // A quick recipient may already have acknowledged, or an operator may have reassigned it.
  const delivered = yield* writeTask(
    directory,
    projectId,
    {
      ...edit,
      generation: a.generation,
      revision: a.revision,
      requestId: "notice-" + receipt,
      change: { action: "notify" },
    },
    actor,
  ).pipe(
    Effect.catch(() =>
      readTask(directory, projectId, edit.key).pipe(Effect.map((page) => page.brief!)),
    ),
  );
  return delivered;
});
