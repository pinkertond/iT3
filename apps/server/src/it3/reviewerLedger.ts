// @effect-diagnostics nodeBuiltinImport:off -- shares the task ledger's synchronous SQLite transaction.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { ProjectId, TaskBrief, type ReviewReceipt, type TaskAttempt } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { openTaskLedger, taskLedgerOperation } from "./taskLedger.ts";

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(TaskBrief));
export interface ReviewJob {
  project: ProjectId;
  task: TaskBrief;
  attempt: TaskAttempt;
}
export const reviewJobs = (dir: string, now: string) =>
  taskLedgerOperation(() => {
    if (!NodeFS.existsSync(NodePath.join(dir, "it3-tasks.sqlite")))
      return { jobs: [] as ReviewJob[], watermark: 0 };
    const db = openTaskLedger(dir, true);
    try {
      db.exec("BEGIN");
      const watermark = Number(db.prepare("SELECT IFNULL(MAX(id),0) id FROM events").get()?.id);
      const rows = db
        .prepare(`SELECT project,body FROM tasks WHERE (json_extract(body,'$.attempts[0].review.nextAccounting')<=?) OR json_extract(body,'$.queueStep.seat')='reviewer'
      AND (json_extract(body,'$.attempts[0].review.phase') IN ('reserved','running') OR
        (json_extract(body,'$.accepted') IS NULL AND json_extract(body,'$.attempts[0].stage')='ready'
        AND COALESCE(json_extract(body,'$.attempts[0].guarded.stopped'),0)=0 AND json_extract(body,'$.attempts[0].review') IS NULL))`)
        .all(now);
      return {
        watermark,
        jobs: rows.map((row) => {
          const task = decode(String(row.body));
          return { project: ProjectId.make(String(row.project)), task, attempt: task.attempts[0]! };
        }),
      };
    } finally {
      db.close();
    }
  });
