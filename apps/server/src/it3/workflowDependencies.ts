import { readCanvas, type CanvasDocument } from "@t3tools/shared/it3WorkflowGraph";
import type { WorkflowDefinition } from "../workflows/workflow.ts";

const documents = new WeakMap<WorkflowDefinition, CanvasDocument>();
export function recordCanvasDefinitions(source: string, defs: readonly WorkflowDefinition[]) {
  const doc = readCanvas(source);
  if (doc) for (const def of defs) documents.set(def, doc);
}
export function canvasDependencyProblems(
  files: ReadonlyArray<{ name: string; definitions: readonly WorkflowDefinition[] }>,
  before: ReadonlyMap<string, readonly WorkflowDefinition[]>,
) {
  const indexed = new Map<string, { file: string; doc: CanvasDocument; version: number }>();
  const problems: Array<{ files: string[]; clash: boolean; problem: { message: string } }> = [];
  for (const file of files)
    for (const def of file.definitions) {
      const doc = documents.get(def);
      if (doc)
        indexed.set(def.name + "@" + def.version, { file: file.name, doc, version: def.version });
    }
  const blame = (names: string[], message: string) =>
    problems.push({ files: [...new Set(names)], clash: false, problem: { message } });
  const done = new Set<string>(),
    visiting = new Set<string>();
  function visit(tag: string, trail: string[]) {
    if (visiting.has(tag)) {
      blame(trail, "Subflow cycle through " + tag);
      return;
    }
    if (done.has(tag)) return;
    const current = indexed.get(tag);
    if (!current) return;
    visiting.add(tag);
    for (const n of current.doc.revisions[current.version - 1]!.nodes) {
      if (n.kind !== "subflow" || !n.target) continue;
      const target = n.target.workflow + "@" + n.target.version,
        child = indexed.get(target),
        childFile = n.target.workflow + ".flow.ts";
      if (!child || current.doc.projectId !== child.doc.projectId || child.file !== childFile) {
        blame([current.file, childFile], tag + " requires the published project subflow " + target);
        continue;
      }
      visit(target, [...trail, child.file]);
    }
    visiting.delete(tag);
    done.add(tag);
  }
  for (const [tag, record] of indexed) {
    visit(tag, [record.file]);
    const previous = before
      .get(record.file)
      ?.find((d) => d.name === record.doc.name && d.version === record.version);
    const old = previous && documents.get(previous);
    const engineFormat = (doc: CanvasDocument) =>
      record.version <= (doc.legacyVersions ?? 0) ? 2 : doc.format;
    if (
      old &&
      (old.projectId !== record.doc.projectId ||
        engineFormat(old) !== engineFormat(record.doc) ||
        JSON.stringify(old.revisions[record.version - 1]) !==
          JSON.stringify(record.doc.revisions[record.version - 1]))
    )
      blame([record.file], "Publish a new revision to change " + tag + ".");
  }
  return problems;
}
