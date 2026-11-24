import { expect, it, vi } from "vite-plus/test";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { render } from "../../../test/render";
import type { Project } from "~/types";
import { ProjectIntents } from "./ProjectIntents";
import { ProjectRoster } from "./ProjectRoster";

const save = vi.hoisted(() => vi.fn(async () => ({ _tag: "Success" })));
vi.mock("~/state/entities", async (original) => ({
  ...(await original<object>()),
  useServerConfigs: () =>
    new Map([
      [
        "local",
        {
          settings: { it3Workspaces: { projects: { atlas: { seats: { architect: "arch-a" } } } } },
          environment: { capabilities: { it3Tasks: true } },
        },
      ],
    ]),
}));
vi.mock("~/state/session", async (original) => ({
  ...(await original<object>()),
  useEnvironmentScope: () => true,
}));
vi.mock("~/state/query", async (original) => ({
  ...(await original<object>()),
  useEnvironmentQuery: () => ({
    data: {
      roster: {
        seats: [{ seat: "architect", active: 1, first: "design-nav", decisions: 0, running: 1 }],
        assignments: [
          {
            seat: "architect",
            key: "design-nav",
            title: "Design project navigation",
            attempt: 1,
            stage: "working",
            owner: "arch-a",
            expected: "Compare navigation concepts",
            next: "Sketch the drill-down",
            hold: "",
            decision: false,
            accepted: false,
            updated: "2026-11-24T16:00:00Z",
          },
        ],
      },
      more: false,
    },
    refresh: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => save }));

const project = {
  id: "atlas",
  title: "Atlas",
  environmentId: "local",
  workspaceRoot: "/atlas",
} as Project;
const thread = (id: string, title: string) =>
  ({
    id,
    title,
    environmentId: "local",
    projectId: "atlas",
    interactionMode: "plan",
    runtimeMode: "approval-required",
    archivedAt: null,
    deletedAt: null,
  }) as EnvironmentThreadShell;

it("opens Architect purpose, current occupant, assignment, and outgoing route from the team roster", async () => {
  await using screen = await render(
    <ProjectRoster
      project={project}
      threads={[thread("arch-a", "Alternative designer"), thread("arch-b", "Incoming designer")]}
    />,
    { router: "/workspaces" },
  );
  const roster = screen.getByRole("region", { name: "Project team roster" });
  await expect.element(roster.getByText("Vacant", { exact: false }).first()).toBeVisible();
  await roster
    .getByRole("button", { name: /Architect/i })
    .first()
    .click();
  const occupant = roster.getByRole("combobox", { name: /^Seat occupant/ });
  await expect.element(occupant).toHaveValue("arch-a");
  await expect
    .element(occupant.getByRole("option", { name: "Incoming designer" }))
    .toBeInTheDocument();
  const assignment = roster.getByRole("link", { name: /Design project navigation/i });
  await expect
    .element(assignment)
    .toHaveAttribute("href", expect.stringContaining("task=design-nav"));
  await expect.element(roster.getByText("Sketch the drill-down", { exact: true })).toBeVisible();
  await expect.element(roster.getByText("Compare approaches and define a change")).toBeVisible();
  await expect
    .element(
      roster.getByText(/Decision, trade-offs and implementation plan.*Human selection.*Builder/),
    )
    .toBeVisible();
  await occupant.selectOptions("arch-b");
  expect(save).toHaveBeenCalledWith({
    environmentId: "local",
    input: {
      patch: { it3Workspaces: { projects: { atlas: { seats: { architect: "arch-b" } } } } },
    },
  });
});
it("opens a project-scoped Explorer request from the learning entry point", async () => {
  await using screen = await render(<ProjectIntents project={project} tasks workflows roster />, {
    router: "/workspaces",
  });
  await screen.getByRole("button", { name: /Understand the system/ }).click();
  const ask = screen.getByRole("link", { name: /Ask Explorer/i });
  await expect.element(ask).toHaveAttribute("href", expect.stringContaining("project=atlas"));
  await expect
    .element(ask)
    .toHaveAttribute("href", expect.stringMatching(/intent=(?:explore|education|learn)/));
});
