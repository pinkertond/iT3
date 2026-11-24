import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  canvasSource,
  blankWorkflow,
  suiteReviewPair,
  extractSubflow,
  configurationProblem,
  type CanvasGraph,
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
        const blank = blankWorkflow("routing", "p");
        const routing: CanvasGraph = {
          nodes: [
            ...blank.revisions[0]!.nodes,
            {
              id: "route",
              kind: "branch",
              label: "Urgent?",
              field: "priority",
              literal: '"urgent"',
            },
            { id: "mark", kind: "set", label: "Assign queue", field: "queue", literal: '"fast"' },
            { id: "done", kind: "result", label: "Return request" },
          ],
          edges: [
            { from: "start", port: "next", to: "route" },
            { from: "route", port: "yes", to: "mark" },
            { from: "route", port: "no", to: "done" },
            { from: "mark", port: "next", to: "done" },
          ],
        };
        const generic = { ...blank, revisions: [routing] };
        assert.deepEqual(readCanvas(canvasSource(generic)), generic);
        assert.isNotNull(
          configurationProblem(
            {
              ...routing,
              nodes: routing.nodes.map((n) =>
                n.id === "mark" ? { ...n, literal: "invalid JSON" } : n,
              ),
            },
            2,
          ),
        );
        assert.isTrue((yield* files.save("routing.flow.ts", canvasSource(generic), null)).changed);
        for (const priority of ["urgent", "normal"]) {
          const launched = yield* engine.start(
            "routing",
            { priority },
            { idempotencyKey: priority },
          );
          const completed = yield* engine.waitFor(launched.runId, (r) => r.status !== "running");
          assert.equal(completed.status, "completed");
          assert.deepEqual(
            completed.result,
            priority === "urgent" ? { priority, queue: "fast" } : { priority },
          );
        }
        const { parent, child } = suiteReviewPair("suite-parent", "p");
        const childFile = child.name + ".flow.ts",
          parentFile = parent.name + ".flow.ts",
          childV1 = canvasSource(child);
        assert.deepEqual(readCanvas(childV1), child);
        assert.isFalse((yield* files.save(parentFile, canvasSource(parent), null)).changed);
        assert.isTrue((yield* files.save(childFile, childV1, null)).changed);
        assert.isTrue((yield* files.save(parentFile, canvasSource(parent), null)).changed);
        assert.isFalse((yield* files.remove(childFile)).changed);
        const childV2 = reviseCanvas(
          child,
          {
            ...child.revisions[0]!,
            nodes: child.revisions[0]!.nodes.map((n) =>
              n.id === "branch" ? { ...n, literal: "false" } : n,
            ),
          },
          child.layout,
        );
        assert.isTrue((yield* files.save(childFile, canvasSource(childV2), childV1)).changed);
        const rewritten = { ...childV2, revisions: [childV2.revisions[1]!, childV2.revisions[1]!] };
        assert.isFalse(
          (yield* files.save(childFile, canvasSource(rewritten), canvasSource(childV2))).changed,
        );
        const foreign = { ...parent, name: "foreign-parent", projectId: "other" };
        assert.isFalse(
          (yield* files.save("foreign-parent.flow.ts", canvasSource(foreign), null)).changed,
        );
        const cycle = {
          ...parent,
          name: "cycle",
          revisions: [
            {
              ...parent.revisions[0]!,
              nodes: parent.revisions[0]!.nodes.map((n) =>
                n.target ? { ...n, target: { workflow: "cycle", version: 1 } } : n,
              ),
            },
          ],
        };
        assert.isFalse((yield* files.save("cycle.flow.ts", canvasSource(cycle), null)).changed);
        const request = yield* engine.start(
          parent.name,
          { ...report, cases: [{ name: "green", outcome: "passed" }] },
          { idempotencyKey: "pinned" },
        );
        const end = yield* engine.waitFor(request.runId, (r) =>
          ["completed", "stopped", "paused"].includes(r.status),
        );
        assert.equal(end.status, "completed", JSON.stringify(end));
        assert.deepInclude(end.result, { outcome: "reported", passed: 1 });
        const receipt = (yield* engine.get(request.runId)).steps.find(
          (s) => s.name === "review-suite/start",
        )!;
        assert.equal((yield* engine.get(String(receipt.result))).run.version, 1);
        const nested = extractSubflow(routing, ["mark"], "rush-queue", "p");
        assert.isTrue("child" in nested);
        if ("child" in nested) {
          assert.isNull(graphProblem(nested.parent));
          assert.isNull(graphProblem(nested.child.revisions[0]!));
        }
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
