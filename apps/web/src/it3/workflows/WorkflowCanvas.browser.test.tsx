import { Position } from "@xyflow/react";
import { workflowConnector } from "./WorkflowEdge";
import { expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { render } from "../../../test/render";
import { traceRun } from "./runOverlay";
import { EnvironmentId, type WorkflowStep } from "@t3tools/contracts";
import {
  suiteReviewPair,
  reviseCanvas,
  readCanvas,
  blankWorkflow,
  canvasSource,
  type CanvasGraph,
} from "@t3tools/shared/it3WorkflowGraph";
import WorkflowCanvas from "./WorkflowCanvas";
import WorkflowDefinitionEditor from "~/components/workflows/WorkflowDefinitionEditor";
vi.mock("~/components/workflows/WorkflowRunsView", () => ({ WorkflowsEmpty: () => null }));
vi.mock("~/components/DiffWorkerPoolProvider", () => ({ DiffWorkerPoolProvider: () => null }));
vi.mock("~/state/entities", async (original) => ({
  ...(await original<object>()),
  useServerConfigs: () =>
    new Map([
      [
        "local",
        {
          environment: { capabilities: { it3WorkflowCanvas: true, it3ComposableWorkflows: true } },
        },
      ],
    ]),
  useProjects: () => [{ id: "proj", environmentId: "local", title: "Project sample" }],
}));
const captures = vi.hoisted(() => ({ save: vi.fn(), start: vi.fn() }));
vi.mock("~/state/server", async (original) => {
  const actual = await original<typeof import("~/state/server")>();
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      workflowDefinition: () => ({ tag: "defs" }),
      deleteWorkflowDefinition: "delete",
      workflowsLive: () => ({ tag: "list" }),
      workflowRun: () => ({ tag: "run" }),
      saveWorkflowDefinition: { permissionAtom: () => allowed },
      it3StartWorkflow: "start",
    },
  };
});
vi.mock("~/state/use-atom-command", async (original) => ({
  ...(await original<object>()),
  useAtomCommand: (cmd: unknown) => (cmd === "start" ? captures.start : captures.save),
}));
vi.mock("~/state/query", async (original) => ({
  ...(await original<object>()),
  useEnvironmentQuery: (q: { tag: string } | null) => ({
    data:
      q?.tag === "defs"
        ? { directory: "/workflows", single: false, files: [], problems: [], revision: 1 }
        : q?.tag === "run"
          ? {
              run: { runId: "R", version: 1, status: "waiting" },
              steps: [
                {
                  name: "start",
                  result: { failed: 1, evidence: "ci/unit/42" },
                  status: "completed",
                },
              ],
            }
          : q
            ? { runs: [] }
            : null,
    error: null,
  }),
}));
function Fixture({
  initialSource = null,
  files = [],
  registered = false,
}: {
  initialSource?: string | null;
  registered?: boolean;
  files?: readonly { name: string; source: string }[];
} = {}) {
  const [source, set] = useState<string | null>(initialSource);
  captures.save.mockImplementation(async ({ input }) => {
    if (input.name === "suite.flow.ts") set(input.source);
    return { _tag: "Success", value: { changed: true, problems: [] } };
  });
  captures.start.mockResolvedValue({ _tag: "Success", value: { runId: "R" } });
  return (
    <div style={{ height: 600, width: 1000, display: "flex" }}>
      <WorkflowCanvas
        registered={registered}
        definitionFiles={files}
        composable
        env={EnvironmentId.make("local")}
        file="suite.flow.ts"
        source={source}
        projectId="proj"
        writable
        offline={false}
        onSource={() => {}}
        onDeleted={() => {}}
      />
    </div>
  );
}
it("edits node labels and wiring, publishes the graph, runs it and opens recorded node evidence", async () => {
  await using screen = await render(<Fixture />, { router: "/workflows" });
  await screen.getByRole("button", { name: "Use suite template" }).click();
  await screen.getByLabelText("All steps", { exact: true }).click();
  await screen.getByRole("button", { name: "Prepare a diagnosis brief?", exact: true }).click();
  await screen.getByRole("button", { name: "Edit step" }).click();
  await screen.getByLabelText("Node label").fill("Triage test failures?");
  await screen.getByRole("button", { name: "Change Yes destination" }).click();
  await screen.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  await screen.getByRole("button", { name: "Change Yes destination" }).click();
  await screen
    .getByRole("group", { name: "Choose destination" })
    .getByRole("button", { name: "Diagnosis brief", exact: true })
    .click();
  await screen.getByRole("button", { name: "Publish" }).click();
  const input = captures.save.mock.calls[0]![0].input;
  expect(input.expectedSource).toBeNull();
  expect(readCanvas(input.source)?.revisions[0]?.nodes.find((n) => n.id === "review")?.label).toBe(
    "Triage test failures?",
  );
  await screen.getByRole("button", { name: "Run workflow" }).click();
  await screen.getByRole("button", { name: "Start run" }).click();
  await screen.getByLabelText("All steps", { exact: true }).click();
  await screen.getByRole("button", { name: "Suite report", exact: true }).click();
  await expect.element(screen.getByText(/"evidence": "ci\/unit\/42"/)).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Open native run" }))
    .toHaveAttribute("href", expect.stringContaining("run=R"));
});

