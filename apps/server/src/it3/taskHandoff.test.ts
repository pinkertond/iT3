// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "@effect/vitest";
import { CheckpointRef, ProjectId, ThreadId, type TaskEdit } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { handleTaskWrite } from "./taskHandoff.ts";
import { readTask, writeTask } from "./taskLedger.ts";

it.effect(
  "persists a handoff before sending and retries an uncertain delivery with the same native command",
  () =>
    Effect.gen(function* () {
      const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-notice-"));
      try {
        const projectId = ProjectId.make("sandbox"),
          target = ThreadId.make("receiver");
        const base = { key: "T", attempt: 1 as const, generation: 0, revision: 0 };
        yield* writeTask(
          directory,
          projectId,
          {
            ...base,
            requestId: "create",
            change: {
              action: "create",
              title: "T",
              request: "Request",
              reference: "",
              steps: [],
              comparison: false,
            },
          },
          { kind: "operator", id: "test" },
        );
        const edits: TaskEdit = {
          ...base,
          requestId: "handoff",
          change: { action: "handoff", target, next: "Check the file" },
        };
        const sent: string[] = [];
        const threads = {
          getThreadShell: () =>
            Effect.succeed({
              id: target,
              projectId,
              archivedAt: null,
              deletedAt: null,
              worktreePath: null,
            }),
          sendToThread: (input: { commandId: string }) => {
            sent.push(input.commandId);
            return sent.length === 1 ? Effect.fail("lost response" as const) : Effect.succeed({});
          },
        };
        const run = (edit: TaskEdit) =>
          handleTaskWrite(
            directory,
            { projectId, edit },
            "operator",
            threads,
            {
              getById: () => Effect.succeedSome({ workspaceRoot: directory }),
            },
            {
              distinct: () => Effect.succeed(false),
              release: () => Effect.void,
              baseline: () => Effect.die("unused"),
              inspect: () => Effect.die("unused"),
              matches: () => Effect.succeed(false),
              worktrees: () => Effect.succeed([]),
            },
          );
        expect((yield* Effect.flip(run(edits))).detail).toMatch(/saved/);
        const page = yield* readTask(directory, projectId, "T");
        expect(page.brief?.attempts[0]?.delivery).toBe("saved");
        const receipt = yield* run(edits);
        expect(receipt.attempts[0]?.delivery).toBe("queued");
        expect(sent).toHaveLength(2);
        expect(sent[0]).toBe(sent[1]);
        yield* run(edits);
        expect(sent).toHaveLength(2);
      } finally {
        NodeFS.rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.effect(
  "keeps a busy or unobservable worker's claim until a separate verified checkout is selected",
  () =>
    Effect.gen(function* () {
      const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-recovery-"));
      try {
        const projectId = ProjectId.make("fixture");
        const source = ThreadId.make("worker"),
          target = ThreadId.make("successor");
        const base = { key: "recover", attempt: 1 as const, generation: 0, revision: 0 };
        const operator = { kind: "operator" as const, id: "operator" };
        yield* writeTask(
          directory,
          projectId,
          {
            ...base,
            requestId: "create",
            change: {
              action: "create",
              title: "Recover",
              request: "Original",
              reference: "spec.md",
              steps: [],
              comparison: false,
            },
          },
          operator,
        );
        yield* writeTask(
          directory,
          projectId,
          {
            ...base,
            requestId: "claim",
            change: { action: "claim", files: ["first.txt"], next: "Verify" },
          },
          { kind: "worker", id: source, title: "Worker", model: "test", worktree: null },
          { baseline: "before" },
        );
        const edit: TaskEdit = {
          ...base,
          generation: 1,
          revision: 1,
          requestId: "handoff",
          change: { action: "handoff", target, next: "Verify files" },
        };
        let available = true,
          matches = false,
          distinct = false,
          destination: string | null = null;
        let notices = 0;
        const send = () =>
          handleTaskWrite(
            directory,
            { projectId, edit },
            "operator",
            {
              getThreadShell: (id) =>
                Effect.succeed(
                  id === source && !available
                    ? null
                    : {
                        projectId,
                        archivedAt: null,
                        deletedAt: null,
                        worktreePath: id === source ? null : destination,
                        status: "running" as const,
                      },
                ),
              sendToThread: () =>
                Effect.sync(() => {
                  notices++;
                }),
            },
            { getById: () => Effect.succeedSome({ workspaceRoot: directory }) },
            {
              baseline: () => Effect.die("unused"),
              release: () => Effect.void,
              inspect: (_cwd, a, worker, observed) =>
                Effect.succeed({
                  source: worker,
                  sourceWorktree: a.worktree,
                  captured: "now",
                  observed,
                  snapshot: CheckpointRef.make("captured"),
                  compared: true,
                  total: 1,
                  changes: [{ path: "unplanned.ts", declared: false }],
                }),
              matches: () => Effect.succeed(matches),
              distinct: () => Effect.succeed(distinct),
              worktrees: () => Effect.succeed([directory, "/isolated"]),
            },
          );
        expect((yield* Effect.flip(send())).detail).toMatch(/stop/);
        available = false;
        expect((yield* Effect.flip(send())).detail).toMatch(/stop/);
        destination = directory;
        matches = true;
        expect((yield* Effect.flip(send())).detail).toMatch(/worktree/);
        destination = "/isolated";
        distinct = true;
        matches = false;
        expect((yield* Effect.flip(send())).detail).toMatch(/worktree/);
        expect(notices).toBe(0);
        expect((yield* readTask(directory, projectId, base.key)).brief?.attempts[0]?.owner).toBe(
          source,
        );
        matches = true;
        const result = yield* send();
        expect(result.attempts[0]).toMatchObject({
          owner: target,
          worktree: destination,
          baseline: "before",
          delivery: "queued",
          recovery: { observed: "unknown", changes: [{ path: "unplanned.ts", declared: false }] },
        });
        expect(notices).toBe(1);
      } finally {
        NodeFS.rmSync(directory, { recursive: true, force: true });
      }
    }),
);
