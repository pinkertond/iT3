import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WorkspacesPage } from "./WorkspacesPage";
import { useWorkspaceView } from "./view";

const write = vi.hoisted(() => vi.fn(async () => ({ _tag: "Success" })));
const env = "local";
vi.mock("~/state/entities", async (original) => ({
  ...(await original<object>()),
  useProjects: () => [
    { environmentId: "local", id: "one", title: "Atlas", workspaceRoot: "/atlas" },
    { environmentId: "local", id: "two", title: "Dormant", workspaceRoot: "/dormant" },
  ],
  useServerConfigs: () =>
    new Map([
      [
        "local",
        {
          settings: {
            it3Workspaces: { projects: { one: { workspace: "Work" }, two: { status: "paused" } } },
          },
          environment: { capabilities: { it3Workspaces: true, it3AgentView: true } },
        },
      ],
    ]),
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useThreadShellsForProjectRefs: () => [
    { id: "chat1", environmentId: "local", title: "First conversation" },
    { id: "chat2", environmentId: "local", title: "Second conversation" },
  ],
}));
vi.mock("~/state/session", async (original) => ({
  ...(await original<object>()),
  useEnvironmentScope: () => true,
}));
vi.mock("~/state/environments", async (original) => ({
  ...(await original<object>()),
  useEnvironmentIdentities: () => [{ environmentId: "local", label: "Mac" }],
  usePrimaryEnvironmentId: () => "local",
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => write }));

vi.mock("~/hooks/useProjectGroupUpdate", () => ({
  useProjectGroupUpdate: () => ({ updateProjectGroup: write, canOrganizeProjectGroup: () => true }),
}));
vi.mock("~/hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("~/components/files/projectFilesQueryState", async (original) => ({
  ...(await original<object>()),
  useProjectFileQuery: () => ({ data: null, error: null, isPending: false }),
  useProjectEntriesQuery: () => ({ data: { entries: [{ path: "README.md", kind: "file" }] } }),
}));
vi.mock("~/state/queries", async (original) => ({
  ...(await original<object>()),
  useProjectContentSearch: () => ({ matches: [] }),
}));
vi.mock("~/components/ChatMarkdown", () => ({ default: () => null }));
it("opens active projects by default, finds paused projects and opens a project home with its chats", async () => {
  useWorkspaceView.getState().select("");
  await using screen = await render(<WorkspacesPage />, { router: "/workspaces" });
  await expect.element(screen.getByRole("link", { name: /Atlas/ })).toBeVisible();
  await expect.element(screen.getByRole("link", { name: /Dormant/ })).not.toBeInTheDocument();
  await screen.getByLabelText("Project status").selectOptions("paused");
  await expect.element(screen.getByRole("link", { name: /Dormant/ })).toBeVisible();
  await screen.getByRole("link", { name: /Dormant/ }).click();
  await expect.element(screen.getByRole("heading", { name: "Project agents" })).toBeVisible();
  await screen.getByLabelText("Manager chat").selectOptions("chat1");
  expect(write).toHaveBeenCalledWith({
    environmentId: env,
    input: { patch: { it3Workspaces: { projects: { two: { managerThreadId: "chat1" } } } } },
  });
  await screen.getByRole("button", { name: "Documentation" }).click();
  await expect.element(screen.getByRole("heading", { name: "Project home" })).toBeVisible();
  await screen.getByLabelText("Project status").selectOptions("active");
  expect(write).toHaveBeenCalledWith({
    environmentId: env,
    input: { patch: { it3Workspaces: { projects: { two: { status: "active" } } } } },
  });
  await screen.getByText("Chats", { exact: false }).first().click();
  await expect.element(screen.getByRole("link", { name: /First conversation/ })).toBeVisible();
});

it("creates a named workspace on the selected host", async () => {
  useWorkspaceView.getState().select("");
  await using screen = await render(<WorkspacesPage />, { router: "/workspaces" });
  await screen.getByRole("button", { name: "New workspace" }).click();
  await screen.getByLabelText("Workspace name").fill("Studio");
  await screen.getByRole("button", { name: "Create", exact: true }).click();
  expect(write).toHaveBeenCalledWith({
    environmentId: env,
    input: { patch: { it3Workspaces: { names: { "w-studio": "Studio" } } } },
  });
  expect(useWorkspaceView.getState().workspace).toBe("w-studio");
  useWorkspaceView.getState().select("");
});

vi.mock("~/components/settings/useSettingsProjectGroups", () => ({
  useSettingsProjectGroups: () => [
    {
      projectKey: "group-two",
      memberProjects: [{ environmentId: "local", id: "two", physicalProjectKey: "p-two" }],
    },
  ],
}));
