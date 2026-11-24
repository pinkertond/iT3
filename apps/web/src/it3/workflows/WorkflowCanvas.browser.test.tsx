import { expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { render } from "../../../test/render";
import { EnvironmentId } from "@t3tools/contracts";
import { readCanvas } from "@t3tools/shared/it3WorkflowGraph";
import WorkflowCanvas from "./WorkflowCanvas";
import WorkflowDefinitionEditor from "~/components/workflows/WorkflowDefinitionEditor";
vi.mock("~/components/workflows/WorkflowRunsView", () => ({ WorkflowsEmpty: () => null }));
vi.mock("~/components/DiffWorkerPoolProvider", () => ({ DiffWorkerPoolProvider: () => null }));
vi.mock("~/state/entities", async (original) => ({
  ...(await original<object>()),
  useServerConfigs: () =>
    new Map([["local", { environment: { capabilities: { it3WorkflowCanvas: true } } }]]),
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
function Fixture() {
  const [source, set] = useState<string | null>(null);
  captures.save.mockImplementation(async ({ input }) => {
    set(input.source);
    return { _tag: "Success", value: { changed: true, problems: [] } };
  });
  captures.start.mockResolvedValue({ _tag: "Success", value: { runId: "R" } });
  return (
    <div style={{ height: 600, width: 1000, display: "flex" }}>
      <WorkflowCanvas
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
  expect(screen.container.innerText).toContain("Selected node");
  await screen.getByLabelText("Selected node").selectOptions("review");
  await screen.getByLabelText("Node label").fill("Triage test failures?");
  await screen.getByLabelText("Yes", { exact: true }).selectOptions("");
  await expect.element(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  await screen.getByLabelText("Yes", { exact: true }).selectOptions("brief");
  await screen.getByRole("button", { name: "Publish" }).click();
  const input = captures.save.mock.calls[0]![0].input;
  expect(input.expectedSource).toBeNull();
  expect(readCanvas(input.source)?.revisions[0]?.nodes.find((n) => n.id === "review")?.label).toBe(
    "Triage test failures?",
  );
  await screen.getByRole("button", { name: "Run workflow" }).click();
  await screen.getByRole("button", { name: "Start run" }).click();
  await screen.getByLabelText("Selected node").selectOptions("start");
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
  await expect.element(screen.getByLabelText("Selected node")).toBeVisible();
});
