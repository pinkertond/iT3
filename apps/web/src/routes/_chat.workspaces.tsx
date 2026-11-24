import { createFileRoute } from "@tanstack/react-router";
import { WorkspacesPage } from "../it3/workspaces/WorkspacesPage";

export const Route = createFileRoute("/_chat/workspaces")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(typeof raw.workspace === "string" && raw.workspace ? { workspace: raw.workspace } : {}),
    ...(typeof raw.status === "string" && raw.status ? { status: raw.status } : {}),
    ...(typeof raw.env === "string" && raw.env ? { env: raw.env } : {}),
    ...(typeof raw.project === "string" && raw.project ? { project: raw.project } : {}),
    ...(typeof raw.node === "string" && raw.node ? { node: raw.node } : {}),
  }),
  component: WorkspacesPage,
});