type ReservationCheck = {
  observedGuarded?: { tokens: number; usd: number } | undefined;
  watermark: number;
  checkedAt: string;
  usageAt: string;
  tokenLimit: number;
  costLimit: number | null;
};
export function updateReview(
  dir: string,
  job: ReviewJob,
  patch: Partial<TaskAttempt>,
  detail: string,
  at: string,
  admission?: ReservationCheck,
  releaseUnsent = false,
) {
  return taskLedgerOperation(() => {
    const db = openTaskLedger(dir);
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db
        .prepare("SELECT body FROM tasks WHERE project=? AND key=?")
        .get(job.project, job.task.key);
      if (!row) return false;
      const task = decode(String(row.body)),
        old = task.attempts[0]!;
      if (
        old.revision !== job.attempt.revision ||
        old.generation !== job.attempt.generation ||
        task.accepted !== null
      )
        return false;
      if (admission) {
        if (
          !patch.review ||
          old.stage !== "ready" ||
          old.review ||
          task.queueStep?.seat !== "reviewer"
        )
          return false;
        if (
          Number(db.prepare("SELECT IFNULL(MAX(id),0) id FROM events").get()?.id) !==
          admission.watermark
        )
          return false;
        const busy = db
          .prepare(`SELECT 1 FROM (SELECT t.project, a.value FROM tasks t, json_each(t.body,'$.attempts') a
          UNION ALL SELECT t.project, json_object('review', json(h.value)) FROM tasks t, json_each(t.body,'$.attempts[0].guarded.history') h) a WHERE a.value ->> '$.review' IS NOT NULL AND
          ((a.project=? AND (a.value ->> '$.review.finished' IS NULL OR a.value ->> '$.review.finished'>=?))
          OR ((a.value ->> '$.review.pool'=? OR (a.value ->> '$.review.driver'=? AND (a.value ->> '$.review.identified'=0 OR ?=0))) AND (a.value ->> '$.review.finished' IS NULL OR a.value ->> '$.review.finished'>=?))) LIMIT 1`)
          .get(
            job.project,
            admission.usageAt,
            patch.review.pool,
            patch.review.driver,
            Number(patch.review.identified),
            admission.checkedAt,
          );
        if (busy)
          return "Waiting for shared capacity and post-run usage and allowance observations.";
        // A newly scanned project total can still lag a finished turn. Carry our own settled
        // debits forward until that total catches up, without charging the same work twice.
        const r = patch.review;
        const charged = db
          .prepare(`SELECT MAX((a.value ->> '$.review.spentBeforeTokens')+
           COALESCE(a.value ->> '$.review.tokens',a.value ->> '$.review.reservedTokens')) tokens,
           MAX(COALESCE(a.value ->> '$.review.spentBeforeUsd',0)+COALESCE(a.value ->> '$.review.pricedUsd',a.value ->> '$.review.reservedUsd',0)) usd
           FROM (SELECT t.project, a.value FROM tasks t, json_each(t.body,'$.attempts') a
           UNION ALL SELECT t.project, json_object('review', json(h.value)) FROM tasks t, json_each(t.body,'$.attempts[0].guarded.history') h) a
           WHERE a.project=? AND a.value ->> '$.review.day'=? AND a.value ->> '$.review.finished' IS NOT NULL`)
          .get(job.project, r.day);
        // Tool-free turns have no native session log. Count them in addition to freshly
        // scanned ordinary-chat usage. The SQL reservation also protects older readers.
        const guard = db
          .prepare(`SELECT SUM(COALESCE(h.value->>'$.tokens',h.value->>'$.reservedTokens')) tokens,
          SUM(COALESCE(h.value->>'$.pricedUsd',h.value->>'$.reservedUsd')) usd
          FROM tasks,json_each(body,'$.attempts[0].guarded.history') h WHERE project=? AND h.value->>'$.day'=?`)
          .get(job.project, r.day);
        const tokens = Math.max(
          r.spentBeforeTokens +
            Number(guard?.tokens ?? 0) -
            (admission.observedGuarded?.tokens ?? 0),
          Number(charged?.tokens ?? 0),
        );
        const usd = Math.max(
          (r.spentBeforeUsd ?? 0) + Number(guard?.usd ?? 0) - (admission.observedGuarded?.usd ?? 0),
          Number(charged?.usd ?? 0),
        );
        if (tokens + r.reservedTokens > admission.tokenLimit)
          return "Settled reviewer usage leaves insufficient daily tokens.";
        if (admission.costLimit !== null && usd + (r.reservedUsd ?? 0) > admission.costLimit)
          return "Settled reviewer costs leave insufficient daily USD.";
        patch = { ...patch, review: { ...r, spentBeforeTokens: tokens, spentBeforeUsd: usd } };
      }
      const attempt = { ...old, ...patch, revision: old.revision + 1, updated: at };
      if (patch.guarded && patch.guarded.history.length > (old.guarded?.history.length ?? 0))
        delete attempt.review;
      if (releaseUnsent) {
        if (old.review?.phase !== "reserved" || old.review.run) return false;
        delete attempt.review;
      }
      const next = {
        ...task,
        accepted:
          attempt.stage === "submitted" && !task.comparison ? attempt.number : task.accepted,
        attempts: [attempt, ...task.attempts.slice(1)],
      };
      db.prepare("UPDATE tasks SET body=? WHERE project=? AND key=?").run(
        JSON.stringify(next),
        job.project,
        task.key,
      );
      db.prepare(`INSERT INTO events(project,key,attempt,actor,identity,request_id,input,action,at,detail)
       VALUES(?,?,1,'Reviewer dispatcher','system/reviewer',?,'{}','review',?,?)`).run(
        job.project,
        task.key,
        "r" + attempt.revision,
        at,
        detail,
      );
      db.exec("COMMIT");
      return true;
    } finally {
      db.close();
    }
  });
}
export function reviewResult(
  job: ReviewJob,
  receipt: ReviewReceipt,
  result: {
    verdict: "pass" | "changes_requested" | "blocked";
    summary: string;
    verification: string;
    completed: readonly string[];
  } | null,
): Partial<TaskAttempt> {
  const a = job.attempt;
  if (!result)
    return { review: receipt, stage: "ready", owner: null, delivery: "none", next: receipt.detail };
  const steps = a.steps.map((s) => ({ ...s, done: s.done || result.completed.includes(s.title) }));
  const done = result.verdict === "pass" && steps.every((s) => s.done);
  return {
    review: receipt,
    steps,
    stage: done ? "submitted" : "ready",
    ...(done ? {} : { owner: null, delivery: "none" as const }),
    checkpoint: result.summary,
    verification: result.verification,
    next: done ? "Review completed" : "Inspect review findings before assigning follow-up.",
  };
}

// Late telemetry may arrive after acceptance or a manual handoff. Update only the
// matching receipt's accounting fields, preserving every intervening operator edit.
export function refreshReviewCost(
  dir: string,
  job: ReviewJob,
  tokens: number | null,
  usd: number | null,
  next: string | null,
  at: string,
) {
  return taskLedgerOperation(() => {
    const db = openTaskLedger(dir);
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db
        .prepare("SELECT body FROM tasks WHERE project=? AND key=?")
        .get(job.project, job.task.key);
      if (!row) return;
      const task = decode(String(row.body)),
        attempt = task.attempts[0]!,
        r = attempt.review;
      if (
        !r?.finished ||
        r.id !== job.attempt.review?.id ||
        !r.nextAccounting ||
        r.nextAccounting > at
      )
        return;
      // A later incomplete sample cannot erase observed usage.
      const receipt = {
        ...r,
        tokens: tokens ?? r.tokens,
        pricedUsd: usd ?? r.pricedUsd,
        nextAccounting: next,
      };
      db.prepare("UPDATE tasks SET body=? WHERE project=? AND key=?").run(
        JSON.stringify({
          ...task,
          attempts: [{ ...attempt, review: receipt }, ...task.attempts.slice(1)],
        }),
        job.project,
        task.key,
      );
      db.exec("COMMIT");
    } finally {
      db.close();
    }
  });
}
