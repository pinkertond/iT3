// @effect-diagnostics nodeBuiltinImport:off -- keeps the Git and SQLite artifacts in a disposable test directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as TestClock from "effect/testing/TestClock";
import {
  DEFAULT_SERVER_SETTINGS,
  OrchestrationProjectShell,
  ProjectId,
  ProviderInstanceId,
  ServerProvider,
  TaskLedgerError,
  ThreadId,
  UsageSummary,
  type QueueStep,
  type TaskBrief,
  type TaskEdit,
} from "@t3tools/contracts";
import { handleTaskWrite } from "./taskHandoff.ts";
import { readQueueAttempts, readTask, writeTask } from "./taskLedger.ts";
import { reviewerTick } from "./reviewerDispatch.ts";

const decodeProject = Schema.decodeSync(OrchestrationProjectShell);
const decodeProvider = Schema.decodeSync(ServerProvider);
const decodeUsage = Schema.decodeSync(UsageSummary);

it.effect(
  "routes two alternatives through the Architect seat, resumes an interrupted design, and sends only the winner to Builder",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-architect-"))),
        (path) => Effect.sync(() => NodeFS.rmSync(path, { force: true, recursive: true })),
      );
      const project = ProjectId.make("studio"),
        architecture = "design",
        architectA = ThreadId.make("architect-a"),
        architectB = ThreadId.make("architect-b"),
        replacement = ThreadId.make("replacement");
      const operator = { kind: "operator" as const, id: "operator" };
      const spec = "docs/selection.md",
        winner = "Keep connection details behind the overview",
        rejected = "Display every relationship initially";
      const paths = new Map([
        [architectA, "/fixture/alternative-a"],
        [architectB, "/fixture/alternative-b"],
        [replacement, "/fixture/alternative-a"],
      ]);
      let occupant: ThreadId | null = null,
        busy = false,
        capacity = false,
        serial = 0;
      const sent: ThreadId[] = [];
      const run = (edit: TaskEdit) =>
        handleTaskWrite(
          root,
          { projectId: project, edit },
          operator.id,
          {
            getThreadShell: (id) =>
              Effect.succeed({
                projectId: project,
                archivedAt: null,
                deletedAt: null,
                worktreePath: paths.get(id) ?? null,
                status: id === architectA && busy ? ("running" as const) : ("interrupted" as const),
              }),
            sendToThread: (input) =>
              Effect.sync(() => {
                sent.push(input.threadId);
              }),
          },
          { getById: () => Effect.succeedSome({ workspaceRoot: root }) },
          {
            baseline: () => Effect.die("unexpected baseline"),
            matches: () => Effect.succeed(false),
            distinct: () => Effect.succeed(false),
            worktrees: () => Effect.succeed([]),
            release: () => Effect.void,
            inspect: (_cwd, attempt, source, observed) =>
              Effect.succeed({
                source,
                sourceWorktree: attempt.worktree,
                observed,
                captured: "now",
                snapshot: null,
                compared: true,
                total: 1,
                changes: [{ path: "design.md", declared: true }],
              }),
          },
          (seat) => {
            expect(seat).toBe("architect");
            return Effect.succeed(occupant);
          },
          () =>
            capacity
              ? Effect.void
              : Effect.fail(new TaskLedgerError({ detail: "Allowance reserve" })),
        );
      const create = { key: architecture, revision: 0, generation: 0, attempt: 1 as const };
      let design = yield* run({
        ...create,
        requestId: "create-design",
        change: {
          action: "create",
          title: "Interface options",
          request: "Compare different UI options",
          reference: spec,
          comparison: true,
          steps: [],
          seat: "architect",
        },
      });
      const edit = (task: TaskBrief, number: 1 | 2, change: TaskEdit["change"]): TaskEdit => {
        const attempt = task.attempts.find((a) => a.number === number)!;
        return {
          key: task.key,
          attempt: number,
          revision: attempt.revision,
          generation: attempt.generation,
          requestId: "edit-" + ++serial,
          change,
        };
      };
      const route = (task: TaskBrief, number: 1 | 2) =>
        run(edit(task, number, { action: "routeSeat", next: "Prepare design evidence" }));
      const actor = (id: ThreadId) => ({
        kind: "worker" as const,
        id,
        title: "Architect",
        model: "fixture",
        worktree: paths.get(id)!,
      });
      const claim = { action: "claim" as const, files: ["design.md"], next: "Sketch" };
      const update = (task: TaskBrief, n: 1 | 2, id: ThreadId, change: TaskEdit["change"]) =>
        writeTask(root, project, edit(task, n, change), actor(id));
      expect((yield* route(design, 1).pipe(Effect.result))._tag).toBe("Failure");
      expect(sent).toEqual([]);
      occupant = architectA;
      expect((yield* route(design, 1).pipe(Effect.flip)).detail).toBe("Allowance reserve");
      expect(sent).toEqual([]);
      capacity = true;
      design = yield* route(design, 1);
      expect(design.attempts[0]).toMatchObject({ owner: architectA, delivery: "queued" });
      design = yield* update(design, 1, architectA, claim);
      design = yield* update(design, 1, architectA, {
        action: "checkpoint",
        files: ["design.md"],
        steps: [],
        checkpoint: "Explored three disclosure patterns",
        next: "Choose a detail view",
        verification: "Draft screenshots",
      });
      const late = edit(design, 1, {
        action: "submit",
        checkpoint: "Late obsolete design",
        verification: "Old report",
      });
      const roster = (yield* readTask(root, project, undefined, 0, undefined, {
        seat: "architect",
      })).roster!;
      expect(roster.assignments).toContainEqual(
        expect.objectContaining({
          key: architecture,
          seat: "architect",
          attempt: 1,
          owner: architectA,
          stage: "working",
          next: "Choose a detail view",
        }),
      );
      busy = true;
      occupant = replacement;
      expect((yield* route(design, 1).pipe(Effect.result))._tag).toBe("Failure");
      busy = false;
      design = yield* route(design, 1);
      expect(design.attempts[0]).toMatchObject({
        owner: replacement,
        checkpoint: "Explored three disclosure patterns",
        worktree: paths.get(replacement),
        recovery: { source: architectA, observed: "stopped" },
      });
      expect(
        (yield* writeTask(root, project, late, actor(architectA)).pipe(Effect.result))._tag,
      ).toBe("Failure");
      design = yield* update(design, 1, replacement, claim);
      design = yield* update(design, 1, replacement, {
        action: "submit",
        checkpoint: winner,
        verification: "Approved interaction walkthrough",
      });
      occupant = architectB;
      design = yield* route(design, 2);
      design = yield* update(design, 2, architectB, claim);
      design = yield* update(design, 2, architectB, {
        action: "submit",
        checkpoint: rejected,
        verification: "Discarded prototype",
      });
      design = yield* run(edit(design, 1, { action: "accept" }));
      expect(design.accepted).toBe(1);
      expect(sent).toEqual([architectA, replacement, architectB]);

      const git = (...args: string[]) =>
        NodeChildProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
      git("init", "-q");
      NodeFS.writeFileSync(NodePath.join(root, "overview.ts"), "export const label='Overview';");
      NodeFS.writeFileSync(
        NodePath.join(root, "overview.test.ts"),
        "expect(label).toBe('Overview');",
      );
      git("add", "overview.ts", "overview.test.ts");
      git("-c", "user.name=iT3", "-c", "user.email=fixture@localhost", "commit", "-qm", "fixture");
      const build = yield* run({
        ...create,
        key: "implement",
        requestId: "implement",
        change: {
          action: "create",
          title: "Implement selected concept",
          request: "Apply the selected design",
          reference: "",
          steps: [],
          comparison: false,
          protectedImplementation: true,
          basedOn: design.key,
        },
      });
      expect(build.basedOn).toBe(design.key);
      const step: QueueStep = {
        seat: "reviewer",
        priority: null,
        route: "economy",
        next: "Implement",
        verification: "Check labels",
        dependencies: [],
        windowPercent: 1,
        inputTokens: 10000,
        outputTokens: 150,
        estimatedUsd: 0.02,
        guarded: { source: ["overview.ts"], tests: ["overview.test.ts"], rounds: 1 },
      };
      yield* run(edit(build, 1, { action: "plan", step }));
      type Services = Parameters<typeof reviewerTick>[0];
      const thread = ThreadId.make("review"),
        instanceId = ProviderInstanceId.make("claudeAgent"),
        model = "haiku";
      const prompts: string[] = [];
      const services: Services = {
        path: root,
        threads: {
          getThreadShell: () =>
            Effect.succeed({
              id: thread,
              projectId: project,
              title: "Reviewer",
              interactionMode: "plan",
              runtimeMode: "approval-required",
              modelSelection: { instanceId, model },
            } as NonNullable<Effect.Success<ReturnType<Services["threads"]["getThreadShell"]>>>),
          sendToThread: () => Effect.die("Unexpected interactive run"),
        },
        engine: { getThreadRecords: () => Effect.die("Unexpected native records") },
        commandReceipt: () => Effect.succeedNone,
        usage: {} as Services["usage"],
        guardedTurn: async (prompt) => {
          prompts.push(prompt);
          return {
            session: "builder",
            tokens: 15,
            usd: 0.001,
            answer: {
              decision: "blocked",
              summary: "Operator verification needed",
              path: "",
              edits: [],
            },
          };
        },
        readInputs: () =>
          Effect.gen(function* () {
            const now = DateTime.formatIso(yield* DateTime.now),
              day = now.slice(0, 10);
            const p = decodeProject({
              id: project,
              title: "Studio",
              workspaceRoot: root,
              createdAt: now,
              updatedAt: now,
              scripts: [],
              defaultModelSelection: null,
            });
            const provider = decodeProvider({
              instanceId,
              driver: "claudeAgent",
              enabled: true,
              installed: true,
              version: null,
              status: "ready",
              auth: { status: "authenticated", email: "test@example.test" },
              checkedAt: now,
              models: [{ name: model, slug: model, isCustom: false, capabilities: null }],
              usageLimits: {
                checkedAt: now,
                windows: [{ id: "primary", kind: "session", label: "Session", usedPercent: 0 }],
              },
            });
            const report = decodeUsage({
              it3ProjectId: project,
              contractVersion: 6,
              readAt: now,
              timeZone: "UTC",
              sinceDay: day,
              untilDay: day,
              buckets: [],
              sources: [
                {
                  fingerprint: {
                    provider: "claude",
                    hostId: "mac",
                    resolvedHomePath: "/fixture",
                    volumeId: "v",
                  },
                  status: "ok",
                  scannedFiles: 1,
                  skippedFiles: 0,
                  malformedRecords: 0,
                  distinctSessions: 1,
                  message: null,
                },
              ],
              pricing: { status: "fresh", source: "fixture", fetchedAt: now, knownModels: 1 },
              scanDurationMs: 0,
            });
            return {
              projects: [p],
              providers: [provider],
              settings: {
                ...DEFAULT_SERVER_SETTINGS,
                it3Workspaces: {
                  projects: {
                    [project]: {
                      queuePolicy: {
                        reviewer: thread,
                        priority: "normal" as const,
                        dailyTokens: 100000,
                        dailyUsd: 1,
                        contextTokens: 20000,
                        reservePercent: 0,
                        economy: { instanceId, model },
                        advanced: null,
                      },
                    },
                  },
                },
              },
              reports: new Map([[project, report]]),
              asOf: now,
              offset: 0,
              attempts: yield* readQueueAttempts(root),
            };
          }),
      };
      for (let i = 0; i < 2; i++) {
        yield* TestClock.adjust("1 second");
        yield* reviewerTick(services);
      }
      expect(prompts).toHaveLength(1);
      expect(JSON.parse(prompts[0]!)).toMatchObject({
        role: "builder",
        selectedDesign: {
          task: architecture,
          attempt: 1,
          summary: winner,
          verification: "Approved interaction walkthrough",
          reference: spec,
        },
      });
      expect(prompts[0]).not.toContain(rejected);
      expect(
        (yield* readTask(root, project, build.key)).brief?.attempts[0]?.guarded?.history,
      ).toHaveLength(1);
    }).pipe(Effect.scoped),
);
