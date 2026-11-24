import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { render } from "../../../test/render";
import { ProjectUsage } from "./ProjectUsage";

const query = vi.hoisted(() => vi.fn());
vi.mock("~/state/query", () => ({ useEnvironmentQuery: query }));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("~/state/server", () => ({
  serverEnvironment: { usageSummary: (input: unknown) => input },
}));
const sample = {
  sinceDay: "2026-11-01",
  untilDay: "2026-11-07",
  readAt: "2026-11-07T12:00:00Z",
  sources: [],
  buckets: [
    {
      day: "2026-11-03",
      it3ThreadId: "a",
      model: "m1",
      provider: "codex",
      records: 1,
      unpricedRecords: 0,
      costUsd: 0.5,
      totals: {
        uncachedInputTokens: 10,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 5,
        reasoningTokens: 2,
      },
    },
    {
      day: "2026-11-04",
      it3ThreadId: "b",
      model: "m2",
      provider: "claude",
      records: 1,
      unpricedRecords: 1,
      costUsd: 0,
      totals: {
        uncachedInputTokens: 0,
        cachedInputTokens: 5,
        cacheCreationTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      },
    },
  ],
};
const project = ProjectId.make("p");
const report = (
  <ProjectUsage
    env={EnvironmentId.make("e")}
    project={project}
    threads={[]}
    refs={{ [ThreadId.make("a")]: "task-1", [ThreadId.make("b")]: "task-1" }}
    supported
  />
);
it("requires the host to confirm project scope before displaying usage", async () => {
  query.mockReturnValue({ data: sample, refresh: vi.fn() });
  await using screen = await render(report);
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Host did not confirm project attribution.");
  await expect.element(screen.getByText(/\$0\.50/)).not.toBeInTheDocument();
});
it("groups task attempts and distinguishes unpriced work from zero cost", async () => {
  query.mockReturnValue({ data: { ...sample, it3ProjectId: project }, refresh: vi.fn() });
  await using screen = await render(report);
  await expect.element(screen.getByRole("heading", { name: /0.50.*20 tokens/ })).toBeVisible();
  await screen.getByRole("combobox", { name: /Group by/ }).selectOptions("task");
  await expect.element(screen.getByText("task-1")).toBeVisible();
  await expect.element(screen.getByText(/1 unpriced records/)).toBeVisible();
});
