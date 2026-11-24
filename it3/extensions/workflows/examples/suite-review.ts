// Manual T3 workflow. Input is a normalized report from one completed suite.
const { workflow, title, step, ask, stop } = T3;
const label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160));
const report = Schema.Struct({
  suite: label,
  revision: label,
  evidence: label,
  complete: Schema.Boolean,
  cases: Schema.Array(
    Schema.Struct({
      name: label,
      outcome: Schema.Literals(["passed", "failed", "skipped"]),
    }),
  ).check(Schema.isMaxLength(10000)),
});

workflow(
  "it3-suite-review",
  { version: 1, payload: report },
  Effect.fn(function* (input) {
    yield* title(input.suite + " · " + input.revision);
    const counts = yield* step(
      "summarize-results",
      {
        returns: Schema.Struct({
          passed: Schema.Number,
          failed: Schema.Number,
          skipped: Schema.Number,
          examples: Schema.Array(Schema.String),
        }),
      },
      Effect.sync(() => {
        const result = { passed: 0, failed: 0, skipped: 0, examples: [] as string[] };
        for (const test of input.cases) {
          result[test.outcome]++;
          if (test.outcome === "failed" && result.examples.length < 3)
            result.examples.push(test.name);
        }
        return result;
      }),
    );
    if (!input.complete)
      return yield* stop("Incomplete suite report. Collect the complete result.");
    if (!counts.failed) {
      if (!counts.passed)
        return yield* stop("No tests executed. Check discovery and skipped cases.");
      return {
        outcome: "passed",
        passed: counts.passed,
        skipped: counts.skipped,
        evidence: input.evidence,
      };
    }
    const answer = yield* ask("review-failures", {
      title: counts.failed + " failing tests in " + input.suite,
      choices: ["Prepare diagnosis brief", "Close review"],
      data: { revision: input.revision, evidence: input.evidence, ...counts },
    });
    if (Option.isNone(answer) || answer.value.choice !== "Prepare diagnosis brief") {
      return yield* stop("Review closed.");
    }
    return {
      outcome: "diagnosis-requested",
      suite: input.suite,
      revision: input.revision,
      evidence: input.evidence,
      failures: counts.failed,
      examples: counts.examples,
      verification:
        "Rerun the failing cases, then the complete suite against the candidate revision.",
    };
  }),
);
