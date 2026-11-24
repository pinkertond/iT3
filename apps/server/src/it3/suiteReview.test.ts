import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import WorkflowsMigration from "../persistence/Migrations/110_Workflows.ts";
import * as WorkflowEngine from "../workflows/WorkflowEngine.ts";
import * as WorkflowRuntime from "../workflows/WorkflowRuntime.ts";
import * as Workflows from "../workflows/Workflows.ts";
import { WorkflowAgents } from "../workflows/WorkflowAgents.ts";
import type { WorkflowDefinition } from "../workflows/workflow.ts";

it.effect(
  "runs the native suite gate, reopens its review after restart, and deduplicates a repeated delivery",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem,
        path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "it3-suite-review-" });
      const defs = path.join(home, "workflows");
      yield* fs.makeDirectory(defs);
      yield* fs.copyFile(
        path.resolve(
          import.meta.dirname,
          "../../../../it3/extensions/workflows/examples/suite-review.ts",
        ),
        path.join(defs, "suite-review.ts"),
      );
      const db = NodeSqliteClient.layer({ filename: path.join(home, "workflow.sqlite") });
      yield* Effect.provide(WorkflowsMigration, db);
      const runtime = Layer.effectContext(
        WorkflowRuntime.make(
          Effect.succeed((definitions: readonly WorkflowDefinition[]) =>
            WorkflowEngine.layer(definitions).pipe(
              Layer.provide(Layer.mock(WorkflowAgents)({})),
              Layer.provide(db),
              Layer.provide(NodeCrypto.layer),
            ),
          ),
          defs,
          Effect.succeed(true),
        ),
      );
      const report = {
        suite: "Project home",
        revision: "abc123",
        evidence: "ci/run-42",
        complete: true,
        cases: [{ name: "Hierarchy", outcome: "passed" }],
      };
      const red = {
        ...report,
        cases: ["A", "B", "C", "D"].map((name) => ({ name, outcome: "failed" })),
      };
      const runId = yield* Effect.gen(function* () {
        const svc = yield* Workflows.Workflows;
        const workflow = "it3-suite-review";
        const green = yield* svc.start(workflow, report, { idempotencyKey: "green" });
        assert.deepEqual(
          (yield* svc.waitFor(green.runId, (r) => r.status === "completed")).result,
          { outcome: "passed", passed: 1, skipped: 0, evidence: report.evidence },
        );
        for (const [key, input] of [
          ["empty", { ...report, cases: [] }],
          ["skipped", { ...report, cases: [{ name: "A", outcome: "skipped" }] }],
          ["partial", { ...report, complete: false }],
        ] as const) {
          const run = yield* svc.start(workflow, input, { idempotencyKey: key });
          yield* svc.waitFor(run.runId, (r) => r.status === "stopped");
        }
        const review = yield* svc.start(workflow, red, { idempotencyKey: "red" });
        yield* svc.waitFor(
          review.runId,
          (r) => r.status === "waiting" && r.detail === "review-failures",
        );
        return review.runId;
      }).pipe(Effect.provide(runtime), Effect.scoped);
      yield* Effect.gen(function* () {
        const svc = yield* Workflows.Workflows;
        assert.equal(
          (yield* svc.start("it3-suite-review", red, { idempotencyKey: "red" })).runId,
          runId,
        );
        yield* svc.answer(runId, "review-failures", { choice: "Prepare diagnosis brief" });
        const done = yield* svc.waitFor(runId, (r) => r.status === "completed");
        assert.deepInclude(done.result, {
          outcome: "diagnosis-requested",
          failures: 4,
          examples: ["A", "B", "C"],
        });
        assert.deepEqual(
          (yield* svc.get(runId)).steps.map((s) => s.name),
          ["summarize-results", "review-failures"],
        );
      }).pipe(Effect.provide(runtime), Effect.scoped);
    }).pipe(
      Effect.raceFirst(Effect.forever(TestClock.adjust("1 second"))),
      Effect.provide(NodeServices.layer),
      Effect.scoped,
    ),
);
