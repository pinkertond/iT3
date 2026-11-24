import type { ProjectTaskSeat } from "@t3tools/contracts";
import { useGT } from "gt-react";

export function useSeatRoutes() {
  const gt = useGT();
  return {
    designer: {
      name: gt("Designer"),
      purpose: gt("Compare interface concepts"),
      deliverable: gt("Visual concept and trade-offs"),
      next: gt("Human selection → Builder"),
    },
    explorer: {
      name: gt("Explorer"),
      purpose: gt("Answer a system question from evidence"),
      deliverable: gt("Explanation with source references"),
      next: gt("Project Manager"),
    },
    architect: {
      name: gt("Architect"),
      purpose: gt("Compare approaches and define a change"),
      deliverable: gt("Decision, trade-offs and implementation plan"),
      next: gt("Human selection → Builder"),
    },
    builder: {
      name: gt("Builder"),
      purpose: gt("Prepare a protected source change"),
      deliverable: gt("Git candidate"),
      next: gt("Reviewer"),
    },
    reviewer: {
      name: gt("Reviewer"),
      purpose: gt("Independently check the candidate"),
      deliverable: gt("Verdict and evidence"),
      next: gt("Builder for changes or operator for verification"),
    },
    "test-maintainer": {
      name: gt("Test Maintainer"),
      purpose: gt("Decide contested tests independently"),
      deliverable: gt("Test decision or amendment"),
      next: gt("Builder"),
    },
  } as const;
}
export type RosterRole = keyof ReturnType<typeof useSeatRoutes>;
export function specialist(role: RosterRole): role is ProjectTaskSeat {
  return role === "architect" || role === "explorer" || role === "designer";
}
export function intentSeat(intent?: string): RosterRole | undefined {
  if (intent === "architecture") return "architect";
  if (intent === "concepts") return "designer";
  if (intent === "explore") return "explorer";
  if (intent === "fix" || intent === "implement" || intent === "interface") return "builder";
  return undefined;
}
