import {
  isProviderAvailable,
  resolveProjectProviderInstanceEnabled,
  type OrchestrationProjectShell,
  type ProjectId,
  type QueueDecision,
  type ServerProvider,
  type ServerSettings,
  type UsageSummary,
} from "@t3tools/contracts";
import { windowLimitsModel } from "../provider/claudeUsageLimits.ts";
import type { QueueAttempt } from "./taskLedger.ts";

export function activeQueueProjects(
  projects: readonly OrchestrationProjectShell[],
  settings: ServerSettings,
) {
  return projects.filter(
    (p) =>
      !p.archivedAt && (settings.it3Workspaces?.projects?.[p.id]?.status ?? "active") === "active",
  );
}

function applicableWindows(provider: ServerProvider, model: string) {
  const windows = provider.usageLimits?.windows ?? [];
  return windows.filter((w) => {
    if (w.modelIds && !w.modelIds.includes(model)) return false;
    if (w.providerIds && !w.providerIds.includes(model.split("/")[0] ?? "")) return false;
    switch (provider.driver) {
      case "claudeAgent":
        return windowLimitsModel(w, model);
      case "codex":
        return (
          w.id !== "individual" ||
          !windows.some((other) => ["primary", "secondary"].includes(other.id))
        );
      case "opencode":
        return !w.id.startsWith("go_") || model.startsWith("opencode-go/");
      case "cursor":
        return w.id !== "autoPercentUsed" || /^(auto|default|grok|composer)/.test(model);
      case "antigravity": {
        const family = model.match(/^(gemini|claude|gpt)-/)?.[1];
        const pool = w.id.match(/^(gemini|claude|gpt|3p)-/)?.[1];
        return !family || !pool || family === pool || (pool === "3p" && family !== "gemini");
      }
      default:
        return true;
    }
  });
}

export const reviewPool = (p: ServerProvider) =>
  JSON.stringify([
    p.driver,
    p.auth.email?.toLowerCase() || p.usageLimits?.credentialFingerprint || p.instanceId,
  ]);

export interface PreviewInput {
  guardedSpend?: ReadonlyMap<ProjectId, { tokens: number; usd: number; estimated: boolean }>;
  projects: readonly OrchestrationProjectShell[];
  settings: ServerSettings;
  attempts: readonly QueueAttempt[];
  providers: readonly ServerProvider[];
  reports: ReadonlyMap<ProjectId, UsageSummary | null>;
  asOf: string;
  offset: number;
}
const priorityOrder = { urgent: 0, normal: 1, background: 2 };
const freshnessMs = 10 * 60_000;
function fresh(time: string, now: number) {
  const age = now - Date.parse(time);
  return age >= 0 && age <= freshnessMs;
}

function projectSpend(report: UsageSummary) {
  return report.buckets.reduce(
    (acc, b) => ({
      tokens:
        acc.tokens +
        b.totals.uncachedInputTokens +
        b.totals.cachedInputTokens +
        b.totals.cacheCreationTokens +
        b.totals.outputTokens,
      usd: acc.usd + b.costUsd,
      unpriced: acc.unpriced + b.unpricedRecords,
    }),
    { tokens: 0, usd: 0, unpriced: 0 },
  );
}

