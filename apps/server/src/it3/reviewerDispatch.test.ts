// @effect-diagnostics nodeBuiltinImport:off -- isolated filesystem and SQLite fixtures.
import { it, expect } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Schema from "effect/Schema";
import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  RunId,
  OrchestrationProjectShell,
  ServerProvider,
  UsageSummary,
  type QueueStep,
  type QueuePolicy,
} from "@t3tools/contracts";
import { readQueueAttempts, readTask, writeTask } from "./taskLedger.ts";
import { ThreadManagementThreadArchivedError } from "../orchestration-v2/ThreadManagementService.ts";
import { reviewerTick } from "./reviewerDispatch.ts";

const decodeProject = Schema.decodeEffect(OrchestrationProjectShell);
const decodeUsage = Schema.decodeEffect(UsageSummary);
const decodeProvider = Schema.decodeSync(ServerProvider);
it.effect(
  "reserves once, enforces the seat permission and allowance, recovers a lost send receipt, and settles only its run",
  () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "review-"))),
        (d) => Effect.sync(() => NodeFS.rmSync(d, { recursive: true, force: true })),
      );
      const project = ProjectId.make("p"),
        thread = ThreadId.make("r"),
        instanceId = ProviderInstanceId.make("codex"),
        run = RunId.make("run");
      const now = "2026-01-01T12:00:00.000Z",
        day = now.slice(0, 10);
      let policy: QueuePolicy = {
        reviewer: thread,
        priority: "normal",
        dailyTokens: 500,
        dailyUsd: 1,
        contextTokens: 250,
        reservePercent: 0,
        economy: { instanceId, model: "small" },
        advanced: null,
      };
      const step: QueueStep = {
        seat: "reviewer",
        route: "economy",
        next: "Read the patch",
        verification: "Give a verdict",
        priority: null,
        dependencies: [],
        inputTokens: 80,
        outputTokens: 20,
        estimatedUsd: 0.1,
        windowPercent: 4,
      };
      for (const key of ["a", "b"]) {
        const base = { key, attempt: 1 as const, generation: 0, revision: 0, requestId: "create" },
          operator = { kind: "operator" as const, id: "user" };
        yield* writeTask(
          dir,
          project,
          {
            ...base,
            change: {
              action: "create",
              title: key,
              request: "Review it",
              reference: "",
              comparison: false,
              steps: [],
            },
          },
          operator,
        );
        yield* writeTask(
          dir,
          project,
          { ...base, revision: 0, requestId: "plan", change: { action: "plan", step } },
          operator,
        );
      }
      const p = yield* decodeProject({
        id: project,
        title: "Project",
        workspaceRoot: "/p",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      });
      const report = yield* decodeUsage({
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
              provider: "codex",
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
      let telemetry = false;
      let allowed = false,
        limit = 100,
        done = false,
        sends = 0;
      let msg = "";

      const readInputs = () =>
        readQueueAttempts(dir).pipe(
          Effect.map((attempts) => ({
            projects: [p],
            settings: {
              ...DEFAULT_SERVER_SETTINGS,
              it3Workspaces: { projects: { [project]: { queuePolicy: policy } } },
            },
            attempts,
            providers: [
              decodeProvider({
                instanceId,
                driver: "codex",
                enabled: true,
                installed: true,
                version: null,
                status: "ready",
                auth: { status: "authenticated" },
                checkedAt: now,
                models: [{ name: "small", slug: "small", isCustom: false, capabilities: null }],
                usageLimits: {
                  checkedAt: now,
                  windows: [
                    { id: "primary", kind: "session", label: "Session", usedPercent: limit },
                  ],
                },
              }),
            ],
            reports: new Map([[project, report]]),
            asOf: now,
            offset: 0,
          })),
        );
      type Services = Parameters<typeof reviewerTick>[0];
      const services: Services = {
        path: dir,
        readInputs,
        commandReceipt: () => Effect.succeedNone,
        usage: { priceRunRecord: () => Effect.succeed(0.012) },
        threads: {
          getThreadShell: () =>
            Effect.succeed({
              id: thread,
              projectId: project,
              title: "Review",
              interactionMode: "plan",
              runtimeMode: allowed ? "auto" : "full-access",
              modelSelection: policy.economy,
            } as NonNullable<Effect.Success<ReturnType<Services["threads"]["getThreadShell"]>>>),
          sendToThread: (input) => {
            expect(input.reviewerOnly).toBe(true);
            expect(input.freshContext).toBe(true);
            sends++;
            msg = input.messageId;
            return Effect.fail(new ThreadManagementThreadArchivedError({ threadId: thread }));
          },
        },
        engine: {
          getThreadRecords: ((_id: unknown, fields: string[]) =>
            Effect.succeed(
              fields.includes("messages")
                ? { messages: msg ? [{ id: msg, runId: run }] : [] }
                : fields.includes("runs")
                  ? {
                      runs: [
                        {
                          id: run,
                          status: done ? "completed" : "running",
                          output: done
                            ? {
                                value: {
                                  verdict: "pass",
                                  summary: "Reviewed",
                                  verification: "Checked diff",
                                  completed: [],
                                },
                              }
                            : null,
                        },
                      ],
                      attempts: [
                        { id: "owned", runId: run },
                        { id: "other", runId: "unrelated" },
                      ],
                    }
                  : {
                      providerTurns: [
                        {
                          runAttemptId: "owned",
                          turnTokenUsage: {
                            usageStatus: telemetry ? "complete" : "unavailable",
                            inputTokens: 60,
                            outputTokens: 15,
                            hasSubagents: false,
                          },
                        },
                        {
                          runAttemptId: "other",
                          turnTokenUsage: {
                            usageStatus: "complete",
                            inputTokens: 9999,
                            outputTokens: 10,
                          },
                        },
                      ],
                    },
            )) as unknown as Services["engine"]["getThreadRecords"],
        },
      };
      const tick = () => reviewerTick(services);
      const get = (key: string) =>
        readTask(dir, project, key).pipe(Effect.map((p) => p.brief!.attempts[0]!));
      yield* tick();
      expect((yield* get("a")).reviewHold).toMatch(/allowance/);
      limit = 1;
      yield* tick();
      expect((yield* get("a")).reviewHold).toMatch(/permissions/);
      allowed = true;
      yield* Effect.all([tick(), tick()], { concurrency: "unbounded" });
      expect((yield* get("a")).review?.reservedTokens).toBe(100);
      expect((yield* get("b")).review).toBeUndefined();
      yield* tick();
      expect(sends).toBe(1);
      yield* tick();
      expect((yield* get("a")).review?.run).toBe(run);
      done = true;
      yield* tick();
      expect(sends).toBe(1);
      const ended = yield* get("a");
      expect(ended.stage).toBe("submitted");
      expect(ended.checkpoint).toBe("Reviewed");
      expect(ended.review?.tokens).toBeNull();
      telemetry = true;
      policy = { ...policy, dailyTokens: 120 };
      yield* TestClock.adjust("6 minutes");
      yield* tick();
      const settled = yield* get("a");
      expect(settled.review?.tokens).toBe(75);
      expect(settled.review?.pricedUsd).toBe(0.012);
      policy = { ...policy, dailyTokens: 120 };
      yield* tick();
      expect((yield* get("b")).reviewHold).toMatch(/Settled reviewer usage/);
      expect(sends).toBe(1);
    }).pipe(Effect.scoped),
);
