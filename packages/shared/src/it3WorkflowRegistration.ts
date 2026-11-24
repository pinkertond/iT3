// Trusted build-time extensions. A handler runs inside the journaled native workflow body.
// Keep a published handler immutable. A semantic change needs a new component kind or format.
type WorkflowComponentDefinition = {
  input: "object" | "suite-report" | "suite-summary";
  title: string;
  icon: string;
  description: string;
  ports: readonly ("next" | "yes" | "no")[];
  settings: "none" | "scalar" | "workflow";
  permission: "local" | "ask" | "invoke";
  handler: string;
};
export type ComponentCollection = Record<string, WorkflowComponentDefinition>;
export function registerComponents<
  const Base extends ComponentCollection,
  const Added extends ComponentCollection,
>(base: Base, added: Added): Base & Added {
  for (const id of Object.keys(added)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || Object.hasOwn(base, id))
      throw new Error("Invalid or duplicate workflow component: " + id);
  }
  return { ...base, ...added };
}
