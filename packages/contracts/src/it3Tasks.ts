import { QueueStep } from "./it3Queue.ts";
import * as Schema from "effect/Schema";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const short = TrimmedNonEmptyString.check(Schema.isMaxLength(160));
const key = short.check(Schema.isPattern(/^[\p{L}\p{N}][\p{L}\p{N}._:/-]*$/u));
const note = TrimmedNonEmptyString.check(Schema.isMaxLength(4000));
const files = Schema.Array(short).check(Schema.isMaxLength(64));
const steps = Schema.Array(Schema.Struct({ title: short, done: Schema.Boolean })).check(
  Schema.isMaxLength(64),
);
export const TaskRecovery = Schema.Struct({
  source: ThreadId,
  sourceWorktree: Schema.NullOr(Schema.String),
  observed: Schema.Literals(["stopped", "busy", "unknown"]),
  captured: Schema.String,
  snapshot: Schema.NullOr(Schema.String),
  compared: Schema.Boolean,
  total: NonNegativeInt,
  changes: Schema.Array(Schema.Struct({ path: Schema.String, declared: Schema.Boolean })),
});
export type TaskRecovery = typeof TaskRecovery.Type;
const ReviewReceipt = Schema.Struct({
  id: Schema.String,
  thread: ThreadId,
  pool: Schema.String,
  driver: Schema.String,
  identified: Schema.Boolean,
  provider: Schema.String,
  model: Schema.String,
  phase: Schema.Literals(["reserved", "running", "completed", "failed"]),
  day: Schema.String,
  spentBeforeTokens: NonNegativeInt,
  spentBeforeUsd: Schema.NullOr(Schema.Number),
  reservedTokens: NonNegativeInt,
  reservedUsd: Schema.NullOr(Schema.Number),
  windowPercent: Schema.Number,
  run: Schema.NullOr(Schema.String),
  detail: Schema.String,
  finished: Schema.NullOr(Schema.String),
  nextAccounting: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tokens: Schema.NullOr(NonNegativeInt),
  pricedUsd: Schema.NullOr(Schema.Number),
});
export type ReviewReceipt = typeof ReviewReceipt.Type;
export const TaskAttempt = Schema.Struct({
  guarded: Schema.optionalKey(
    Schema.Struct({
      base: Schema.String,
      candidate: Schema.String,
      role: Schema.Literals(["builder", "reviewer", "test-maintainer"]),
      round: NonNegativeInt,
      contest: Schema.String,
      testPath: Schema.String,
      history: Schema.Array(ReviewReceipt),
      approved: Schema.optionalKey(Schema.Boolean),
      stopped: Schema.Boolean,
    }),
  ),
  reviewHold: Schema.optionalKey(Schema.String),
  review: Schema.optionalKey(ReviewReceipt),
  number: Schema.Literals([1, 2]),
  generation: NonNegativeInt,
  revision: NonNegativeInt,
  stage: Schema.Literals(["ready", "assigned", "working", "submitted"]),
  hasClaimed: Schema.Boolean,
  delivery: Schema.Literals(["none", "saved", "queued", "acknowledged"]),
  owner: Schema.NullOr(ThreadId),
  ownerTitle: Schema.String,
  model: Schema.String,
  worktree: Schema.NullOr(Schema.String),
  files,
  steps,
  baseline: Schema.optionalKey(Schema.String),
  recovery: Schema.optionalKey(TaskRecovery),
  checkpoint: Schema.String,
  next: Schema.String,
  verification: Schema.String,
  updated: Schema.String,
});
export type TaskAttempt = typeof TaskAttempt.Type;
export const TaskBrief = Schema.Struct({
  basedOn: Schema.optionalKey(key),
  protectedImplementation: Schema.optionalKey(Schema.Literal(true)),
  queueStep: Schema.optionalKey(QueueStep),
  key,
  title: short,
  request: note,
  reference: Schema.String,
  comparison: Schema.Boolean,
  accepted: Schema.NullOr(Schema.Number),
  attempts: Schema.Array(TaskAttempt),
});
export type TaskBrief = typeof TaskBrief.Type;
const workerActions = [
  Schema.Struct({ action: Schema.Literal("claim"), files, next: note }),
  Schema.Struct({
    action: Schema.Literal("checkpoint"),
    files,
    steps,
    checkpoint: note,
    next: note,
    verification: Schema.String.check(Schema.isMaxLength(4000)),
  }),
  Schema.Struct({ action: Schema.Literal("submit"), verification: note, checkpoint: note }),
] as const;
const TaskAction = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("create"),
    basedOn: Schema.optionalKey(key),
    protectedImplementation: Schema.optionalKey(Schema.Literal(true)),
    title: short,
    request: note,
    reference: Schema.String.check(Schema.isMaxLength(1000)),
    comparison: Schema.Boolean,
    steps,
  }),
  Schema.Struct({ action: Schema.Literal("handoff"), target: ThreadId, next: note }),
  Schema.Struct({ action: Schema.Literal("inspect") }),
  Schema.Struct({ action: Schema.Literal("plan"), step: Schema.NullOr(QueueStep) }),
  ...workerActions,
  Schema.Struct({ action: Schema.Literal("notify") }),
  Schema.Struct({ action: Schema.Literal("verifyCandidate"), commit: short, evidence: note }),
  Schema.Struct({ action: Schema.Literal("accept") }),
]);
export const TaskEdit = Schema.Struct({
  key,
  attempt: Schema.Literals([1, 2]),
  generation: NonNegativeInt,
  revision: NonNegativeInt,
  requestId: short,
  change: TaskAction,
});
export const TaskWorkerEdit = Schema.Struct({
  ...TaskEdit.fields,
  change: Schema.Union(workerActions),
});
export type TaskEdit = typeof TaskEdit.Type;
export const TaskRead = Schema.Struct({
  projectId: ProjectId,
  threadId: Schema.optionalKey(ThreadId),
  key: Schema.optionalKey(key),
  offset: Schema.optionalKey(NonNegativeInt),
});
export const TaskPage = Schema.Struct({
  contributors: Schema.Array(Schema.Struct({ attempt: Schema.Number, threadId: ThreadId })),
  tasks: Schema.Array(
    Schema.Struct({ key, title: short, stage: Schema.String, owner: Schema.String }),
  ),
  brief: Schema.NullOr(TaskBrief),
  events: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      attempt: Schema.Number,
      action: Schema.String,
      actor: Schema.String,
      threadId: Schema.NullOr(ThreadId),
      at: Schema.String,
      detail: Schema.String,
    }),
  ),
  more: Schema.Boolean,
});
export type TaskPage = typeof TaskPage.Type;
export const TaskWrite = Schema.Struct({ projectId: ProjectId, edit: TaskEdit });
export class TaskLedgerError extends Schema.TaggedError<TaskLedgerError>()("TaskLedgerError", {
  detail: Schema.String,
}) {
  override get message() {
    return this.detail;
  }
}