function DefinitionsFixture() {
  const [file, setFile] = useState<string | null>(null);
  const [visual, setVisual] = useState(false);
  return (
    <WorkflowDefinitionEditor
      environmentId={EnvironmentId.make("local")}
      file={file}
      away={null}
      projectId="proj"
      visual={visual}
      actions={null}
      onOpen={(next, canvas) => {
        setFile(next);
        setVisual(canvas === true);
      }}
    />
  );
}
it("opens the editor from a project's native Definitions list", async () => {
  await using screen = await render(<DefinitionsFixture />, { router: "/workflows" });
  await screen.getByRole("button", { name: "New visual workflow" }).click();
  await screen.getByRole("textbox", { name: "File name" }).fill("build-review");
  await screen.getByRole("button", { name: "Create", exact: true }).click();
  await expect.element(screen.getByRole("heading", { name: "build-review" })).toBeVisible();
  await expect.element(screen.getByLabelText("All steps", { exact: true })).toBeVisible();
});

it("builds from a single input, configures reusable steps and publishes a connected workflow", async () => {
  captures.save.mockClear();
  await using screen = await render(<Fixture />, { router: "/workflows" });
  await expect.element(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  await screen
    .getByRole("button", { name: "Add step after Workflow input (next)", exact: true })
    .click();
  await screen.getByRole("button", { name: "Set field", exact: true }).click();
  await screen.getByRole("button", { name: "Edit step" }).click();
  await screen.getByLabelText("Field name").fill("queue");
  await screen.getByRole("radio", { name: "Boolean", exact: true }).click();
  await screen.getByRole("radio", { name: "false", exact: true }).click();
  await expect.element(screen.getByRole("radio", { name: "false", exact: true })).toBeChecked();
  await screen.getByRole("radio", { name: "Text", exact: true }).click();
  await screen.getByRole("textbox", { name: "Value", exact: true }).fill("priority");
  await screen.getByRole("button", { name: "Add step", exact: true }).click();
  await screen.getByRole("button", { name: "Output", exact: true }).click();
  await screen.getByRole("button", { name: "Arrange" }).click();
  await screen.getByRole("button", { name: "Publish" }).click();
  const saved = readCanvas(captures.save.mock.calls[0]![0].input.source)!;
  expect(saved.format).toBe(2);
  expect(saved.revisions[0]!.nodes.map((n) => n.kind)).toEqual(["start", "set", "result"]);
  expect(saved.revisions[0]!.nodes[1]).toMatchObject({ field: "queue", literal: '"priority"' });
  expect(saved.revisions[0]!.edges).toHaveLength(2);
  await screen.getByRole("button", { name: "Run workflow" }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "Workflow input (JSON object)" }))
    .toBeVisible();
});