// Each candidate is evaluated as the single next step against the same observation.
export function previewQueue(input: PreviewInput, limit = 12) {
  const { settings, providers, attempts, asOf } = input;
  const now = Date.parse(asOf),
    day = asOf.slice(0, 10);
  const projects = new Map(activeQueueProjects(input.projects, settings).map((p) => [p.id, p]));
  const policyFor = (id: ProjectId) => settings.it3Workspaces?.projects?.[id]?.queuePolicy;
  const providerFor = (id: ProjectId, step: QueueAttempt["step"]) =>
    step && step.route !== "check" ? policyFor(id)?.[step.route]?.instanceId : undefined;
  const poolFor = (id: string | undefined) => {
    const p = providers.find((x) => x.instanceId === id);
    return p && reviewPool(p);
  };
  const settled = new Map(
    Array.from(input.reports).flatMap(([id, report]) =>
      report ? [[id, projectSpend(report)] as const] : [],
    ),
  );
  const busyProjects = new Set<ProjectId>(),
    busyPools = new Set<string>();
  let unknownPool = false;
  for (const attempt of attempts) {
    if (
      (attempt.stage !== "assigned" && attempt.stage !== "working") ||
      attempt.step?.route === "check"
    )
      continue;
    busyProjects.add(attempt.projectId);
    const account = poolFor(providerFor(attempt.projectId, attempt.step));
    if (account) busyPools.add(account);
    else unknownPool = true;
  }
  const poolFloors = new Map<string, number>();
  for (const p of projects.values()) {
    const policy = policyFor(p.id);
    if (!policy) continue;
    for (const route of [policy.economy, policy.advanced]) {
      const key = poolFor(route?.instanceId);
      if (key) poolFloors.set(key, Math.max(poolFloors.get(key) ?? 0, policy.reservePercent));
    }
  }
  const decisions = attempts.flatMap((a) => {
    const project = projects.get(a.projectId);
    if (!project || a.stage !== "ready") return [];
    const policy = policyFor(a.projectId),
      step = a.step;
    const priority = step?.priority ?? policy?.priority ?? "normal";
    const row: QueueDecision = {
      ...(step?.seat
        ? {
            reviewer:
              a.reviewStatus ??
              (policy?.reviewer
                ? "Awaiting dispatch check."
                : "Bind the reviewer seat in Project queue policy."),
          }
        : {}),
      projectId: project.id,
      project: project.title,
      key: a.key,
      title: a.title,
      attempt: a.attempt,
      priority,
      next: step?.next ?? "",
      verification: step?.verification ?? "",
      reason: "ready",
      detail: "",
      model: null,
      provider: null,
      remainingUsd: null,
      remainingTokens: null,
      input: step?.inputTokens ?? 0,
      output: step?.outputTokens ?? 0,
      estimatedUsd: step?.route === "check" ? 0 : (step?.estimatedUsd ?? null),
      windows: [],
      checkedAt: null,
    };
    const decide = (
      reason: QueueDecision["reason"],
      detail: string,
      extra: Partial<QueueDecision> = {},
    ) => [{ readySince: a.readySince, row: { ...row, ...extra, reason, detail } }];
    if (!step) return decide("step", "Add a next step and a completion check.");
    if (a.blockedBy) return decide("dependency", "Waiting for accepted task " + a.blockedBy + ".");
    if (step.route === "check")
      return decide("ready", "Deterministic check. Uses zero model tokens.", {
        input: 0,
        output: 0,
      });
    if (!policy) return decide("policy", "Set this project’s daily budget and model route.");
    const route = policy[step.route];
    if (!route)
      return decide("route", "Choose a provider and model for the " + step.route + " route.");
    const provider = providers.find((p) => p.instanceId === route.instanceId);
    const selected = { model: route.model, provider: provider?.displayName ?? route.instanceId };
    if (step.route === "advanced" && priority === "background")
      return decide(
        "background",
        "Background priority allows the economy route or a deterministic check.",
        selected,
      );
    if (
      !provider ||
      !provider.enabled ||
      !provider.installed ||
      !isProviderAvailable(provider) ||
      provider.status === "error" ||
      provider.auth.status === "unauthenticated" ||
      !resolveProjectProviderInstanceEnabled(settings, a.projectId, route.instanceId) ||
      !provider.models.some((m) => m.slug === route.model)
    )
      return decide(
        "route",
        "The configured provider or model is unavailable to this project.",
        selected,
      );
    if (
      step.inputTokens <= 0 ||
      step.outputTokens <= 0 ||
      step.windowPercent <= 0 ||
      (policy.dailyUsd !== null && step.estimatedUsd === null)
    )
      return decide(
        "estimate",
        "Enter input, output, allowance and any required cost estimate.",
        selected,
      );
    const total = step.inputTokens + step.outputTokens;
    if (total > policy.contextTokens)
      return decide(
        "context",
        "Estimated input and output exceed the project context ceiling.",
        selected,
      );
    const limits = provider.usageLimits;
    const windows = applicableWindows(provider, route.model).map((w) => ({
      id: w.id,
      label: w.label,
      remaining: 100 - w.usedPercent,
      after: 100 - w.usedPercent - step.windowPercent,
      reset: w.resetsAt ?? null,
    }));
    const evidence = { ...selected, checkedAt: limits?.checkedAt ?? null, windows };
    if (limits?.zeroSpendCap)
      return decide("allowance", "The provider reports a zero spending cap.", evidence);
    if (!limits || limits.unavailable || !windows.length)
      return decide(
        "allowance",
        "Waiting for a provider allowance reading for this model.",
        evidence,
      );
    if (!fresh(limits.checkedAt, now) || windows.some((w) => w.reset && Date.parse(w.reset) <= now))
      return decide(
        "stale",
        "Waiting for a fresh allowance reading after expiry or reset.",
        evidence,
      );
    const report = input.reports.get(project.id);
    const driver = provider.driver === "claudeAgent" ? "claude" : provider.driver;
    if (
      !report ||
      report.it3ProjectId !== project.id ||
      report.sinceDay !== day ||
      report.untilDay !== day ||
      !fresh(report.readAt, now) ||
      !report.sources.some((s) => s.fingerprint.provider === driver && s.status === "ok") ||
      report.sources.some((s) => s.refreshing || s.status === "partial" || s.status === "failed")
    )
      return decide(
        "usage",
        "Today’s attributable project usage is incomplete or stale.",
        evidence,
      );
    if (unknownPool || busyProjects.has(project.id) || busyPools.has(reviewPool(provider)))
      return decide(
        "usage",
        "An assigned or working attempt could use this capacity. Recheck after settlement.",
        evidence,
      );
    const spent = settled.get(project.id)!;
    const remainingTokens =
      policy.dailyTokens -
      spent.tokens -
      (input.guardedSpend?.get(project.id)?.tokens ?? 0) -
      total;
    const remainingUsd =
      policy.dailyUsd === null || spent.unpriced > 0
        ? null
        : policy.dailyUsd -
          spent.usd -
          (input.guardedSpend?.get(project.id)?.usd ?? 0) -
          (step.estimatedUsd ?? 0);
    const projection = { ...evidence, remainingTokens, remainingUsd };
    if (remainingTokens < 0)
      return decide(
        "tokens",
        "The estimated turn exceeds today’s remaining token budget.",
        projection,
      );
    if (
      policy.dailyUsd !== null &&
      (remainingUsd === null || remainingUsd < 0 || policy.dailyUsd === 0)
    )
      return decide(
        "cost",
        "The daily cost limit is exhausted, insufficient or has unpriced usage.",
        projection,
      );
    const exhausted = windows.find((w) => w.after < 0);
    if (exhausted)
      return decide(
        "allowance",
        "The estimate exceeds the remaining " + exhausted.label + " allowance.",
        projection,
      );
    const reserve = priority === "urgent" ? 0 : policy.reservePercent / 100;
    const floor = priority === "urgent" ? 0 : (poolFloors.get(reviewPool(provider)) ?? 0);
    const protectedWindow = windows.find((w) => w.after < floor);
    if (protectedWindow)
      return decide(
        "reserve",
        protectedWindow.label + " would fall below the " + floor + "% urgent reserve.",
        projection,
      );
    if (
      remainingTokens < policy.dailyTokens * reserve ||
      (remainingUsd !== null && remainingUsd < (policy.dailyUsd ?? 0) * reserve)
    )
      return decide(
        "reserve",
        "This step would spend the project’s " +
          policy.reservePercent +
          "% daily reserve for urgent work.",
        projection,
      );
    return decide(
      "ready",
      "The selected route fits the observed windows and project budget.",
      projection,
    );
  });
  decisions.sort(
    (a, b) =>
      Number(b.row.reason === "ready") - Number(a.row.reason === "ready") ||
      priorityOrder[a.row.priority] - priorityOrder[b.row.priority] ||
      a.readySince.localeCompare(b.readySince) ||
      a.row.key.localeCompare(b.row.key) ||
      a.row.projectId.localeCompare(b.row.projectId) ||
      a.row.attempt - b.row.attempt,
  );
  const attention = attempts
    .flatMap((a) =>
      a.attention ? [{ projectId: a.projectId, key: a.key, title: a.title, ...a.attention }] : [],
    )
    .sort((a, b) => a.since.localeCompare(b.since) || a.key.localeCompare(b.key));
  return {
    guardedSpend: Array.from(input.guardedSpend ?? [], ([projectId, values]) => ({
      projectId,
      ...values,
    })),
    attention: attention.slice(input.offset, input.offset + limit),
    attentionTotal: attention.length,
    asOf,
    day,
    eligible: decisions.filter((d) => d.row.reason === "ready").length,
    total: decisions.length,
    rows: decisions.slice(input.offset, input.offset + limit).map((d) => d.row),
  };
}
