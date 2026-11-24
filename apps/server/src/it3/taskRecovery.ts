// @effect-diagnostics nodeBuiltinImport:off -- isolated Git checkpoint references.
import * as NodeFSP from "node:fs/promises";
import * as NodeCrypto from "node:crypto";
import {
  CheckpointRef,
  TaskLedgerError,
  type OrchestrationV2ThreadShell,
  type TaskAttempt,
  type TaskRecovery,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { CheckpointStore } from "../checkpointing/CheckpointStore.ts";
import type { GitVcsDriver } from "../vcs/GitVcsDriver.ts";

export type SourceShell = Partial<
  Pick<
    OrchestrationV2ThreadShell,
    | "status"
    | "activeRunId"
    | "activityRunStatus"
    | "pendingBackgroundTasks"
    | "pendingRuntimeRequest"
  >
>;
export function observeTurn(shell: SourceShell | null): TaskRecovery["observed"] {
  if (!shell) return "unknown";
  if (
    shell.activeRunId ||
    shell.activityRunStatus ||
    shell.pendingBackgroundTasks?.length ||
    shell.pendingRuntimeRequest ||
    ["queued", "preparing", "running", "starting", "waiting"].includes(shell.status ?? "")
  )
    return "busy";
  return ["completed", "interrupted", "cancelled", "rolled_back"].includes(shell.status ?? "")
    ? "stopped"
    : "unknown";
}

export function taskCheckouts(store: CheckpointStore["Service"], git: GitVcsDriver["Service"]) {
  const execute = (cwd: string, args: string[]) =>
    git.execute({
      operation: "it3.task.recovery",
      cwd,
      args,
      maxOutputBytes: 1024 * 1024,
    });
  // One native capture includes dirty and untracked files. The real Git index stays intact.
  const capture = Effect.fn("it3.task.capture")(function* (cwd: string) {
    const ref = CheckpointRef.make("refs/it3/tasks/" + NodeCrypto.randomUUID());
    yield* store.captureCheckpoint({ cwd, checkpointRef: ref });
    return ref;
  });
  const baseline = (cwd: string) => capture(cwd).pipe(Effect.orElseSucceed(() => undefined));
  const inspect = Effect.fn("it3.task.inspect")(function* (
    cwd: string,
    a: TaskAttempt,
    source: ThreadId,
    observed: TaskRecovery["observed"],
  ) {
    const snapshot = yield* baseline(cwd);
    const captured = DateTime.formatIso(yield* DateTime.now);
    const diff =
      a.baseline && snapshot
        ? yield* execute(cwd, [
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--ignore-submodules=none",
            "--name-only",
            "-z",
            "--relative",
            a.baseline,
            snapshot,
            "--",
            ".",
          ]).pipe(Effect.orElseSucceed(() => null))
        : null;
    const compared = !!diff && !diff.stdoutTruncated;
    const paths = compared ? diff.stdout.split("\0").filter(Boolean) : [];
    return {
      source,
      sourceWorktree: a.worktree,
      observed,
      captured,
      snapshot: snapshot ?? null,
      compared,
      total: paths.length,
      changes: paths.slice(0, 64).map((path) => ({ path, declared: a.files.includes(path) })),
    } satisfies TaskRecovery;
  });
  const release = (cwd: string, ref: string) =>
    !/^refs\/it3\/tasks\/[a-f0-9-]+$/.test(ref)
      ? Effect.void
      : store
          .deleteCheckpointRefs({ cwd, checkpointRefs: [CheckpointRef.make(ref)] })
          .pipe(Effect.ignore);
  const matches = Effect.fn("it3.task.matchWorktree")(function* (cwd: string, snapshot: string) {
    const ref = yield* capture(cwd);
    return yield* execute(cwd, [
      "diff",
      "--quiet",
      "--no-ext-diff",
      "--ignore-submodules=none",
      snapshot,
      ref,
      "--",
    ]).pipe(
      Effect.map((r) => r.exitCode === 0),
      Effect.ensuring(release(cwd, ref)),
    );
  });
  const worktreeId = Effect.fn("it3.task.worktreeId")(function* (cwd: string) {
    if ((yield* execute(cwd, ["rev-parse", "--show-prefix"])).stdout.trim()) return null;
    const directory = (yield* execute(cwd, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
    return yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(directory),
      catch: () => new TaskLedgerError({ detail: "Cannot identify the Git worktree." }),
    });
  });
  const distinct = (from: string, to: string) =>
    Effect.all([worktreeId(from), worktreeId(to)]).pipe(
      Effect.map(([a, b]) => a !== null && b !== null && a !== b),
      Effect.orElseSucceed(() => false),
    );
  return {
    baseline,
    inspect,
    release,
    distinct,
    matches: (cwd: string, ref: string) =>
      matches(cwd, ref).pipe(Effect.orElseSucceed(() => false)),
    worktrees: (cwd: string) =>
      git.listWorktreePaths(cwd).pipe(Effect.orElseSucceed((): readonly string[] => [])),
  };
}
export type TaskCheckouts = ReturnType<typeof taskCheckouts>;
