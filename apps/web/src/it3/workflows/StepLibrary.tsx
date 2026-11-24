import { useState } from "react";
import { T, useGT } from "gt-react";
import { X } from "lucide-react";
import {
  readCanvas,
  type CanvasDocument,
  type CanvasKind,
  type CanvasNode,
} from "@t3tools/shared/it3WorkflowGraph";
import { nodeLibrary, insertableKinds } from "./WorkflowNodes";
import styles from "./workflowCanvas.module.css";

interface Props {
  definitionFiles: readonly { name: string; source: string }[];
  registered: boolean;
  subflows: readonly CanvasDocument[];
  projectId: string | null;
  suite: boolean;
  connection: string;
  occupied: boolean;
  add: (kind: CanvasKind, preset?: CanvasNode) => void;
  close: () => void;
}
type Choice = { key: string; kind: CanvasKind; title: string; detail: string; preset?: CanvasNode };
export function StepLibrary({
  registered,
  subflows,
  definitionFiles,
  projectId,
  suite,
  connection,
  occupied,
  add,
  close,
}: Props) {
  const gt = useGT();
  const library = nodeLibrary(gt, suite);
  const [project, setProject] = useState<"blocks" | "steps" | "flows">("blocks");
  const [search, setSearch] = useState("");
  const blocks = insertableKinds(suite, registered).map((kind): Choice => ({
    key: kind,
    kind,
    title: library[kind].title,
    detail: library[kind].hint,
  }));
  const published =
    project === "steps" && projectId
      ? definitionFiles.flatMap((file) => {
          if (!file.name.endsWith(".flow.ts")) return [];
          const saved = readCanvas(file.source);
          if (
            !saved ||
            saved.projectId !== projectId ||
            (saved.format === 1) !== suite ||
            (!registered && saved.format === 3)
          )
            return [];
          const version = saved.revisions.length;
          return saved.revisions[version - 1]!.nodes.filter((n) => n.kind !== "start").map(
            (n): Choice => ({
              key: saved.name + "/" + n.id,
              kind: n.kind,
              title: n.label,
              detail: saved.name + " · v" + version,
              preset: { ...n, copiedFrom: { workflow: saved.name, version, node: n.id } },
            }),
          );
        })
      : [];
  const pins = subflows.map((d): Choice => ({
    key: d.name,
    kind: "subflow",
    title: d.name,
    detail: gt("Version {version}", { version: d.revisions.length }),
    preset: {
      id: "subflow",
      kind: "subflow",
      label: d.name,
      target: { workflow: d.name, version: d.revisions.length },
    },
  }));
  const choices =
    project !== "blocks"
      ? (project === "flows" ? pins : published).filter((n) =>
          (n.title + " " + n.detail).toLowerCase().includes(search.toLowerCase()),
        )
      : blocks;
  return (
    <div
      className={styles.palette}
      role="group"
      aria-label={gt("Step library")}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className={styles.paletteHead}>
        <strong>
          <T>Add step</T>
        </strong>
        <button autoFocus type="button" aria-label={gt("Close step library")} onClick={close}>
          <X size={15} />
        </button>
      </div>
      <p>{connection}</p>
      {(projectId || registered) && (
        <div className={styles.libraryTabs}>
          <button
            type="button"
            aria-pressed={project === "blocks"}
            onClick={() => setProject("blocks")}
          >
            <T>Building blocks</T>
          </button>
          <button
            type="button"
            aria-pressed={project === "steps"}
            onClick={() => setProject("steps")}
          >
            <T>Project steps</T>
          </button>
          {registered && (
            <button
              type="button"
              aria-pressed={project === "flows"}
              onClick={() => setProject("flows")}
            >
              <T>Subflows</T>
            </button>
          )}
        </div>
      )}
      {project !== "blocks" && (
        <input
          aria-label={gt("Find a project step")}
          placeholder={gt("Find a project step")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {choices.slice(0, 12).map((choice) => {
        const Icon = library[choice.kind].icon;
        return (
          <button
            type="button"
            key={choice.key}
            aria-label={choice.title}
            className={styles.choice}
            data-kind={choice.kind}
            disabled={occupied && choice.kind === "result"}
            onClick={() => add(choice.kind, choice.preset)}
          >
            <span className={styles.tile}>
              <Icon size={16} />
            </span>
            <span>
              <strong>{choice.title}</strong>
              <small>{choice.detail}</small>
            </span>
          </button>
        );
      })}
      {choices.length === 0 && (
        <p>
          <T>No matching steps in published project workflows.</T>
        </p>
      )}
      {choices.length > 12 && (
        <p>
          <T>Refine your search to see more steps.</T>
        </p>
      )}
    </div>
  );
}
