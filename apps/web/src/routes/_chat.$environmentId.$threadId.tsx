import { createFileRoute } from "@tanstack/react-router";

// The _chat layout owns ChatView so draft promotion keeps it mounted.
export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (raw: Record<string, unknown>) =>
    raw.team === true ? { team: true as const } : {},
  component: () => null,
});
