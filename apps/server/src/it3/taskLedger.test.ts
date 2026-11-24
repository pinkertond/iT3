// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { ThreadId, type TaskBrief, type TaskEdit } from "@t3tools/contracts";
import { readTask, writeTask, type TaskActor } from "./taskLedger.ts";

function fixture() {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-task-"));
  const operator: TaskActor = { kind: "operator", id: "operator" };
  const worker = (id: string, worktree: string | null): TaskActor => ({
    kind: "worker",
    id: ThreadId.make(id),
    title: id,
    model: id,
    worktree,
  });
  const a = worker("a", "/a"),
    b = worker("b", "/b");
  let seq = 0;
  const send = (
    change: TaskEdit["change"],
    actor: TaskActor,
    task?: TaskBrief,
    n: 1 | 2 = 1,
    requestId = String(++seq),
  ) => {
    const slot = task?.attempts[n - 1];
    return writeTask(
      dir,
      "project",
      {
        key: "T",
        attempt: n,
        generation: slot?.generation ?? 0,
        revision: slot?.revision ?? 0,
        requestId,
        change,
      },
      actor,
    );
  };
  const read = () => readTask(dir, "project", "T");
  const create = (comparison = false) =>
    send(
      {
        action: "create",
        request: "User request",
        title: "Task",
        reference: "spec.md",
        comparison,
        steps: [{ title: "One", done: false }],
      },
      operator,
    );
  const claim = { action: "claim", files: ["src/app.ts"], next: "Do one" } as const;
  const check = {
    action: "checkpoint",
    files: ["src/app.ts"],
    steps: [{ title: "One", done: true }],
    next: "Review",
    checkpoint: "One is done",
    verification: "Checked file",
  } as const;
  const submit = { action: "submit", checkpoint: "Finished", verification: "Test passed" } as const;
  return {
    dir,
    operator,
    worker,
    a,
    b,
    send,
    read,
    create,
    claim,
    check,
    submit,
    [Symbol.dispose]: () => NodeFS.rmSync(dir, { recursive: true, force: true }),
  };
}
it.effect(
  "fences former workers, preserves verified steps and replays identical requests once",
  () =>
    Effect.gen(function* () {
      using f = fixture();
      const fresh = yield* f.create();
      const claimed = yield* f.send(f.claim, f.a, fresh);
      expect((yield* Effect.flip(f.send(f.claim, f.b, fresh))).detail).toMatch(/stale/);
      expect((yield* Effect.flip(f.send(f.submit, f.a, claimed))).detail).toMatch(/remaining/);
      const checked = yield* f.send(f.check, f.a, claimed, 1, "same");
      yield* f.send(f.check, f.a, claimed, 1, "same");
      expect(
        (yield* Effect.flip(f.send({ ...f.check, next: "different" }, f.a, claimed, 1, "same")))
          .detail,
      ).toMatch(/already used/);
      const assigned = yield* f.send(
        { action: "handoff", target: ThreadId.make("b"), next: "Verify" },
        f.operator,
        checked,
      );
      expect((yield* Effect.flip(f.send(f.check, f.a, checked))).detail).toMatch(/stale/);
      expect((yield* Effect.flip(f.send(f.check, f.a, assigned))).detail).toMatch(/current worker/);
      expect((yield* Effect.flip(f.send(f.claim, f.b, assigned))).detail).toMatch(/worktree/);
      const successor = f.worker("b", "/a");
      const resumed = yield* f.send(f.claim, successor, assigned);
      expect(resumed.attempts[0]?.steps).toEqual(f.check.steps);
      expect(resumed.attempts[0]?.delivery).toBe("acknowledged");
      expect((yield* f.send(f.submit, successor, resumed)).accepted).toBe(1);
      expect((yield* f.read()).events.map((e) => e.action)).toEqual([
        "submit",
        "claim",
        "handoff",
        "checkpoint",
        "claim",
        "create",
      ]);
      expect((yield* readTask(f.dir, "elsewhere", "T")).brief).toBeNull();
    }),
);
it.effect("keeps parallel attempts isolated and records the operator's single winner", () =>
  Effect.gen(function* () {
    using f = fixture();
    let task = yield* f.create(true);
    task = yield* f.send(f.claim, f.a, task);
    expect((yield* Effect.flip(f.send(f.claim, f.worker("b", "/a"), task, 2))).detail).toMatch(
      /distinct/,
    );
    task = yield* f.send(f.claim, f.b, task, 2);
    expect((yield* Effect.flip(f.send({ action: "accept" }, f.operator, task))).detail).toMatch(
      /Both/,
    );
    task = yield* f.send(f.check, f.a, task);
    task = yield* f.send(f.submit, f.a, task);
    task = yield* f.send(f.check, f.b, task, 2);
    task = yield* f.send(f.submit, f.b, task, 2);
    expect((yield* Effect.flip(f.send({ action: "accept" }, f.a, task))).detail).toMatch(/./);
    expect((yield* f.send({ action: "accept" }, f.operator, task, 2)).accepted).toBe(2);
    expect((yield* Effect.flip(f.send({ action: "accept" }, f.operator, task))).detail).toMatch(
      /stale/,
    );
  }),
);
