// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off -- SQLite commits record a wall-clock timestamp.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import {
  QueueStep,
  ProjectId,
  TaskBrief,
  TaskLedgerError,
  type TaskAttempt,
  type TaskEdit,
  type TaskPage,
  type TaskRecovery,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

export type TaskActor =
  | { kind: "operator"; id: string }
  | { kind: "worker"; id: ThreadId; title: string; model: string; worktree: string | null };
function refuse(detail: string): never {
  throw new TaskLedgerError({ detail });
}
const parse = Schema.decodeUnknownSync(Schema.fromJsonString(TaskBrief));
function connect(directory: string, readOnly = false) {
  const path = NodePath.join(directory, "it3-tasks.sqlite");
  if (!readOnly) NodeFS.closeSync(NodeFS.openSync(path, "a", 0o600));
  const db = new NodeSqlite.DatabaseSync(path, { readOnly });
  try {
    db.exec("PRAGMA busy_timeout=2500");
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (version === 1 || (version === 0 && readOnly)) return db;
    if (version !== 0) refuse("This task ledger needs a newer host.");
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS tasks(project TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL, PRIMARY KEY(project,key));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,project TEXT NOT NULL,key TEXT NOT NULL,attempt INTEGER NOT NULL,actor TEXT NOT NULL,identity TEXT NOT NULL,
        request_id TEXT NOT NULL,input TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL,
        UNIQUE(project,key,identity,request_id));
      CREATE INDEX IF NOT EXISTS task_history ON events(project,key,id); PRAGMA user_version=1;COMMIT;`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
const isLedgerError = Schema.is(TaskLedgerError);
function guard<A>(fn: () => A) {
  return Effect.try({
    try: fn,
    catch: (e) =>
      isLedgerError(e) ? e : new TaskLedgerError({ detail: "Could not access the task ledger." }),
  });
}
function lookup(db: NodeSqlite.DatabaseSync, project: string, key: string) {
  const row = db.prepare("SELECT body FROM tasks WHERE project=? AND key=?").get(project, key);
  return row ? parse(String(row.body)) : null;
}
export function readTaskBrief(
  directory: string,
  project: string,
  key: string,
  worker: ThreadId,
  number?: 1 | 2,
) {
  return guard(() => {
    if (!NodeFS.existsSync(NodePath.join(directory, "it3-tasks.sqlite")))
      return refuse("Task does not exist in this project.");
    const db = connect(directory, true);
    try {
      const task = lookup(db, project, key) ?? refuse("Task does not exist in this project.");
      const assignedToThisChat = task.attempts
        .filter((a) => a.owner === worker && a.stage === "assigned")
        .map((a) => a.number);
      if (!task.comparison) return { ...task, assignedToThisChat };
      const n = number ?? task.attempts.find((a) => a.owner === worker)?.number;
      const own = task.attempts.find((a) => a.number === n);
      if (!own || (own.owner && own.owner !== worker))
        return refuse("Read your assigned comparison attempt.");
      return { ...task, attempts: [own], assignedToThisChat };
    } finally {
      db.close();
    }
  });
}
export function readTask(
  directory: string,
  project: string,
  key?: string,
  offset = 0,
  thread?: ThreadId,
) {
  return guard((): TaskPage => {
    const empty = { contributors: [], tasks: [], events: [], brief: null, more: false };
    if (!NodeFS.existsSync(NodePath.join(directory, "it3-tasks.sqlite"))) return empty;
    const db = connect(directory, true);
    try {
      db.exec("BEGIN");
      if (db.prepare("PRAGMA user_version").get()?.user_version === 0) return empty;
      if (!key) {
        const rows = db
          .prepare(`SELECT key,json_extract(body,'$.title') title,
          CASE WHEN json_extract(body,'$.accepted') IS NOT NULL THEN 'accepted' WHEN json_extract(body,'$.comparison') THEN 'comparison' ELSE json_extract(body,'$.attempts[0].stage') END stage,
          json_extract(body,'$.attempts[0].ownerTitle') owner FROM tasks t WHERE project=? AND (? IS NULL OR EXISTS(SELECT 1 FROM events e WHERE e.project=t.project AND e.key=t.key AND e.identity=? AND e.action='claim') OR EXISTS(SELECT 1 FROM json_each(t.body,'$.attempts') a WHERE json_extract(a.value,'$.owner')=?)) ORDER BY key LIMIT 13 OFFSET ?`)
          .all(project, thread ?? null, thread ? "worker/" + thread : null, thread ?? null, offset);
        return {
          contributors: [],
          tasks: rows.slice(0, 12).map((r) => ({
            key: String(r.key),
            title: String(r.title),
            stage: String(r.stage),
            owner: String(r.owner),
          })),
          events: [],
          brief: null,
          more: rows.length > 12,
        };
      }
      const brief = lookup(db, project, key);
      if (!brief) return empty;
      const events = db
        .prepare(
          "SELECT id,attempt,action,actor,identity,at,detail FROM events WHERE project=? AND key=? ORDER BY id DESC LIMIT 13 OFFSET ?",
        )
        .all(project, key, offset);
      const contributors = db
        .prepare(
          "SELECT DISTINCT attempt,substr(identity,8) thread FROM events WHERE project=? AND key=? AND action='claim'",
        )
        .all(project, key)
        .map((r) => ({ attempt: Number(r.attempt), threadId: ThreadId.make(String(r.thread)) }));
      return {
        contributors,
        tasks: [],
        brief,
        events: events.slice(0, 12).map((r) => ({
          id: Number(r.id),
          attempt: Number(r.attempt),
          action: String(r.action),
          actor: String(r.actor),
          threadId: String(r.identity).startsWith("worker/")
            ? ThreadId.make(String(r.identity).slice(7))
            : null,
          at: String(r.at),
          detail: String(r.detail),
        })),
        more: events.length > 12,
      };
    } finally {
      db.close();
    }
  });
}
function initial(number: 1 | 2, steps: TaskAttempt["steps"], updated: string): TaskAttempt {
  return {
    number,
    generation: 0,
    revision: 0,
    hasClaimed: false,
    stage: "ready",
    delivery: "none",
    owner: null,
    ownerTitle: "",
    model: "",
    worktree: null,
    files: [],
    steps,
    checkpoint: "",
    next: "",
    verification: "",
    updated,
  };
}
function validateFiles(files: readonly string[]) {
  if (
    new Set(files).size !== files.length ||
    files.some(
      (file) =>
        /[\\:\x00-\x1f]/.test(file) ||
        file.split("/").some((part) => !part || part === "." || part === ".."),
    )
  )
    refuse("Use unique repository-relative file paths.");
}
export interface RecoveryEvidence {
  baseline?: string | undefined;
  recovery?: TaskRecovery | undefined;
  destination?: string | null | undefined;
}
function reduce(
  current: TaskBrief | null,
  edit: TaskEdit,
  actor: TaskActor,
  at: string,
  evidence: RecoveryEvidence,
): TaskBrief {
  const c = edit.change;
  if (c.action === "claim" || c.action === "checkpoint") validateFiles(c.files);
  if (c.action === "create" || c.action === "checkpoint") {
    if (new Set(c.steps.map((s) => s.title)).size !== c.steps.length)
      refuse("Subtask titles must be unique within an attempt.");
  }
  if (c.action === "create") {
    if (
      actor.kind !== "operator" ||
      current ||
      edit.attempt !== 1 ||
      edit.generation ||
      edit.revision
    )
      refuse("Task already exists or this creation is invalid.");
    return {
      key: edit.key,
      title: c.title,
      request: c.request,
      reference: c.reference,
      comparison: c.comparison,
      accepted: null,
      attempts: c.comparison
        ? [initial(1, c.steps, at), initial(2, c.steps, at)]
        : [initial(1, c.steps, at)],
    };
  }
  const task = current ?? refuse("Task does not exist.");
  const old =
    task.attempts.find((a) => a.number === edit.attempt) ?? refuse("Attempt does not exist.");
  if (
    task.accepted !== null ||
    old.revision !== edit.revision ||
    old.generation !== edit.generation
  )
    refuse("Claim or revision is stale. Read the current brief.");
  let a = { ...old, revision: old.revision + 1, updated: at };
  let accepted: number | null = null;
  switch (c.action) {
    case "plan": {
      if (
        actor.kind !== "operator" ||
        edit.attempt !== 1 ||
        !task.attempts.every((x) => x.stage === "ready")
      )
        refuse("Edit the queue step before any attempt is assigned.");
      if (c.step?.dependencies.includes(edit.key)) refuse("A step cannot depend on its own task.");
      const result = {
        ...task,
        attempts: task.attempts.map((other) => (other.number === 1 ? a : other)),
      };
      if (c.step) result.queueStep = c.step;
      else delete result.queueStep;
      return result;
    }
    case "inspect":
      if (actor.kind !== "operator" || old.stage !== "working" || !evidence.recovery)
        refuse("Only a working attempt can be inspected.");
      a.recovery = evidence.recovery;
      break;
    case "handoff":
      if (actor.kind !== "operator" || old.stage === "submitted")
        refuse("This attempt cannot be reassigned.");
      if (
        task.comparison &&
        task.attempts.some((other) => other.number !== a.number && other.owner === c.target)
      )
        refuse("Choose a separate receiving conversation for each attempt.");
      a = {
        ...a,
        ...(evidence.recovery ? { recovery: evidence.recovery } : {}),
        ...(evidence.destination !== undefined ? { worktree: evidence.destination } : {}),
        owner: c.target,
        ownerTitle: c.target,
        model: "",
        generation: old.generation + 1,
        stage: "assigned",
        delivery: "saved",
        next: c.next,
      };
      break;
    case "claim": {
      if (
        actor.kind !== "worker" ||
        !(old.stage === "ready" || (old.stage === "assigned" && old.owner === actor.id))
      )
        refuse("This attempt is taken or assigned to another conversation.");
      if (
        task.comparison &&
        (!actor.worktree ||
          task.attempts.some(
            (other) =>
              other.number !== a.number &&
              (other.worktree === actor.worktree || other.owner === actor.id),
          ))
      )
        refuse("Comparison attempts require distinct conversations and worktrees.");
      if (old.hasClaimed && old.worktree !== actor.worktree)
        refuse("Resume this attempt in its original worktree.");
      a = {
        ...a,
        owner: actor.id,
        ownerTitle: actor.title,
        model: actor.model,
        hasClaimed: true,
        worktree: actor.worktree,
        generation: old.generation + 1,
        stage: "working",
        delivery: "acknowledged",
        files: c.files,
        next: c.next,
      };
      break;
    }
    case "checkpoint":
    case "submit":
      if (actor.kind !== "worker" || old.owner !== actor.id || old.stage !== "working")
        refuse("Only the current worker can update this attempt.");
      if (
        c.action === "checkpoint" &&
        old.steps.some((s) => !c.steps.some((update) => update.title === s.title))
      )
        refuse(
          "Keep previous subtasks in the checkpoint. Add or check off entries as work progresses.",
        );
      if (c.action === "checkpoint")
        a = {
          ...a,
          files: c.files,
          steps: c.steps,
          checkpoint: c.checkpoint,
          next: c.next,
          verification: c.verification,
        };
      else {
        if (old.steps.some((step) => !step.done)) refuse("Finish the remaining subtasks first.");
        a = {
          ...a,
          stage: "submitted",
          checkpoint: c.checkpoint,
          next: "",
          verification: c.verification,
        };
        if (!task.comparison) accepted = a.number;
      }
      break;
    case "notify":
      if (actor.kind !== "operator" || old.stage !== "assigned")
        refuse("This attempt is no longer awaiting a worker.");
      a.delivery = "queued";
      break;
    case "accept":
      if (
        actor.kind !== "operator" ||
        !task.comparison ||
        !task.attempts.every((x) => x.stage === "submitted")
      )
        refuse("Both results must be submitted before comparison.");
      accepted = a.number;
      break;
  }
  if ((c.action === "claim" && !old.hasClaimed) || c.action === "checkpoint") {
    delete a.baseline;
    if (evidence.baseline) a.baseline = evidence.baseline;
  }
  return {
    ...task,
    accepted,
    attempts: task.attempts.map((other) => (other.number === a.number ? a : other)),
  };
}
export function writeTask(
  directory: string,
  project: string,
  edit: TaskEdit,
  actor: TaskActor,
  evidence: RecoveryEvidence = {},
) {
  return guard(() => {
    const db = connect(directory);
    try {
      db.exec("BEGIN IMMEDIATE");
      const current = lookup(db, project, edit.key);
      const identity = actor.kind + "/" + actor.id,
        input = JSON.stringify(edit);
      const seen = db
        .prepare(
          "SELECT input FROM events WHERE project=? AND key=? AND identity=? AND request_id=?",
        )
        .get(project, edit.key, identity, edit.requestId);
      if (seen) {
        if (seen.input !== input || !current) refuse("Request ID already used for another change.");
        return current;
      }
      const at = new Date().toISOString(),
        result = reduce(current, edit, actor, at, evidence);
      const c = edit.change;
      const summary =
        c.action === "plan"
          ? (c.step?.next ?? "Removed queue step")
          : c.action === "create"
            ? c.title
            : c.action === "handoff"
              ? c.target + " · " + c.next
              : c.action === "claim"
                ? c.next
                : c.action === "inspect"
                  ? "Inspected working files and previous turn"
                  : c.action === "accept"
                    ? "Accepted result"
                    : c.action === "notify"
                      ? "Queued in the receiving chat"
                      : c.checkpoint;
      const detail =
        c.action === "checkpoint"
          ? [
              summary,
              ...c.steps
                .filter(
                  (step) =>
                    step.done &&
                    !current?.attempts[edit.attempt - 1]?.steps.some(
                      (old) => old.done && old.title === step.title,
                    ),
                )
                .map((step) => "Completed · " + step.title),
              c.verification,
            ]
              .filter(Boolean)
              .join("\n")
          : summary;
      db.prepare(
        "INSERT INTO tasks(project,key,body) VALUES(?,?,?) ON CONFLICT(project,key) DO UPDATE SET body=excluded.body",
      ).run(project, edit.key, JSON.stringify(result));
      db.prepare(
        "INSERT INTO events(project,key,attempt,actor,identity,request_id,input,action,at,detail) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
        project,
        edit.key,
        edit.attempt,
        actor.kind === "worker" ? actor.title + " · " + actor.model : "Project operator",
        identity,
        edit.requestId,
        input,
        c.action,
        at,
        detail,
      );
      db.exec("COMMIT");
      return result;
    } finally {
      db.close();
    }
  });
}

export interface QueueAttempt {
  projectId: ProjectId;
  key: string;
  title: string;
  attempt: number;
  readySince: string;
  stage: string;
  step: QueueStep | null;
  blockedBy: string | null;
}
const decodeQueueStep = Schema.decodeUnknownSync(Schema.fromJsonString(QueueStep));
export function readQueueAttempts(directory: string) {
  return guard((): QueueAttempt[] => {
    if (!NodeFS.existsSync(NodePath.join(directory, "it3-tasks.sqlite"))) return [];
    const db = connect(directory, true);
    try {
      if (db.prepare("PRAGMA user_version").get()?.user_version === 0) return [];
      const rows = db
        .prepare(`SELECT t.project,t.key,json_extract(t.body,'$.title') title,
        json_extract(t.body,'$.queueStep') step,a.value ->> '$.number' attempt,a.value ->> '$.stage' stage,
        MAX(e.at, COALESCE((SELECT MAX(plan.at) FROM events plan WHERE plan.project=t.project AND plan.key=t.key AND plan.action='plan'),e.at),
          COALESCE((SELECT MAX(done.at) FROM json_each(t.body,'$.queueStep.dependencies') d
            JOIN events done ON done.project=t.project AND done.key=d.value AND done.action='accept'),e.at)) ready_since,
        (SELECT d.value FROM json_each(t.body,'$.queueStep.dependencies') d
          LEFT JOIN tasks parent ON parent.project=t.project AND parent.key=d.value
          WHERE json_extract(parent.body,'$.accepted') IS NULL LIMIT 1) blocked
        FROM tasks t JOIN events e ON e.project=t.project AND e.key=t.key AND e.action='create'
        JOIN json_each(t.body,'$.attempts') a
        WHERE json_extract(t.body,'$.accepted') IS NULL AND a.value ->> '$.stage' != 'submitted'`)
        .all();
      return rows.map((r) => ({
        projectId: ProjectId.make(String(r.project)),
        key: String(r.key),
        title: String(r.title),
        attempt: Number(r.attempt),
        readySince: String(r.ready_since),
        stage: String(r.stage),
        step: r.step ? decodeQueueStep(String(r.step)) : null,
        blockedBy: r.blocked === null ? null : String(r.blocked),
      }));
    } finally {
      db.close();
    }
  });
}
