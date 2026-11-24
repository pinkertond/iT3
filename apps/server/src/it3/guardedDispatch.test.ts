// @effect-diagnostics nodeBuiltinImport:off -- disposable Git repository and SQLite ledger.
import { expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as TestClock from "effect/testing/TestClock";
import * as Schema from "effect/Schema";
import {
  DEFAULT_SERVER_SETTINGS,
  OrchestrationProjectShell,
  ProjectId,
  ProviderInstanceId,
  ServerProvider,
  ThreadId,
  UsageSummary,
  type QueueStep,
} from "@t3tools/contracts";
import { reviewerTick } from "./reviewerDispatch.ts";
import { readTask, writeTask, readQueueAttempts } from "./taskLedger.ts";

const decodeProject = Schema.decodeSync(OrchestrationProjectShell);
const decodeProvider = Schema.decodeSync(ServerProvider);
const decodeUsage = Schema.decodeSync(UsageSummary);

it.effect(
  "drives a protected candidate through a budget hold, independent review, retry, and operator verification",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-dispatch-"))),
        (d) => Effect.sync(() => NodeFS.rmSync(d, { recursive: true, force: true })),
      );
      const git = (...args: string[]) =>
        NodeChildProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
      git("init", "-q");
      NodeFS.writeFileSync(NodePath.join(root, "main.ts"), "export const f=Math.min;");
      NodeFS.writeFileSync(NodePath.join(root, "requirement.spec.ts"), "expect(f(1,2)).toBe(2)");
      git("add", ".");
      git("-c", "user.name=iT3", "-c", "user.email=t@localhost", "commit", "-qm", "base");
      const project = ProjectId.make("p"),
        thread = ThreadId.make("review"),
        instanceId = ProviderInstanceId.make("claudeAgent"),
        model = "haiku";
      const edit = { key: "max", revision: 0, generation: 0, attempt: 1 as const },
        operator = { kind: "operator" as const, id: "operator" };
      const step: QueueStep = {
        seat: "reviewer",
        priority: null,
        route: "economy",
        next: "Implement maximum",
        verification: "Both orders",
        dependencies: [],
        windowPercent: 1,
        inputTokens: 8000,
        outputTokens: 200,
        estimatedUsd: 0.04,
        guarded: { source: ["main.ts"], tests: ["requirement.spec.ts"], rounds: 2 },
      };
      const implementation = {
        ...edit,
        requestId: "create",
        change: {
          action: "create" as const,
          protectedImplementation: true as const,
          basedOn: "concepts",
          title: "maximum",
          request: "return the larger",
          steps: [],
          reference: "",
          comparison: false,
        },
      };
      const conceptEdit = { ...edit, key: "concepts" };
      let concepts = yield* writeTask(
        root,
        project,
        {
          ...conceptEdit,
          requestId: "create",
          change: {
            action: "create",
            title: "Two concepts",
            request: "Compare alternatives",
            steps: [],
            reference: "docs/concepts.md",
            comparison: true,
          },
        },
        operator,
      );
      for (const attempt of [1, 2] as const) {
        const worker = {
          kind: "worker" as const,
          id: ThreadId.make("designer-" + attempt),
          title: "Designer",
          model,
          worktree: "/fixture-" + attempt,
        };
        concepts = yield* writeTask(
          root,
          project,
          {
            ...conceptEdit,
            attempt,
            requestId: "claim-" + attempt,
            change: { action: "claim", files: [], next: "Design" },
          },
          worker,
        );
        const claimed = concepts.attempts.find((a) => a.number === attempt)!;
        concepts = yield* writeTask(
          root,
          project,
          {
            ...conceptEdit,
            attempt,
            generation: claimed.generation,
            revision: claimed.revision,
            requestId: "submit-" + attempt,
            change: {
              action: "submit",
              checkpoint: attempt === 1 ? "discarded concept" : "selected concept",
              verification: "Design evidence " + attempt,
            },
          },
          worker,
        );
      }
      const premature = yield* writeTask(root, project, implementation, operator).pipe(Effect.flip);
      expect(premature.detail).toContain("accepted result");
      const selected = concepts.attempts.find((a) => a.number === 2)!;
      yield* writeTask(
        root,
        project,
        {
          ...conceptEdit,
          attempt: 2,
          generation: selected.generation,
          revision: selected.revision,
          requestId: "pick",
          change: { action: "accept" },
        },
        operator,
      );
      const foreign = yield* writeTask(root, "another-project", implementation, operator).pipe(
        Effect.flip,
      );
      expect(foreign.detail).toContain("in this project");
      const created = yield* writeTask(root, project, implementation, operator);
      expect(created.basedOn).toBe("concepts");
      yield* writeTask(
        root,
        project,
        { ...edit, requestId: "plan", change: { action: "plan", step } },
        operator,
      );
      type Services = Parameters<typeof reviewerTick>[0];
      const roles: string[] = [];
      let budget = 100000;
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
          sendToThread: () => Effect.die("protected work reached a writable chat"),
        },
        engine: {
          getThreadRecords: () => Effect.die("protected inference does not use native runs"),
        },
        commandReceipt: () => Effect.succeedNone,
        usage: {} as Services["usage"],
        guardedTurn: async (prompt) => {
          const { role, selectedDesign } = JSON.parse(prompt);
          expect(selectedDesign).toEqual({
            task: "concepts",
            attempt: 2,
            summary: "selected concept",
            verification: "Design evidence 2",
            reference: "docs/concepts.md",
          });
          expect(prompt).not.toContain("discarded concept");
          roles.push(role);
          const decision =
            role === "builder" ? "propose" : roles.length === 2 ? "changes_requested" : "pass";
          return {
            session: "session-" + roles.length,
            tokens: 100,
            usd: 0.001,
            answer: {
              decision,
              summary: "Checked both orders",
              path: "",
              edits:
                role === "builder"
                  ? [
                      {
                        path: "main.ts",
                        content:
                          roles.length === 1
                            ? "export const f=Math.min;"
                            : "export const f=Math.max;",
                      },
                    ]
                  : [],
            },
          };
        },
        readInputs: () =>
          Effect.gen(function* () {
            const now = DateTime.formatIso(yield* DateTime.now),
              day = now.slice(0, 10);
            const p = decodeProject({
              id: project,
              title: "fixture",
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
              auth: { status: "authenticated", email: "fixture@example.test" },
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
              pricing: { status: "fresh", source: "test", fetchedAt: now, knownModels: 1 },
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
                        dailyTokens: budget,
                        dailyUsd: 1,
                        contextTokens: 10000,
                        reservePercent: 0,
                        economy: { instanceId, model },
                        advanced: null,
                      },
                    },
                  },
                },
              },
              asOf: now,
              reports: new Map([[project, report]]),
              offset: 0,
              attempts: yield* readQueueAttempts(root),
            };
          }),
      };
      const tick = () => TestClock.adjust("1 second").pipe(Effect.andThen(reviewerTick(services)));
      yield* tick();
      yield* tick();
      expect(roles).toEqual(["builder"]);
      budget = 8200;
      yield* tick();
      expect(roles).toHaveLength(1);
      const held = (yield* readTask(root, project, "max")).brief!.attempts[0]!;
      expect(held.reviewHold).toContain("insufficient daily tokens");
      budget = 100000;
      for (let i = 0; i < 6; i++) yield* tick();
      const task = (yield* readTask(root, project, "max")).brief!,
        a = task.attempts[0]!;
      expect(roles).toEqual(["builder", "reviewer", "builder", "reviewer"]);
      expect(a.guarded?.history.map((r) => r.tokens)).toEqual([100, 100, 100, 100]);
      expect(a.guarded?.approved).toBe(true);
      expect(task.accepted).toBeNull();
      const verify = {
        ...edit,
        generation: a.generation,
        revision: a.revision,
        requestId: "verify",
      };
      const stale = yield* writeTask(
        root,
        project,
        {
          ...verify,
          change: { action: "verifyCandidate", commit: "outdated", evidence: "checked" },
        },
        operator,
      ).pipe(Effect.result);
      expect(stale._tag).toBe("Failure");
      const workerVerification = yield* writeTask(
        root,
        project,
        {
          ...verify,
          change: {
            action: "verifyCandidate",
            commit: a.guarded!.candidate,
            evidence: "Builder says pass",
          },
        },
        { kind: "worker", id: thread, title: "Builder", model, worktree: null },
      ).pipe(Effect.result);
      expect(workerVerification._tag).toBe("Failure");
      const accepted = yield* writeTask(
        root,
        project,
        {
          ...verify,
          change: {
            action: "verifyCandidate",
            commit: a.guarded!.candidate,
            evidence: "CI build 123",
          },
        },
        operator,
      );
      expect(accepted.accepted).toBe(1);
    }).pipe(Effect.scoped),
);
