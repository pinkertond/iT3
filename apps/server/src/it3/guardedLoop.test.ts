// @effect-diagnostics nodeBuiltinImport:off -- verifies immutable Git candidates and durable task transitions in a disposable repository.
import { expect, it } from "@effect/vitest";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import { type TaskBrief, ThreadId } from "@t3tools/contracts";
import { initialGuard, guardedPrompt, applyGuardedAnswer } from "./guardedTurn.ts";
import { writeGuardedCandidate, readGuardedFiles } from "./guardedCandidate.ts";
import { writeTask } from "./taskLedger.ts";

it("blocks builder test writes and deletions, commits only independent amendments, and bounds retries", () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-guard-test-"));
  const git = (...args: string[]) =>
    NodeChildProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const scope = { source: ["app.ts"], tests: ["acceptance.spec.ts"], rounds: 2 };
  const task = {
    request: "Choose the larger value",
    attempts: [{ steps: [] }],
    queueStep: { guarded: scope },
  } as unknown as TaskBrief;
  const answer = (
    decision: string,
    edits: { path: string; content: string | null }[] = [],
    path = "",
  ) => ({ decision, edits, path, summary: "Compare both orderings" });
  try {
    git("init", "-q");
    NodeFS.writeFileSync(NodePath.join(root, "app.ts"), "export const f=Math.min;");
    NodeFS.writeFileSync(NodePath.join(root, "acceptance.spec.ts"), "expect(f(2,1)).toBe(2)");
    NodeFS.symlinkSync("acceptance.spec.ts", NodePath.join(root, "alias.ts"));
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@localhost",
      "commit",
      "-qm",
      "fixture",
    );
    const base = initialGuard(root),
      check = "1".repeat(64);
    for (const content of [null, ""])
      expect(() =>
        writeGuardedCandidate(
          root,
          base.base,
          scope,
          "builder",
          [{ path: scope.tests[0]!, content }],
          "",
          check,
        ),
      ).toThrow("Protected path");
    for (const path of ["alias.ts", "../app.ts", "acceptance.spec.ts"])
      expect(() => readGuardedFiles(root, base.base, { ...scope, source: [path] })).toThrow();
    const contested = applyGuardedAnswer(
      root,
      task,
      base,
      answer("contest", [], "acceptance.spec.ts"),
      check,
    ).state;
    expect(contested.role).toBe("test-maintainer");
    expect(contested.candidate).toBe(base.base);
    expect(() =>
      applyGuardedAnswer(
        root,
        task,
        base,
        answer("amend", [{ path: scope.tests[0]!, content: null }]),
        check,
      ),
    ).toThrow();
    expect(() =>
      applyGuardedAnswer(
        root,
        task,
        contested,
        answer("amend", [{ path: "app.ts", content: "unrelated" }]),
        check,
      ),
    ).toThrow("Protected path");
    expect(() =>
      applyGuardedAnswer(
        root,
        task,
        base,
        answer("contest", [{ path: scope.tests[0]!, content: "rewrite" }], "acceptance.spec.ts"),
        check,
      ),
    ).toThrow();
    const amended = applyGuardedAnswer(
      root,
      task,
      contested,
      answer("amend", [
        { path: scope.tests[0]!, content: "expect(f(2,1)).toBe(2); expect(f(1,2)).toBe(2);" },
      ]),
      check,
    ).state;
    expect(git("diff", "--name-only", base.base, amended.candidate)).toBe("acceptance.spec.ts");
    const proposed = applyGuardedAnswer(
      root,
      task,
      amended,
      answer("propose", [{ path: "app.ts", content: "export const f=Math.max;" }]),
      "2".repeat(64),
    ).state;
    expect(proposed.role).toBe("reviewer");
    expect(git("diff", "--name-only", amended.candidate, proposed.candidate)).toBe("app.ts");
    expect(guardedPrompt(root, task, proposed)).toContain("Math.max");
    expect(git("status", "--porcelain")).toBe("");
    expect(git("rev-parse", "HEAD")).toBe(base.base);
    expect(
      applyGuardedAnswer(root, task, proposed, answer("changes_requested"), check).state.round,
    ).toBe(2);
    expect(
      applyGuardedAnswer(root, task, { ...proposed, round: 2 }, answer("changes_requested"), check)
        .state.stopped,
    ).toBe(true);
    expect(applyGuardedAnswer(root, task, proposed, answer("pass"), check).approved).toBe(true);
    const removed = applyGuardedAnswer(
      root,
      task,
      contested,
      answer("amend", [{ path: scope.tests[0]!, content: null }]),
      "3".repeat(64),
    ).state;
    expect(JSON.parse(guardedPrompt(root, task, removed)).candidate).not.toHaveProperty(
      "acceptance.spec.ts",
    );
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

it.effect("keeps protected implementation tasks out of ordinary worker chats", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-protected-task-"))),
      (dir) => Effect.sync(() => NodeFS.rmSync(dir, { recursive: true, force: true })),
    );
    const edit = { key: "fix", generation: 0, revision: 0, attempt: 1 as const };
    const operator = { kind: "operator" as const, id: "ops" };
    yield* writeTask(
      root,
      "p",
      {
        ...edit,
        requestId: "create",
        change: {
          action: "create",
          protectedImplementation: true,
          title: "Fix",
          request: "repair",
          reference: "",
          steps: [],
          comparison: false,
        },
      },
      operator,
    );
    const id = ThreadId.make("build");
    const claim = yield* writeTask(
      root,
      "p",
      {
        ...edit,
        requestId: "claim",
        change: { action: "claim", files: ["app.ts"], next: "write" },
      },
      { kind: "worker", id, title: "Builder", model: "fixture", worktree: null },
    ).pipe(Effect.result);
    expect(claim._tag).toBe("Failure");
    if (claim._tag === "Failure") expect(claim.failure.detail).toContain("protected");
    const assign = yield* writeTask(
      root,
      "p",
      {
        ...edit,
        requestId: "assign",
        change: { action: "handoff", target: id, next: "write" },
      },
      operator,
    ).pipe(Effect.result);
    expect(assign._tag).toBe("Failure");
    if (assign._tag === "Failure") expect(assign.failure.detail).toContain("protected");
  }).pipe(Effect.scoped),
);
