import { expect, it } from "vite-plus/test";
import { ProjectId, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { applyServerSettingsPatch } from "@t3tools/shared/serverSettings";
import { projectPlacement, workspaceKey } from "./directory";
it("preserves independent workspace and status edits across clients", () => {
  const id = ProjectId.make("project-a");
  let settings = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
    it3Workspaces: { projects: { [id]: { workspace: "Work" } } },
  });
  settings = applyServerSettingsPatch(settings, {
    it3Workspaces: { projects: { [id]: { status: "paused" } } },
  });
  expect(projectPlacement({ id }, settings.it3Workspaces)).toEqual({
    workspace: "Work",
    status: "paused",
  });
  expect(projectPlacement({ id, archivedAt: "2026-11-23" }, settings.it3Workspaces).status).toBe(
    "archived",
  );
  expect(projectPlacement({ id })).toEqual({ workspace: "", status: "active" });
  expect(workspaceKey(" Work ")).toBe(workspaceKey("work"));
});
