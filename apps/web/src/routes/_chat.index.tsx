import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HostedEmptyState } from "../components/HostedEmptyState";
import { NoProjectsHero } from "../components/NoProjectsHero";
import { useAllEnvironmentShellsBootstrapped, useProjects } from "../state/entities";
import { useEnvironments } from "../state/environments";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { environments, isReady } = useEnvironments();
  const projects = useProjects();
  const ready = useAllEnvironmentShellsBootstrapped();
  if (authGateState.status === "hosted-static") {
    if (!isReady) return null;
    if (!environments.length) return <HostedEmptyState />;
  }
  if (projects.length > 0) return <Navigate to="/workspaces" replace />;
  return ready ? <NoProjectsHero /> : null;
}

export const Route = createFileRoute("/_chat/")({ component: ChatIndexRouteView });
