import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DEFAULT_SERVER_SETTINGS,
  OrchestrationProjectShell,
  ServerProvider,
  UsageSummary,
  ProjectId,
  ProviderInstanceId,
  type QueuePolicy,
  type QueueStep,
} from "@t3tools/contracts";
import { previewQueue } from "./queuePreview.ts";
import type { QueueAttempt } from "./taskLedger.ts";

const now = "2026-01-01T12:00:00.000Z",
  day = now.slice(0, 10);
const one = ProjectId.make("one"),
  two = ProjectId.make("two"),
  instanceId = ProviderInstanceId.make("codex");
const policy: QueuePolicy = {
  priority: "normal",
  dailyTokens: 1000,
  dailyUsd: 2,
  contextTokens: 500,
  reservePercent: 0,
  economy: { instanceId, model: "small" },
  advanced: { instanceId, model: "large" },
};
const step: QueueStep = {
  next: "Check indexes",
  verification: "Integrity query passes",
  route: "economy",
  dependencies: [],
  priority: null,
  inputTokens: 100,
  outputTokens: 50,
  estimatedUsd: 0.05,
  windowPercent: 5,
};
const candidate = (projectId: ProjectId, overrides: Partial<QueueAttempt> = {}): QueueAttempt => ({
  projectId,
  key: "index",
  title: "Indexes",
  attempt: 1,
  stage: "ready",
  step,
  readySince: now,
  blockedBy: null,
  ...overrides,
});
const decodeProject = Schema.decodeSync(OrchestrationProjectShell);
const decodeReport = Schema.decodeSync(UsageSummary);
const projects = [one, two].map((id) =>
  decodeProject({
    id,
    title: id,
    workspaceRoot: "/" + id,
    defaultModelSelection: null,
    scripts: [],
    createdAt: now,
    updatedAt: now,
  }),
);
const provider = Schema.decodeSync(ServerProvider)({
  instanceId,
  driver: "codex",
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: now,
  models: ["small", "large"].map((slug) => ({
    name: slug,
    slug,
    isCustom: false,
    capabilities: null,
  })),
  usageLimits: {
    checkedAt: now,
    windows: [
      { id: "primary", kind: "session", label: "Session", usedPercent: 5 },
      { id: "secondary", kind: "weekly", label: "Week", usedPercent: 85 },
    ],
  },
});
const report = (id: ProjectId) =>
  decodeReport({
    contractVersion: 6,
    it3ProjectId: id,
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
        scannedFiles: 0,
        skippedFiles: 0,
        malformedRecords: 0,
        distinctSessions: 0,
        message: null,
      },
    ],
    pricing: { status: "fresh", source: "test", fetchedAt: now, knownModels: 1 },
    scanDurationMs: 0,
  });
