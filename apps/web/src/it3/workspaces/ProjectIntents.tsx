import { useState } from "react";
import { useGT, T } from "gt-react";
import { BookOpen, DraftingCompass, PencilRuler } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Project } from "~/types";
import styles from "./workspaces.module.css";

export function projectDraft(intent: string | undefined) {
  switch (intent) {
    case "interface":
      return {
        steps:
          "Describe the current interaction and desired behavior\nModify the interface\nVerify the affected states and layout",
        compare: false,
      };
    case "implement":
      return {
        steps:
          "Link the selected concept and acceptance criteria\nImplement the approved interaction\nVerify behavior and visual states",
        compare: false,
      };
    case "fix":
      return {
        steps: "Reproduce the issue\nImplement the fix\nVerify the original reproduction",
        compare: false,
      };
    case "concepts":
      return {
        steps:
          "Describe the user interaction\nProduce a visual concept with its trade-offs\nSubmit the concept for human selection",
        compare: true,
      };
    case "architecture":
      return {
        steps:
          "Trace the current design and constraints\nPropose the change with alternatives\nRecord the decision and implementation plan",
        compare: false,
      };
    default:
      return null;
  }
}
export function ProjectIntents({
  project,
  tasks,
  workflows,
}: {
  project: Project;
  tasks: boolean;
  workflows: boolean;
}) {
  const gt = useGT();
  const [choice, select] = useState("");
  const home = { env: project.environmentId, project: project.id };
  const draft = (intent: string, label: string) =>
    tasks ? (
      <Link to="/workspaces" search={{ ...home, view: "tasks", intent }}>
        {label}
      </Link>
    ) : null;
  return (
    <section aria-label={gt("Start project work")}>
      <div className={styles["intent-grid"]}>
        {(
          [
            [
              "change",
              PencilRuler,
              gt("Fix or redesign"),
              gt("Repair a bug or compare interface concepts."),
            ],
            [
              "learn",
              BookOpen,
              gt("Understand the system"),
              gt("Explore deployment, data and request flows."),
            ],
            [
              "architect",
              DraftingCompass,
              gt("Architect a change"),
              gt("Design a system, workflow or interaction."),
            ],
          ] as const
        ).map(([id, Icon, label, summary]) => (
          <button
            key={id}
            aria-expanded={choice === id}
            onClick={() => select(choice === id ? "" : id)}
          >
            <Icon size={20} />
            <strong>{label}</strong>
            <small>{summary}</small>
          </button>
        ))}
      </div>
      {choice && (
        <div className={styles["intent-actions"]}>
          {choice === "change" && (
            <>
              {draft("interface", gt("Modify an interface"))}
              {draft("fix", gt("Start a bug fix"))}
              {draft("concepts", gt("Compare two design concepts"))}
              {draft("implement", gt("Implement a selected design"))}
            </>
          )}
          {choice === "learn" && (
            <>
              {(
                [
                  ["Documentation", gt("App structure")],
                  ["Deployments", gt("Deployment and hosts")],
                  ["Connections", gt("Network and requests")],
                  ["Data", gt("Database and schema")],
                  ["Delivery", gt("Build and audit")],
                ] as const
              ).map(([section, label]) => (
                <Link key={section} to="/workspaces" search={{ ...home, view: "docs", section }}>
                  {label}
                </Link>
              ))}
            </>
          )}
          {choice === "architect" && (
            <>
              {draft("architecture", gt("Draft an architecture decision"))}
              <Link to="/workspaces" search={{ ...home, view: "docs" }}>
                <T>Inspect existing design</T>
              </Link>
            </>
          )}
          {choice !== "change" && workflows && (
            <Link to="/workflows" search={{ ...home, definitions: true }}>
              <T>Open workflow canvas</T>
            </Link>
          )}
          {choice !== "learn" && !tasks && <T>Update this host to create project tasks.</T>}
        </div>
      )}
    </section>
  );
}