it("reuses a published project step with its settings and source revision", async () => {
  captures.save.mockClear();
  const sample = (projectId: string, name: string, label: string) => {
    const d = blankWorkflow(name, projectId);
    const graph: CanvasGraph = {
      nodes: [...d.revisions[0]!.nodes, { id: "done", kind: "result", label }],
      edges: [{ from: "start", port: "next", to: "done" }],
    };
    return { name: name + ".flow.ts", source: canvasSource({ ...d, revisions: [graph] }) };
  };
  await using screen = await render(
    <Fixture
      files={[
        sample("proj", "shipping", "Return receipt"),
        sample("other", "private", "Private result"),
      ]}
    />,
    { router: "/workflows" },
  );
  await screen.getByRole("button", { name: "Add step", exact: true }).click();
  await screen.getByRole("button", { name: "Project steps" }).click();
  await expect.element(screen.getByText("Private result")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: /Return receipt/ }).click();
  await screen.getByRole("button", { name: "Publish" }).click();
  const node = readCanvas(captures.save.mock.calls[0]![0].input.source)?.revisions[0]?.nodes[1];
  expect(node?.copiedFrom).toEqual({ workflow: "shipping", version: 1, node: "done" });
  expect(node?.id).not.toBe("done");
});

// Read the rendered SVG geometry through the browser, including its actual cubic tangent.
it("joins the centre of the arrow's rear edge on rising, falling and backward paths", () => {
  const svgPath = (d: string) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", d);
    return el;
  };
  for (const [sx, sy] of [
    [0, 0],
    [0, 200],
    [130, 100],
    [110, 200],
  ] as const) {
    const { path, join, head } = workflowConnector(sx, sy, 100, 100, Position.Right, Position.Left);
    const shaft = svgPath(path),
      tail = svgPath(join),
      triangle = svgPath(head);
    const end = shaft.getPointAtLength(shaft.getTotalLength());
    const before = shaft.getPointAtLength(shaft.getTotalLength() - 0.05);
    const base = tail.getPointAtLength(tail.getTotalLength());
    expect(end.x).toBeCloseTo(tail.getPointAtLength(0).x);
    expect(end.y).toBeCloseTo(tail.getPointAtLength(0).y);
    expect(before.x).toBeLessThan(end.x);
    expect(before.y).toBeCloseTo(end.y, 2);
    const tip = triangle.getPointAtLength(0);
    expect([tip.x, tip.y]).toEqual([100, 100]);
    const wing = triangle.getPointAtLength(Math.hypot(10, 4.5));
    const otherWing = triangle.getPointAtLength(Math.hypot(10, 4.5) + 9);
    expect(base.x).toBeCloseTo((wing.x + otherWing.x) / 2);
    expect(base.y).toBeCloseTo((wing.y + otherWing.y) / 2);
  }
});

it("opens the suite review child and publishes its pinned parent", async () => {
  captures.save.mockClear();
  await using screen = await render(<Fixture registered />, { router: "/workflows" });
  await screen.getByRole("button", { name: "Use suite template" }).click();
  await screen.getByRole("button", { name: "Review test report", exact: true }).click();
  await screen.getByRole("button", { name: "Inspect pinned subflow" }).click();
  await expect.element(screen.getByRole("heading", { name: "suite-suite-review" })).toBeVisible();
  await screen.getByRole("button", { name: "Back to parent" }).click();
  await screen.getByRole("button", { name: "Publish", exact: true }).click();
  const calls = captures.save.mock.calls.map((c) => c[0].input);
  expect(calls.map((c) => c.name)).toEqual(["suite-suite-review.flow.ts", "suite.flow.ts"]);
  expect(
    readCanvas(calls[1]!.source)?.revisions[0]!.nodes.find((n) => n.kind === "subflow")?.target,
  ).toEqual({ workflow: "suite-suite-review", version: 1 });
});

