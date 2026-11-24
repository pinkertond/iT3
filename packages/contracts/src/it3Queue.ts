import * as Schema from "effect/Schema";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const Priority = Schema.Literals(["urgent", "normal", "background"]);
const Route = Schema.Struct({ instanceId: ProviderInstanceId, model: TrimmedNonEmptyString });
const Percent = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }));
const Money = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
export const QueuePolicy = Schema.Struct({
  reviewer: Schema.optionalKey(Schema.NullOr(ThreadId)),
  priority: Priority,
  dailyTokens: NonNegativeInt,
  dailyUsd: Schema.NullOr(Money),
  contextTokens: NonNegativeInt,
  reservePercent: Percent,
  economy: Schema.NullOr(Route),
  advanced: Schema.NullOr(Route),
});
export type QueuePolicy = typeof QueuePolicy.Type;

export const QueueStep = Schema.Struct({
  guarded: Schema.optionalKey(
    Schema.Struct({
      source: Schema.Array(TrimmedNonEmptyString).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(12),
      ),
      tests: Schema.Array(TrimmedNonEmptyString).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(12),
      ),
      rounds: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
    }),
  ),
  seat: Schema.optionalKey(Schema.Literal("reviewer")),
  priority: Schema.NullOr(Priority),
  route: Schema.Literals(["check", "economy", "advanced"]),
  next: TrimmedNonEmptyString.check(Schema.isMaxLength(600)),
  verification: TrimmedNonEmptyString.check(Schema.isMaxLength(600)),
  dependencies: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(160))).check(
    Schema.isMaxLength(12),
  ),
  inputTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  estimatedUsd: Schema.NullOr(Money),
  windowPercent: Percent,
});
export type QueueStep = typeof QueueStep.Type;
const Window = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  remaining: Percent,
  after: Schema.Number,
  reset: Schema.NullOr(Schema.String),
});
const Decision = Schema.Struct({
  reviewer: Schema.optionalKey(Schema.String),
  projectId: ProjectId,
  project: Schema.String,
  key: Schema.String,
  title: Schema.String,
  attempt: Schema.Number,
  priority: Priority,
  reason: Schema.Literals([
    "ready",
    "step",
    "dependency",
    "policy",
    "route",
    "background",
    "estimate",
    "context",
    "usage",
    "tokens",
    "cost",
    "allowance",
    "stale",
    "reserve",
  ]),
  next: Schema.String,
  verification: Schema.String,
  model: Schema.NullOr(Schema.String),
  provider: Schema.NullOr(Schema.String),
  input: NonNegativeInt,
  output: NonNegativeInt,
  estimatedUsd: Schema.NullOr(Money),
  remainingTokens: Schema.NullOr(Schema.Number),
  remainingUsd: Schema.NullOr(Schema.Number),
  windows: Schema.Array(Window),
  checkedAt: Schema.NullOr(Schema.String),
  detail: Schema.String,
});
export type QueueDecision = typeof Decision.Type;
export const SeatQueueFocus = Schema.Struct({
  projectId: ProjectId,
  key: TrimmedNonEmptyString,
  attempt: Schema.Literals([1, 2]),
});
export const QueuePreview = Schema.Struct({
  guardedSpend: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        projectId: ProjectId,
        tokens: NonNegativeInt,
        usd: Money,
        estimated: Schema.Boolean,
      }),
    ),
  ),
  attention: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        projectId: ProjectId,
        key: Schema.String,
        title: Schema.String,
        detail: Schema.String,
        since: Schema.String,
      }),
    ),
  ),
  attentionTotal: Schema.optionalKey(NonNegativeInt),
  asOf: Schema.String,
  day: Schema.String,
  eligible: NonNegativeInt,
  total: NonNegativeInt,
  rows: Schema.Array(Decision),
});
