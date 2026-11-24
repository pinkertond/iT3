vi.mock("./ProjectLibrary", () => ({ TaskReference: () => null }));
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AgentPanel } from "./AgentPanel";

const env = EnvironmentId.make("local");
const threads = vi.hoisted(() =>
  ["Boss", "Lead", "Worker"].map((title, i) => ({
    id: String(i),
    title,
    environmentId: "local",
    projectId: "one",
    lineage: {
      relationshipToParent: i ? "subagent" : null,
      parentThreadId: i ? String(i - 1) : null,
    },
    runtime: { status: "running" },
    modelSelection: { model: "model-A" },
    runtimeMode: "auto",
    hasPendingApprovals: i === 2,
  })),
);
vi.mock("~/state/entities", () => ({
  useProject: () => null,
  useQuietThreadShell: (ref: { threadId: string }) => threads[Number(ref.threadId)],
  useThreadShellsForProjectRefs: () => threads,
  useServerConfigs: () =>
    new Map([
      [
        "local",
        {
          environment: { capabilities: { it3AgentView: true } },
          settings: { it3Workspaces: { projects: { one: { managerThreadId: "0" } } } },
        },
      ],
    ]),
}));
vi.mock("~/components/ThreadRouteView", () => ({ useOpenThreadFamily: vi.fn() }));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("~/state/server", () => ({ serverEnvironment: { usageSummary: () => ({}) } }));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({
    data: {
      it3ProjectId: "one",
      buckets: [
        {
          it3ThreadId: "2",
          provider: "codex",
          model: "model-A",
          records: 1,
          unpricedRecords: 0,
          costUsd: 0.25,
          totals: {
            uncachedInputTokens: 100,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 20,
          },
        },
      ],
    },
  }),
}));
it("opens the next layer, locates a held grandchild and rolls its usage into the manager", async () => {
  const panel = (id: string) => (
    <AgentPanel threadRef={{ environmentId: env, threadId: ThreadId.make(id) }} requested />
  );
  await using screen = await render(panel("0"), { router: "/local/0" });
  const team = screen.getByRole("complementary", { name: "Agent team" });
  if (
    team.getByRole("button", { name: "Team" }).element().getAttribute("aria-expanded") === "false"
  )
    await team.getByRole("button", { name: "Team" }).click();
  await expect.element(team.getByRole("heading", { name: "Direct agents · 1" })).toBeVisible();
  await expect.element(team.getByRole("link", { name: /Worker.*Needs approval/ })).toBeVisible();
  await team.getByText("Branch usage · last 7 days").click();
  await expect.element(team.getByText(/120 tokens.*0.25/)).toBeVisible();
  await team
    .getByRole("link", { name: /Lead.*Working/ })
    .first()
    .click();
  expect(screen.router?.state.location.pathname).toBe("/local/1");
  expect(screen.router?.state.location.search).toMatchObject({ team: true });
  await screen.rerender(panel("1"));
  await expect.element(team.getByRole("heading", { name: "Parent" })).toBeVisible();
  await expect.element(team.getByRole("heading", { name: "Lead", exact: true })).toBeVisible();
});