it("extracts a connected selection and publishes a reusable child", async () => {
  captures.save.mockClear();
  await using screen = await render(<Fixture registered />, { router: "/workflows" });
  for (const label of ["Set field", "Output"]) {
    await screen.getByRole("button", { name: "Add step", exact: true }).click();
    await screen.getByRole("button", { name: label, exact: true }).click();
  }
  await screen.getByRole("button", { name: "Extract subflow", exact: true }).click();
  await screen.getByRole("textbox", { name: "New workflow name" }).fill("priority");
  await screen.getByRole("checkbox", { name: "Set field" }).click();
  await screen.getByRole("button", { name: "Group selected steps" }).click();
  await screen.getByRole("button", { name: "Publish", exact: true }).click();
  const saved = captures.save.mock.calls.map(([call]) => readCanvas(call.input.source)!);
  expect(saved.map((d) => d.name)).toEqual(["priority", "suite"]);
  expect(saved[0]!.revisions[0]!.nodes.map((n) => n.kind)).toContain("set");
  expect(saved[1]!.revisions[0]!.nodes.find((n) => n.kind === "subflow")?.target).toEqual({
    workflow: "priority",
    version: 1,
  });
});

it("adopts an available child revision only in the new parent revision", async () => {
  captures.save.mockClear();
  const { parent, child } = suiteReviewPair("suite", "proj");
  const graph = child.revisions[0]!;
  const updated = reviseCanvas(
    child,
    {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "read" ? { ...n, label: "Count outcomes" } : n)),
    },
    child.layout,
  );
  await using screen = await render(
    <Fixture
      registered
      initialSource={canvasSource(parent)}
      files={[{ name: child.name + ".flow.ts", source: canvasSource(updated) }]}
    />,
    { router: "/workflows" },
  );
  await screen.getByRole("button", { name: "Review test report", exact: true }).click();
  await screen.getByRole("button", { name: "Adopt version 2" }).click();
  await screen.getByRole("button", { name: "Publish", exact: true }).click();
  const result = readCanvas(captures.save.mock.calls[0]![0].input.source)!;
  expect(
    result.revisions.map((g) => g.nodes.find((n) => n.kind === "subflow")?.target?.version),
  ).toEqual([1, 2]);
});

it("attributes a converging connection to the recorded decision and stops at a pending question", () => {
  const graph: CanvasGraph = {
    nodes: [
      { id: "start", kind: "start", label: "Input" },
      { id: "ask", kind: "review", label: "Proceed?" },
      { id: "done", kind: "result", label: "Done" },
    ],
    edges: [
      { from: "start", port: "next", to: "ask" },
      { from: "ask", port: "yes", to: "done" },
      { from: "ask", port: "no", to: "done" },
    ],
  };
  function step(
    name: string,
    status: WorkflowStep["status"] = "completed",
    result: WorkflowStep["result"] = null,
  ): WorkflowStep {
    return {
      name,
      kind: name === "ask" ? "ask" : "step",
      status,
      result,
      attempts: 1,
      detail: null,
      threadId: null,
      environmentId: null,
      said: null,
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: null,
    };
  }
  const waiting = traceRun(graph, { steps: [step("start"), step("ask", "running")] });
  expect([...waiting.edges]).toEqual(["start/next"]);
  expect(waiting.active).toBe("ask");
  for (const [choice, port] of [
    ["Yes", "yes"],
    ["No", "no"],
  ]) {
    const ended = traceRun(graph, {
      steps: [step("start"), step("ask", "completed", { choice: choice! }), step("done")],
    });
    expect([...ended.edges]).toEqual(["start/next", "ask/" + port]);
  }
});
