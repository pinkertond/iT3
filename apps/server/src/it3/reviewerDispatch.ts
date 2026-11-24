// @effect-diagnostics nodeBuiltinImport:off -- stable, opaque pool and native command identities.
import * as NodeCrypto from "node:crypto";
import {
  TaskLedgerError,
  CommandId,
  MessageId,
  RunId,
  type OrchestrationV2ThreadShell,
  type ProviderInstanceId,
  type ReviewReceipt,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { CommandReceiptStoreV2 } from "../orchestration-v2/CommandReceiptStore.ts";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { ServerConfig } from "../config.ts";
import { forkParked } from "../serverActivation.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import { OrchestratorV2 } from "../orchestration-v2/Orchestrator.ts";
import { UsageService } from "../usage/UsageService.ts";
import { initialGuard, guardedPrompt, applyGuardedAnswer, runGuardedTurn } from "./guardedTurn.ts";
import { readTask } from "./taskLedger.ts";
import { makeQueueReader } from "./queueReader.ts";
import { previewQueue, reviewPool, type PreviewInput } from "./queuePreview.ts";
import {
  refreshReviewCost,
  reviewJobs,
  updateReview,
  reviewResult,
  type ReviewJob,
} from "./reviewerLedger.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const digest = (s: string) => NodeCrypto.createHash("sha256").update(s).digest("hex");
const reviewOutput = Schema.Struct({
  verdict: Schema.Literals(["pass", "changes_requested", "blocked"]),
  summary: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000)),
  verification: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000)),
  completed: Schema.Array(Schema.String).check(Schema.isMaxLength(64)),
});
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "verification", "completed"],
  properties: {
    verdict: { type: "string", enum: ["pass", "changes_requested", "blocked"] },
    summary: { type: "string", minLength: 1, maxLength: 4000 },
    verification: { type: "string", minLength: 1, maxLength: 4000 },
    completed: { type: "array", maxItems: 64, items: { type: "string", maxLength: 160 } },
  },
} as const;
function reviewerHold(
  shell: OrchestrationV2ThreadShell | null,
  job: ReviewJob,
  instance: ProviderInstanceId,
  model: string,
) {
  if (!shell || shell.projectId !== job.project || shell.archivedAt || shell.deletedAt)
    return "Bind Reviewer to an available project chat.";
  if (
    shell.interactionMode !== "plan" ||
    !["approval-required", "auto"].includes(shell.runtimeMode)
  )
    return "Reviewer requires Plan mode and Auto or approval-required permissions.";
  if (shell.modelSelection.instanceId !== instance || shell.modelSelection.model !== model)
    return "The reviewer chat must use the provider and model selected by the queue route.";
  if (shell.pendingRuntimeRequest?.blocking !== false && shell.pendingRuntimeRequest)
    return "Reviewer needs your response in its chat.";
  if (shell.activeRunId || shell.activityRunStatus) return "The reviewer chat is busy.";
  return null;
}
function decisions(input: PreviewInput) {
  return previewQueue(input, input.attempts.length).rows;
}
function measuredReviewUsage(turns: readonly OrchestrationV2ProviderTurn[]) {
  if (!turns.length) return null;
  let tokens = 0;
  const records = [];
  for (const t of turns) {
    const u = t.turnTokenUsage;
    if (!u || u.usageStatus !== "complete" || (u.hasSubagents && !u.otherUsage)) return null;
    tokens +=
      u.inputTokens +
      u.outputTokens +
      (u.otherUsage?.inputTokens ?? 0) +
      (u.otherUsage?.outputTokens ?? 0);
    const cached = u.cachedInputTokens ?? 0,
      created = u.cacheCreationTokens ?? 0;
    records.push({
      model: u.models?.length === 1 ? u.models[0] : undefined,
      canPrice:
        (u.models?.length ?? 0) <= 1 &&
        !u.otherUsage &&
        !u.hasSubagents &&
        u.inputTokens >= cached + created,
      totals: {
        uncachedInputTokens: Math.max(0, u.inputTokens - cached - created),
        cachedInputTokens: cached,
        cacheCreationTokens: created,
        outputTokens: u.outputTokens,
        reasoningTokens: u.reasoningTokens ?? 0,
      },
    });
  }
  return { tokens, records };
}
type ReviewServices = {
  guardedTurn?: typeof runGuardedTurn;
  path: string;
  threads: Pick<ThreadManagementService["Service"], "getThreadShell" | "sendToThread">;
  engine: Pick<OrchestratorV2["Service"], "getThreadRecords">;
  commandReceipt: CommandReceiptStoreV2["Service"]["getByCommandId"];
  usage: Pick<UsageService["Service"], "priceRunRecord">;
  readInputs: (
    offset?: number,
    reviewerOnly?: boolean,
  ) => Effect.Effect<PreviewInput, import("@t3tools/contracts").TaskLedgerError>;
};
export const reviewerTick = Effect.fn("it3.review.tick")(function* ({
  path,
  guardedTurn = runGuardedTurn,
  threads,
  engine,
  usage,
  readInputs,
  commandReceipt,
}: ReviewServices) {
  const time = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const save = Effect.fnUntraced(function* (
    j: ReviewJob,
    patch: Parameters<typeof updateReview>[2],
    detail: string,
  ) {
    return yield* updateReview(path, j, patch, detail, yield* time);
  });
  const hold = (j: ReviewJob, why: string) =>
    j.attempt.reviewHold === why
      ? Effect.void
      : save(j, { reviewHold: why }, why).pipe(Effect.asVoid);
  const observe = Effect.fnUntraced(function* (j: ReviewJob, r: ReviewReceipt) {
    const id = RunId.make(r.run!);
    const records = yield* engine.getThreadRecords(r.thread, ["runs", "attempts"], {
      runIds: [id],
    });
    const run = records.runs.find((x) => x.id === id);
    if (!run) return yield* hold(j, "Waiting for the native run receipt.");
    if (
      !run.completedAt &&
      !["completed", "cancelled", "interrupted", "failed", "rolled_back"].includes(run.status)
    ) {
      const shell = yield* threads.getThreadShell(r.thread);
      const state =
        shell?.pendingRuntimeRequest?.blocking !== false && shell?.pendingRuntimeRequest
          ? "Needs you · " + shell.pendingRuntimeRequest.kind
          : run.status;
      if (r.detail !== state || j.attempt.reviewHold)
        yield* save(j, { review: { ...r, detail: state }, reviewHold: "" }, state);
      return;
    }
    const ids = records.attempts.filter((a) => a.runId === id).map((a) => a.id);
    const { providerTurns } = yield* engine.getThreadRecords(r.thread, ["providerTurns"], {
      providerTurnAttemptIds: ids,
    });
    const measured = measuredReviewUsage(
      providerTurns.filter((t) => t.runAttemptId && ids.includes(t.runAttemptId)),
    );
    let pricedUsd: number | null = null;
    if (measured && usage.priceRunRecord) {
      let sum = 0,
        complete = true;
      for (const record of measured.records) {
        if (!record.canPrice) {
          complete = false;
          break;
        }
        const cost = yield* usage
          .priceRunRecord({
            model: record.model ?? r.model,
            totals: record.totals,
            speed: "standard",
            reportedCostUsd: null,
          })
          .pipe(Effect.orElseSucceed(() => null));
        if (cost === null) {
          complete = false;
          break;
        }
        sum += cost;
      }
      if (complete) pricedUsd = sum;
    }
    const observedAt = yield* time;
    const finished =
      r.finished ?? (run.completedAt ? DateTime.formatIso(run.completedAt) : observedAt);
    const tokens = measured?.tokens ?? r.tokens;
    const dollars = pricedUsd ?? r.pricedUsd;
    const nextAccounting =
      tokens !== null && dollars !== null
        ? null
        : DateTime.formatIso(
            DateTime.makeUnsafe(
              Date.parse(observedAt) +
                (Date.parse(observedAt) - Date.parse(finished) < 86400000 ? 300000 : 86400000),
            ),
          );
    if (r.finished) {
      yield* refreshReviewCost(path, j, tokens, dollars, nextAccounting, observedAt);
      return;
    }
    const result =
      run.status === "completed" && Schema.is(reviewOutput)(run.output?.value)
        ? run.output!.value
        : null;
    const detail = result
      ? "Review result · " + result.verdict
      : "Review ended " +
        run.status +
        " without a verified result. Inspect the chat before handoff.";
    yield* save(
      j,
      {
        ...reviewResult(
          j,
          {
            ...r,
            phase: result ? "completed" : "failed",
            detail,
            finished,
            nextAccounting,
            tokens,
            pricedUsd: dollars,
          },
          result,
        ),
        reviewHold: "",
      },
      detail,
    );
  });

  const { jobs, watermark } = yield* reviewJobs(path, yield* time);
  if (!jobs.length) return;
  const outstanding = jobs.filter((j) => j.attempt.review?.run);
  for (const j of outstanding)
    yield* observe(j, j.attempt.review!).pipe(
      Effect.catch(() =>
        hold(j, "Native run evidence is unavailable. The reservation is retained."),
      ),
    );
  const queued = jobs.filter((j) => !j.attempt.review?.run);
  if (!queued.length) return;
  const input = yield* readInputs(0, true);
  const rows = decisions(input);
  const positions = new Map(rows.map((r, i) => [encodeJson([r.projectId, r.key, r.attempt]), i]));
  const rank = (j: ReviewJob) =>
    positions.get(encodeJson([j.project, j.task.key, j.attempt.number])) ?? Number.MAX_SAFE_INTEGER;
  queued.sort((a, b) => Number(!a.attempt.review) - Number(!b.attempt.review) || rank(a) - rank(b));
  for (const j of queued) {
    const process = Effect.gen(function* () {
      let receipt = j.attempt.review;
      const id =
        receipt?.id ??
        digest(
          encodeJson([
            j.project,
            j.task.key,
            j.attempt.number,
            j.attempt.generation,
            j.attempt.revision,
          ]),
        );
      const messageId = MessageId.make("it3-review-" + id);
      const guard = j.task.queueStep?.guarded;
      if (guard && receipt?.phase === "running") {
        if (Date.parse(input.asOf) - Date.parse(j.attempt.updated) > 180000) {
          const detail =
            "Interrupted guarded turn. Inspect the task before starting a new attempt. Its charge is reserved.";
          const state = j.attempt.guarded!;
          yield* save(
            j,
            {
              guarded: {
                ...state,
                stopped: true,
                history: [
                  ...state.history,
                  { ...receipt, phase: "failed", finished: input.asOf, detail },
                ],
              },
              stage: "ready",
              next: detail,
              reviewHold: detail,
            },
            detail,
          );
        }
        return;
      }
      if (receipt && !guard) {
        const history = yield* engine.getThreadRecords(receipt.thread, ["messages"], {
          messageIds: [messageId],
        });
        const found = history.messages.find((m) => m.id === messageId)?.runId;
        if (found) {
          yield* save(
            j,
            {
              review: { ...receipt, run: found, phase: "running", detail: "Delivered" },
              stage: "working",
              delivery: "acknowledged",
              reviewHold: "",
            },
            "Recovered native delivery receipt.",
          );
          return;
        }
        const recorded = yield* commandReceipt(CommandId.make("it3-review-" + id));
        if (Option.isSome(recorded)) {
          if (recorded.value.status === "accepted") {
            yield* hold(j, "Delivery accepted. Waiting for native run evidence.");
            return;
          }
          const reason = recorded.value.error ?? "Native dispatch rejected the review.";
          yield* save(
            j,
            {
              ...reviewResult(
                j,
                {
                  ...receipt,
                  phase: "failed",
                  detail: reason,
                  finished: yield* time,
                  tokens: 0,
                  pricedUsd: 0,
                },
                null,
              ),
              reviewHold: "",
            },
            reason,
          );
          return;
        }
      }
      const step = j.task.queueStep!;
      const settings = input.settings.it3Workspaces?.projects?.[j.project];
      const policy = settings?.queuePolicy,
        seat = policy?.reviewer;
      const route = step.route === "check" ? null : policy?.[step.route];
      const row = receipt
        ? decisions({
            ...input,
            attempts: input.attempts.map((a) =>
              a.projectId === j.project && a.key === j.task.key && a.attempt === j.attempt.number
                ? { ...a, stage: "ready" }
                : a,
            ),
          }).find(
            (r) =>
              r.projectId === j.project && r.key === j.task.key && r.attempt === j.attempt.number,
          )
        : rows[rank(j)];
      const provider = input.providers.find((p) => p.instanceId === route?.instanceId);
      const pool = provider && digest(reviewPool(provider));
      const revoked =
        (receipt && receipt.day !== input.asOf.slice(0, 10)) ||
        !row ||
        !seat ||
        !route ||
        !pool ||
        (receipt &&
          (receipt.thread !== seat ||
            receipt.model !== route.model ||
            receipt.provider !== route.instanceId ||
            receipt.pool !== pool));
      if (revoked) {
        const reason = !row
          ? "Project is paused, archived or unavailable."
          : !seat
            ? "Bind the reviewer seat in Project queue policy."
            : "Reviewer model or account changed or is unavailable.";
        if (receipt) {
          const reasonToRelease =
            receipt.day !== input.asOf.slice(0, 10)
              ? "New budget day. Rechecking the unsent review."
              : reason;
          yield* updateReview(
            path,
            j,
            {
              stage: "ready",
              owner: null,
              ownerTitle: "",
              delivery: "none",
              reviewHold: reasonToRelease,
            },
            reasonToRelease,
            yield* time,
            undefined,
            true,
          );
          return;
        }
        yield* hold(j, reason);
        return;
      }
      if (row.reason !== "ready") {
        const reset = row.windows
          .filter(
            (w) => w.reset && w.after < (row.priority === "urgent" ? 0 : policy!.reservePercent),
          )
          .map((w) => w.reset!)
          .sort()
          .at(-1);
        yield* hold(j, row.detail + (reset ? " Window resets " + reset + "." : ""));
        return;
      }
      const shell = yield* threads.getThreadShell(seat);
      const why = reviewerHold(shell, j, route.instanceId, route.model);
      if (why) {
        yield* hold(j, why);
        return;
      }
      const root = input.projects.find((p) => p.id === j.project)?.workspaceRoot;
      if (
        guard &&
        (!root ||
          provider?.driver !== "claudeAgent" ||
          route.instanceId !== "claudeAgent" ||
          !provider.auth.email ||
          !step.estimatedUsd ||
          input.settings.providerInstances[route.instanceId]?.environment?.length)
      ) {
        yield* hold(
          j,
          "Protected turns require the default signed-in Claude instance, matching account, and a per-turn USD limit.",
        );
        return;
      }
      let state = j.attempt.guarded;
      let prompt = "";
      if (guard) {
        const parent = j.task.basedOn
          ? (yield* readTask(path, j.project, j.task.basedOn)).brief
          : null;
        const selected = parent?.attempts.find((a) => a.number === parent.accepted);
        if (j.task.basedOn && !selected) {
          yield* hold(j, "The selected design evidence is unavailable.");
          return;
        }
        const concept =
          selected && parent
            ? {
                task: parent.key,
                attempt: selected.number,
                summary: selected.checkpoint,
                verification: selected.verification,
                reference: parent.reference,
              }
            : undefined;
        const packet = yield* Effect.try({
          try: () => {
            const current = state ?? {
              ...initialGuard(root!),
              ...(concept ? { selectedDesign: concept } : {}),
            };
            const text = guardedPrompt(root!, j.task, current, current.selectedDesign ?? concept);
            if (Buffer.byteLength(text) > step.inputTokens)
              throw Error(
                "Increase the input estimate or narrow the selected files. The packet exceeds the conservative input allowance.",
              );
            return { state: current, prompt: text };
          },
          catch: (e) => new TaskLedgerError({ detail: String(e).slice(0, 500) }),
        }).pipe(Effect.result);
        if (packet._tag === "Failure") {
          yield* hold(j, packet.failure.detail);
          return;
        }
        state = packet.success.state;
        prompt = packet.success.prompt;
      }
      if (!receipt) {
        receipt = {
          id,
          thread: seat,
          pool,
          driver: provider!.driver,
          identified: !!(provider!.auth.email || provider!.usageLimits?.credentialFingerprint),
          provider: route.instanceId,
          model: route.model,
          phase: "reserved",
          day: input.asOf.slice(0, 10),
          spentBeforeTokens: Math.max(
            0,
            policy!.dailyTokens - row.remainingTokens! - row.input - row.output,
          ),
          spentBeforeUsd:
            policy!.dailyUsd !== null && row.remainingUsd !== null
              ? Math.max(0, policy!.dailyUsd - row.remainingUsd - (row.estimatedUsd ?? 0))
              : null,
          reservedTokens: row.input + row.output,
          reservedUsd: row.estimatedUsd,
          windowPercent: step.windowPercent,
          run: null,
          detail: "Capacity reserved",
          finished: null,
          tokens: null,
          pricedUsd: null,
        };
        const written = yield* updateReview(
          path,
          j,
          {
            review: receipt,
            ...(state ? { guarded: state } : {}),
            reviewHold: "",
            owner: seat,
            ownerTitle: shell!.title,
            model: route.model,
            stage: "assigned",
            delivery: "saved",
            generation: j.attempt.generation + 1,
            next: step.next,
          },
          receipt.detail,
          yield* time,
          {
            watermark,
            observedGuarded: input.guardedSpend?.get(j.project),
            checkedAt: row.checkedAt!,
            usageAt: input.reports.get(j.project)!.readAt,
            tokenLimit:
              policy!.dailyTokens *
              (row.priority === "urgent" ? 1 : 1 - policy!.reservePercent / 100),
            costLimit:
              policy!.dailyUsd === null
                ? null
                : policy!.dailyUsd *
                  (row.priority === "urgent" ? 1 : 1 - policy!.reservePercent / 100),
          },
        );
        if (typeof written === "string") {
          yield* hold(j, written);
          return;
        }
        // Reload the reservation before crossing into native orchestration.
        return;
      }
      const spendable = 1 - (row.priority === "urgent" ? 0 : policy!.reservePercent / 100);
      if (
        receipt.spentBeforeTokens + receipt.reservedTokens > policy!.dailyTokens * spendable ||
        (policy!.dailyUsd !== null &&
          (receipt.spentBeforeUsd ?? 0) + (receipt.reservedUsd ?? 0) > policy!.dailyUsd * spendable)
      ) {
        yield* hold(j, "The current daily limit no longer covers the reserved review.");
        return;
      }
      if (guard && state) {
        const running: ReviewReceipt = {
          ...receipt,
          phase: "running",
          role: state.role,
          detail: "Running protected " + state.role,
        };
        const claimed = yield* save(
          j,
          { review: running, stage: "working", reviewHold: "" },
          running.detail,
        );
        if (claimed !== true) return;
        const runningJob = { ...j, attempt: { ...j.attempt, revision: j.attempt.revision + 1 } };
        const response = yield* Effect.tryPromise({
          try: () => guardedTurn(prompt, route.model, step.estimatedUsd!, provider!.auth.email!),
          catch: (e) => new TaskLedgerError({ detail: String(e).slice(0, 500) }),
        }).pipe(Effect.result);
        const result = response._tag === "Success" ? response.success : null;
        const currentState = state;
        const outcome = yield* Effect.try({
          try: () => {
            if (response._tag === "Failure") throw response.failure;
            if (currentState.history.some((h) => h.run === response.success.session))
              throw Error("Independent roles require fresh provider sessions.");
            return applyGuardedAnswer(root!, j.task, currentState, response.success.answer, id);
          },
          catch: (e) => new TaskLedgerError({ detail: String(e).slice(0, 1000) }),
        }).pipe(Effect.result);
        const failed = outcome._tag === "Failure";
        const {
          state: next,
          approved,
          detail,
        } = outcome._tag === "Success"
          ? outcome.success
          : { state: { ...state, stopped: true }, approved: false, detail: outcome.failure.detail };
        const finished = yield* time;
        const settled: ReviewReceipt = {
          ...running,
          phase: failed ? "failed" : "completed",
          finished,
          detail: state.role + " · " + detail,
          run: result?.session ?? null,
          tokens: result?.tokens ?? null,
          pricedUsd: result?.usd ?? null,
        };
        yield* save(
          runningJob,
          {
            guarded: { ...next, approved, history: [...state.history, settled] },
            stage: "ready",
            owner: null,
            delivery: "none",
            checkpoint: detail,
            next: next.stopped ? detail : "Awaiting protected " + next.role,
            reviewHold: next.stopped ? detail : "",
          },
          settled.detail,
        );
        return;
      }
      const sent = yield* threads.sendToThread({
        projectId: j.project,
        threadId: seat,
        commandId: CommandId.make("it3-review-" + id),
        messageId,
        freshContext: true,
        reviewerOnly: true,
        modelSelection: { instanceId: route.instanceId, model: route.model },
        mode: "queue",
        createdBy: "system",
        creationSource: "server",
        attachments: [],
        outputSchema,
        text:
          "Review this project task. Inspect the evidence and report findings. Return a verdict (pass, changes_requested or blocked), summary, verification and the exact titles of completed subtasks as structured output.\n" +
          encodeJson({
            task: j.task.key,
            request: j.task.request,
            reference: j.task.reference,
            next: step.next,
            verification: step.verification,
            subtasks: j.attempt.steps.filter((s) => !s.done).map((s) => s.title),
          }),
      });
      yield* save(
        j,
        {
          review: { ...receipt, phase: "running", run: sent.run.id, detail: sent.delivery },
          reviewHold: "",
          stage: "working",
          delivery: "acknowledged",
        },
        "Delivered to reviewer · " + sent.run.id,
      );
    });
    yield* process.pipe(
      Effect.catch((error) => hold(j, "Reviewer dispatch: " + String(error).slice(0, 350))),
    );
    // A restricted inference can last minutes. Refresh the queue before admitting another job.
    if (j.task.queueStep?.guarded && j.attempt.review?.phase === "reserved") break;
  }
});
export const startReviewer = Effect.gen(function* () {
  const tick = reviewerTick({
    path: (yield* ServerConfig).stateDir,
    threads: yield* ThreadManagementService,
    engine: yield* OrchestratorV2,
    usage: yield* UsageService,
    readInputs: yield* makeQueueReader,
    commandReceipt: (yield* CommandReceiptStoreV2).getByCommandId,
  });
  yield* forkParked(
    tick.pipe(
      Effect.catchCause((cause) => Effect.logWarning("Reviewer queue unavailable", cause)),
      Effect.repeat(Schedule.spaced("15 seconds")),
    ),
  );
});
