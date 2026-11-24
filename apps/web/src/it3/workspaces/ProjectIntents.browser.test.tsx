import { expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import type { Project } from "~/types";
import { ProjectIntents } from "./ProjectIntents";
it("opens project-scoped concept comparison, architecture drafts, and schema documentation", async () => {
  const project = { id: "project-a", environmentId: "local" } as Project;
  await using screen = await render(<ProjectIntents project={project} tasks workflows />, {
    router: "/workspaces",
  });
  await screen.getByRole("button", { name: /Fix or redesign/ }).click();
  await expect
    .element(screen.getByRole("link", { name: "Compare two design concepts" }))
    .toHaveAttribute("href", expect.stringContaining("intent=concepts"));
  await screen.getByRole("button", { name: /Understand the system/ }).click();
  const schema = screen.getByRole("link", { name: "Database and schema" });
  await expect.element(schema).toHaveAttribute("href", expect.stringContaining("section=Data"));
  await expect
    .element(schema)
    .toHaveAttribute("href", expect.stringContaining("project=project-a"));
  await screen.getByRole("button", { name: /Architect a change/ }).click();
  await expect
    .element(screen.getByRole("link", { name: "Draft an architecture decision" }))
    .toHaveAttribute("href", expect.stringContaining("intent=architecture"));
});
