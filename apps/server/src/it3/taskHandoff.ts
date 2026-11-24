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

import { observeTurn, type SourceShell, type TaskCheckouts } from "./taskRecovery.ts";
import { type RecoveryEvidence, readTask, writeTask } from "./taskLedger.ts";

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
      | (Pick<
          OrchestrationV2ThreadShell,
          "projectId" | "archivedAt" | "deletedAt" | "worktreePath"
        > &
          SourceShell)
      | null,
      ReadError
    >;
    sendToThread: (
      input: Parameters<ThreadManagementService["Service"]["sendToThread"]>[0],
    ) => Effect.Effect<unknown, SendError>;
  },
  projects: {
    getById: (
      id: ProjectId,
    ) => Effect.Effect<Option.Option<{ workspaceRoot: string }>, ProjectError>;
  },
  checkouts: TaskCheckouts,
) {
  const { projectId, edit } = input;
  const actor = { kind: "operator" as const, id: operator };
  const project = yield* projects
    .getById(projectId)
    .pipe(Effect.mapError(() => new TaskLedgerError({ detail: "Could not read this project." })));
  if (Option.isNone(project))
    return yield* new TaskLedgerError({ detail: "Project does not exist." });
  if (
    edit.change.action !== "handoff" &&
    edit.change.action !== "notify" &&
    edit.change.action !== "inspect"
  )
    return yield* writeTask(directory, projectId, edit, actor);
  const before = yield* readTask(directory, projectId, edit.key);
  const slot = before.brief?.attempts.find((a) => a.number === edit.attempt);
  if (slot?.review && !slot.review.finished)
    return yield* new TaskLedgerError({
      detail: "Open the reviewer run to inspect or stop it. Its delivery has a separate receipt.",
    });
  const root = project.value.workspaceRoot;
  const evidence: RecoveryEvidence = {};
  const inspect = (a: NonNullable<typeof slot>, source: ThreadId) =>
    threads.getThreadShell(source).pipe(
      Effect.orElseSucceed(() => null),
      Effect.flatMap((shell) =>
        checkouts.inspect(
          a.worktree ?? root,
          a,
          source,
          observeTurn(shell?.projectId === projectId ? shell : null),
        ),
      ),
    );
  const persist = () =>
    writeTask(directory, projectId, edit, actor, evidence).pipe(
      Effect.onError(() =>
        evidence.recovery?.snapshot
          ? checkouts.release(slot?.worktree ?? root, evidence.recovery.snapshot)
          : Effect.void,
      ),
      Effect.tap((task) => {
        const kept = task.attempts.find((a) => a.number === edit.attempt)?.recovery?.snapshot;
        const obsolete = [slot?.recovery?.snapshot, evidence.recovery?.snapshot].filter(
          (ref): ref is string => !!ref && ref !== kept,
        );
        return Effect.forEach(obsolete, (ref) => checkouts.release(slot?.worktree ?? root, ref), {
          discard: true,
        });
      }),
    );
  if (edit.change.action === "inspect") {
    if (
      !slot?.owner ||
      slot.stage !== "working" ||
      slot.revision !== edit.revision ||
      slot.generation !== edit.generation
    )
      return yield* writeTask(directory, projectId, edit, actor);
    evidence.recovery = yield* inspect(slot, slot.owner);
    return yield* persist();
  }
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
  if (
    slot &&
    (slot.hasClaimed || slot.stage === "assigned") &&
    edit.change.action === "handoff" &&
    slot.revision === edit.revision &&
    slot.generation === edit.generation
  ) {
    if (!slot.owner || slot.owner === target)
      return yield* new TaskLedgerError({ detail: "Choose a different receiving chat." });
    // A queued recipient can wake later. Moving a pending transfer again requires a fresh checkout.
    if (
      slot.stage === "assigned" &&
      (slot.worktree === shell.worktreePath || slot.recovery?.sourceWorktree === shell.worktreePath)
    )
      return yield* new TaskLedgerError({
        detail: "Choose a fresh recovery worktree to redirect a pending assignment.",
      });
    const recovery = yield* inspect(slot, slot.owner);
    if (slot.worktree === shell.worktreePath) {
      if (recovery.observed !== "stopped") {
        if (recovery.snapshot) yield* checkouts.release(slot.worktree ?? root, recovery.snapshot);
        return yield* new TaskLedgerError({
          detail:
            "The previous turn has not confirmed a stop. Stop it in its chat or use a separate recovery worktree.",
        });
      }
    } else {
      const destination = shell.worktreePath;
      if (
        !destination ||
        !(yield* checkouts.worktrees(root)).includes(destination) ||
        !(yield* checkouts.distinct(slot.worktree ?? root, destination)) ||
        (slot.stage === "assigned" &&
          slot.recovery &&
          !(yield* checkouts.distinct(slot.recovery.sourceWorktree ?? root, destination))) ||
        !recovery.snapshot ||
        !(yield* checkouts.matches(destination, recovery.snapshot))
      ) {
        if (recovery.snapshot) yield* checkouts.release(slot.worktree ?? root, recovery.snapshot);
        return yield* new TaskLedgerError({
          detail:
            "The receiving worktree must contain the inspected checkout. Inspect the attempt and create a worktree from its recovery snapshot.",
        });
      }
      evidence.destination = destination;
    }
    evidence.recovery = recovery;
  }
  const saved = edit.change.action === "handoff" ? yield* persist() : before.brief!;
  const a = saved.attempts.find((x) => x.number === edit.attempt)!;
  const generation = edit.generation + (edit.change.action === "handoff" ? 1 : 0);
  if (
    a.generation !== generation ||
    a.owner !== target ||
    a.stage !== "assigned" ||
    a.delivery === "queued"
  )
    return saved;
  if (a.recovery && a.recovery.sourceWorktree === shell.worktreePath) {
    const former = yield* threads
      .getThreadShell(a.recovery.source)
      .pipe(Effect.orElseSucceed(() => null));
    if (observeTurn(former) !== "stopped")
      return yield* new TaskLedgerError({
        detail:
          "Assignment saved. The previous chat must stop before delivery. Then use Retry delivery.",
      });
  }
  const receipt = NodeCrypto.createHash("sha256")
    .update([projectId, edit.key, a.number, a.generation].join("\u0000"))
    .digest("hex");
  yield* threads
    .sendToThread({
      projectId,
      commandId: CommandId.make("it3-task-" + receipt),
      threadId: target,
      messageId: MessageId.make("it3-task-" + receipt),
      text: `Assigned iT3 task. Call t3_task_brief with this exact input: {"key":"${edit.key}","attempt":${a.number}}. Expected generation ${a.generation}. The host authenticates this chat. If assignedToThisChat includes ${a.number} and the generation matches, call t3_task_update now with action "claim", intended files and next action. A stage of "assigned" reserves the attempt for you. After claiming, review recovery.changes as unverified files, verify the checkpoint and continue. Save progress after each subtask.`,
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