const config = (p: QueuePolicy = policy) => ({
  ...DEFAULT_SERVER_SETTINGS,
  it3Workspaces: {
    projects: {
      [one]: { queuePolicy: p },
      [two]: { queuePolicy: { ...policy, priority: "urgent" as const, reservePercent: 20 } },
    },
  },
});
const base = {
  projects,
  settings: config(),
  providers: [provider],
  reports: new Map([one, two].map((id) => [id, report(id)])),
  asOf: now,
  offset: 0,
  attempts: [candidate(one), candidate(two)],
};
it("ranks both projects against one weekly pool and preserves the larger urgent reserve", () => {
  const preview = previewQueue(base);
  expect(preview.eligible).toBe(1);
  expect(preview.rows.map((r) => [r.projectId, r.key, r.reason])).toEqual([
    [two, "index", "ready"],
    [one, "index", "reserve"],
  ]);
  expect(preview.rows[0]).toMatchObject({
    remainingTokens: 850,
    remainingUsd: 1.95,
    windows: [{ after: 90 }, { remaining: 15, after: 10 }],
  });
});
it("removes paused, archived, claimed, and submitted work and admits a deterministic check without telemetry", () => {
  const settings = {
    ...base.settings,
    it3Workspaces: { projects: { [two]: { status: "paused" as const } } },
  };
  const attempts = [
    candidate(two),
    candidate(one, { step: { ...step, route: "check" } }),
    candidate(one, { stage: "working" }),
    candidate(one, { stage: "submitted" }),
  ];
  expect(
    previewQueue({ ...base, settings, attempts, reports: new Map(), providers: [] }).rows.map(
      (r) => [r.reason, r.input],
    ),
  ).toEqual([["ready", 0]]);
  expect(
    previewQueue({
      ...base,
      settings,
      attempts,
      projects: projects.map((p) => ({ ...p, archivedAt: now })),
    }).total,
  ).toBe(0);
});
it("holds work with missing steps, dependencies, stale windows, unmeasured usage or incomplete estimates", () => {
  const check = (change: Partial<typeof base>, reason: string) =>
    expect(previewQueue({ ...base, attempts: [candidate(two)], ...change }).rows[0]?.reason).toBe(
      reason,
    );
  check({ attempts: [candidate(two, { step: null })] }, "step");
  check({ attempts: [candidate(two, { blockedBy: "parent" })] }, "dependency");
  check({ asOf: "2026-01-01T12:11:00.000Z" }, "stale");
  check({ reports: new Map() }, "usage");
  check({ attempts: [candidate(two, { step: { ...step, estimatedUsd: null } })] }, "estimate");
  check(
    {
      attempts: [candidate(two, { step: { ...step, route: "advanced", priority: "background" } })],
    },
    "background",
  );
  check({ attempts: [candidate(two, { step: { ...step, inputTokens: 1000 } })] }, "context");
  check({ attempts: [candidate(two, { step: { ...step, estimatedUsd: 3 } })] }, "cost");
  check(
    { providers: [{ ...provider, usageLimits: { ...provider.usageLimits!, zeroSpendCap: true } }] },
    "allowance",
  );
  check(
    {
      providers: [
        {
          ...provider,
          usageLimits: {
            ...provider.usageLimits!,
            windows: provider.usageLimits!.windows.map((w, i) =>
              i === 0 ? { ...w, resetsAt: now } : w,
            ),
          },
        },
      ],
    },
    "stale",
  );
  check({ attempts: [candidate(two), candidate(one, { stage: "assigned" })] }, "usage");
});
it("uses a token ceiling independently of cost and paginates after ordering", () => {
  const result = previewQueue({
    ...base,
    settings: config({ ...policy, dailyTokens: 100 }),
    attempts: [candidate(one)],
  });
  expect(result.rows[0]?.reason).toBe("tokens");
  const attempts = Array.from({ length: 14 }, (_, i) =>
    candidate(one, { key: "K" + String(i).padStart(2, "0"), step: { ...step, route: "check" } }),
  ).reverse();
  expect(previewQueue({ ...base, attempts, offset: 12 }).rows.map((r) => r.key)).toEqual([
    "K12",
    "K13",
  ]);
});
it("deducts measured input, cache writes and output once, and holds a dollar-capped project with unpriced records", () => {
  const snapshot = report(two);
  const bucket = {
    day: snapshot.sinceDay,
    provider: "codex" as const,
    model: "small",
    totals: {
      uncachedInputTokens: 100,
      cachedInputTokens: 50,
      cacheCreationTokens: 10,
      outputTokens: 40,
      reasoningTokens: 20,
    },
    costUsd: 0.25,
    cacheSavingsUsd: 0,
    costSource: "modelPriced" as const,
    records: 2,
    unpricedRecords: 0,
    sessions: 1,
  };
  const evaluate = (unpricedRecords: number) =>
    previewQueue({
      ...base,
      attempts: [candidate(two)],
      reports: new Map([[two, { ...snapshot, buckets: [{ ...bucket, unpricedRecords }] }]]),
    }).rows[0];
  expect(evaluate(0)).toMatchObject({ reason: "ready", remainingTokens: 650, remainingUsd: 1.7 });
  expect(evaluate(1)).toMatchObject({ reason: "cost", remainingUsd: null });
});
