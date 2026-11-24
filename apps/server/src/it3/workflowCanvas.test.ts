import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  canvasSource,
  graphProblem,
  readCanvas,
  reviseCanvas,
  suiteTemplate,
} from "@t3tools/shared/it3WorkflowGraph";
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

it("validates graph topology, protects custom source, and keeps layout changes out of execution versions", () => {
  const doc = suiteTemplate("suite", "p"),
    graph = doc.revisions[0]!;
  assert.deepEqual(readCanvas(canvasSource(doc)), doc);
  assert.isNull(readCanvas(canvasSource(doc) + "\n// manual edit"));
  assert.lengthOf(reviseCanvas(doc, graph, { start: { x: 100, y: 60 } }).revisions, 1);
  const mutate = (from: string, to: string) =>
    graph.edges.map((e) => (e.from === from ? { ...e, to } : e));
  assert.match(graphProblem({ ...graph, edges: mutate("check", "check") })!, /circular/);
  assert.match(graphProblem({ ...graph, edges: mutate("check", "missing") })!, /target/);
  assert.match(graphProblem({ ...graph, edges: graph.edges.slice(1) })!, /Connect/);
  assert.match(
    graphProblem({ ...graph, edges: [...graph.edges, graph.edges[0]!] })!,
    /one destination/,
  );
  assert.match(graphProblem({ ...graph, edges: mutate("check", "finish") })!, /unused/);
});

it.effect(
  "publishes visual revisions, rejects stale editors, and resumes the original human branch after restart",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem,
        path = yield* Path.Path,
        dir = yield* fs.makeTempDirectoryScoped({ prefix: "it3-canvas-" });
      const defs = path.join(dir, "workflows");
      yield* fs.makeDirectory(defs);
      const db = NodeSqliteClient.layer({ filename: path.join(dir, "runs.sqlite") });
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
      const doc = suiteTemplate("verify-build", "p"),
        graph = doc.revisions[0]!,
        file = "verify-build.flow.ts",
        v1 = canvasSource(doc);
      const second = reviseCanvas(
        doc,
        {
          ...graph,
          nodes: graph.nodes.map((n) =>
            n.id === "brief" ? { ...n, label: "Updated diagnosis" } : n,
          ),
        },
        doc.layout,
      );
      const v2 = canvasSource(second);
      const report = {
        suite: "Build",
        revision: "abc",
        evidence: "ci/42",
        complete: true,
        cases: [{ name: "Preserve budget", outcome: "failed" }],
      };
      const active = yield* Effect.gen(function* () {
        const files = yield* WorkflowRuntime.WorkflowDefinitions,
          engine = yield* Workflows.Workflows;
        assert.deepEqual(yield* files.save(file, v1, null), { changed: true, problems: [] });
        assert.isFalse((yield* files.save(file, v1, null)).changed);
        const run = yield* engine.start(doc.name, report, { idempotencyKey: "red", version: 1 });
        const observed = yield* engine.waitFor(run.runId, (r) => r.status !== "running");
        assert.equal(observed.status, "waiting", JSON.stringify(observed));
        const changes = yield* Effect.all([files.save(file, v2, v1), files.save(file, v2, v1)], {
          concurrency: "unbounded",
        });
        assert.lengthOf(
          changes.filter((r) => r.changed),
          1,
        );
        return run.runId;
      }).pipe(Effect.provide(runtime), Effect.scoped);
      yield* Effect.gen(function* () {
        const engine = yield* Workflows.Workflows;
        yield* engine.answer(active, "review", { choice: "Yes" });
        const done = yield* engine.waitFor(
          active,
          (r) => r.status === "completed" || r.status === "paused" || r.status === "stopped",
        );
        assert.equal(done.status, "completed", JSON.stringify(done));
        assert.equal(done.version, 1);
        assert.deepInclude(done.result, {
          result: "Diagnosis brief",
          outcome: "diagnosis-requested",
          examples: ["Preserve budget"],
          projectId: "p",
        });
        const green = yield* engine.start(
          doc.name,
          { ...report, cases: [{ name: "Budget", outcome: "passed" }] },
          { idempotencyKey: "green", version: 2 },
        );
        const passed = yield* engine.waitFor(green.runId, (r) => r.status !== "running");
        assert.equal(passed.status, "completed", JSON.stringify(passed));
        assert.deepEqual(
          (yield* engine.get(green.runId)).steps.map((s) => s.name),
          ["start", "check", "branch", "finish"],
        );
        const incomplete = yield* engine.start(
          doc.name,
          { ...report, complete: false },
          { idempotencyKey: "incomplete" },
        );
        assert.equal(
          (yield* engine.waitFor(incomplete.runId, (r) => r.status === "stopped")).detail,
          "Incomplete suite report",
        );
        const empty = yield* engine.start(
          doc.name,
          { ...report, cases: [] },
          { idempotencyKey: "empty" },
        );
        assert.equal(
          (yield* engine.waitFor(empty.runId, (r) => r.status === "stopped")).detail,
          "No tests executed",
        );
      }).pipe(Effect.provide(runtime), Effect.scoped);
    }).pipe(
      Effect.raceFirst(Effect.forever(TestClock.adjust("1 second"))),
      Effect.provide(NodeServices.layer),
      Effect.scoped,
    ),
);
