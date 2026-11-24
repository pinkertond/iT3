import type { ServerSettings, ProjectId } from "@t3tools/contracts";

export const starterWorkspaces = ["Work", "Personal", "Random"];
export const statuses = ["active", "paused", "idle", "archived"] as const;
export type ProjectStatus = (typeof statuses)[number];
export type Directory = NonNullable<ServerSettings["it3Workspaces"]>;

export function projectPlacement(
  project: { id: ProjectId; archivedAt?: string | null | undefined },
  directory?: Directory,
) {
  const row = directory?.projects?.[project.id];
  return {
    workspace: row?.workspace ?? "",
    status: project.archivedAt ? ("archived" as const) : (row?.status ?? "active"),
  };
}
export function workspaceKey(label: string) {
  return "w-" + encodeURIComponent(label.trim().normalize("NFC").toLowerCase());
}
