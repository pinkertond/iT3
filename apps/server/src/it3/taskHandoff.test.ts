// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "@effect/vitest";
import { ProjectId, ThreadId, type TaskEdit } from "@t3tools/contracts";
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
          handleTaskWrite(directory, { projectId, edit }, "operator", threads, {
            getById: () => Effect.succeedSome({}),
          });
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
