import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { Project } from "~/types";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { TaskBoard } from "./TaskBoard";
const query = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn(async () => ({ _tag: "Success" })));
vi.mock("~/state/query", () => ({ useEnvironmentQuery: query }));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("~/state/server", () => ({
  serverEnvironment: { it3Tasks: (q: unknown) => q, it3WriteTask: {} },
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => mutate }));
vi.mock("~/components/files/projectFilesQueryState", () => ({ useProjectFileQuery: () => ({}) }));
vi.mock("./ProjectUsage", () => ({ BranchUsage: () => null }));
const p = {
  id: ProjectId.make("p"),
  environmentId: EnvironmentId.make("e"),
  workspaceRoot: "/p",
} as Project;
const threads = [{ id: ThreadId.make("new"), title: "Successor" }] as EnvironmentThreadShell[];
it("creates a task from the operator's request with two independent attempts", async () => {
  query.mockReturnValue({
    data: { tasks: [], brief: null, events: [], contributors: [], more: false },
    refresh: vi.fn(),
  });
  const selected = vi.fn();
  await using screen = await render(
    <TaskBoard project={p} threads={threads} onSelect={selected} />,
  );
  await screen.getByRole("button", { name: "New task" }).click();
  await screen.getByLabelText("Title", { exact: true }).fill("Test task");
  await screen.getByLabelText("Task ID").fill("T-1");
  await screen.getByLabelText("Original request").fill("Build two alternatives");
  await screen.getByLabelText("Subtasks, one per line").fill("Implement\nVerify");
  await screen.getByRole("checkbox").click();
  await screen.getByRole("button", { name: "Create task" }).click();
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        edit: expect.objectContaining({
          key: "T-1",
          change: expect.objectContaining({
            comparison: true,
            steps: [
              { title: "Implement", done: false },
              { title: "Verify", done: false },
            ],
          }),
        }),
      }),
    }),
  );
  expect(selected).toHaveBeenCalledWith("T-1");
});
it("shows the checkpoint above details and hands off using the displayed generation", async () => {
  const a = {
    number: 1,
    generation: 4,
    revision: 6,
    stage: "working",
    owner: "old",
    ownerTitle: "Claude",
    hasClaimed: true,
    delivery: "acknowledged",
    files: ["one.ts"],
    steps: [{ title: "Write one", done: true }],
    checkpoint: "File one verified",
    next: "Write two",
    verification: "Read one",
  };
  query.mockReturnValue({
    data: {
      tasks: [],
      brief: {
        key: "T",
        title: "Two files",
        request: "Build both",
        reference: "",
        accepted: null,
        comparison: false,
        attempts: [a],
      },
      events: [],
      contributors: [],
      more: false,
    },
    refresh: vi.fn(),
  });
  await using screen = await render(
    <TaskBoard project={p} threads={threads} selected="T" onSelect={() => {}} />,
  );
  await expect.element(screen.getByText("File one verified")).toBeVisible();
  await screen.getByText("Assign or hand off").click();
  await screen.getByRole("combobox", { name: /Receiving chat/ }).selectOptions("new");
  await screen.getByLabelText("Next action for the recipient").fill("Verify one, then write two");
  await screen.getByRole("button", { name: "Assign and notify" }).click();
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        edit: expect.objectContaining({
          attempt: 1,
          generation: 4,
          revision: 6,
          change: { action: "handoff", target: "new", next: "Verify one, then write two" },
        }),
      }),
    }),
  );
});
