import { ProjectRoster } from "./ProjectRoster";
import { QueuePreview } from "./QueuePreview";
import { NeedsYou } from "./NeedsYou";
import { ProjectIntents } from "./ProjectIntents";
import { TaskBoard } from "./TaskBoard";
import styles from "./workspaces.module.css";
import { T, useGT } from "gt-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { AuthSettingsWriteScope, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { FolderOpen, ChevronRight, Layers, Search } from "lucide-react";
import {
  useProjects,
  useServerConfigs,
  useAllEnvironmentProjectSnapshotsReady,
  useThreadShellsForProjectRefs,
} from "~/state/entities";
import { useEnvironmentIdentities, usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { serverEnvironment } from "~/state/server";
import { useProjectGroupUpdate } from "~/hooks/useProjectGroupUpdate";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { SidebarInset } from "~/components/ui/sidebar";
import { isElectron } from "~/env";
import type { Project } from "~/types";
import {
  starterWorkspaces,
  statuses,
  projectPlacement,
  workspaceKey,
  type ProjectStatus,
  type Directory,
} from "./directory";
import { useWorkspaceView } from "./view";
import { ProjectLibrary } from "./ProjectLibrary";

import { useSettingsProjectGroups } from "~/components/settings/useSettingsProjectGroups";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { agentTree, needsAttention, working } from "./agentTree";
import { ProjectUsage } from "./ProjectUsage";
import { PageList } from "./PageList";

const route = "/workspaces";
type SearchState = {
  intent?: string;
  concept?: string;
  section?: string;
  assign?: string;
  view?: string;
  task?: string;
  source?: string;
  agent?: string;
  env?: string;
  project?: string;
  status?: string;
  node?: string;
  workspace?: string;
};
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
export function WorkspacesPage() {
  const gt = useGT();
  const query = useSearch({ strict: false }) as SearchState;
  const navigate = useNavigate();
  const projects = useProjects();
  const configs = useServerConfigs();
  const identities = useEnvironmentIdentities();
  const primary = usePrimaryEnvironmentId();
  const ready = useAllEnvironmentProjectSnapshotsReady();
  const stored = useWorkspaceView((s) => s.workspace);
  const select = useWorkspaceView((s) => s.select);
  const active = query.workspace ?? stored;
  const names = new Map(starterWorkspaces.map((n) => [workspaceKey(n), n]));
  for (const config of configs.values()) {
    for (const n of Object.values(config.settings.it3Workspaces?.names ?? {}))
      names.set(workspaceKey(n), n);
    for (const p of Object.values(config.settings.it3Workspaces?.projects ?? {}))
      if (p.workspace) names.set(workspaceKey(p.workspace), p.workspace);
  }
  const [search, setSearch] = useState("");
  const host =
    identities.find(
      (e) =>
        e.environmentId === primary &&
        configs.get(e.environmentId)?.environment.capabilities.it3Workspaces,
    )?.environmentId ??
    identities.find((e) => configs.get(e.environmentId)?.environment.capabilities.it3Workspaces)
      ?.environmentId ??
    null;
  const [creationHost, setCreationHost] = useState<EnvironmentId | null>(null);
  const target = creationHost ?? host;
  const canCreate = useEnvironmentScope(target, AuthSettingsWriteScope);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const write = useAtomCommand(serverEnvironment.updateSettings, "workspace directory");
  const filter =
    query.status === "all" || statuses.some((s) => s === query.status)
      ? (query.status ?? "active")
      : "active";
  const go = (search: SearchState) => void navigate({ to: route, search });
  const choose = (workspace: string) => {
    select(workspace);
    setSearch("");
    go({ workspace, status: filter });
  };
  const changeName = async () => {
    const label = name.trim().normalize("NFC");
    if (!target || !label || saving) return;
    const key = workspaceKey(label);
    if (names.has(key) || key === workspaceKey("Everything")) {
      setError(gt("A workspace with that name already exists."));
      return;
    }
    setSaving(true);
    try {
      const result = await write({
        environmentId: target,
        input: { patch: { it3Workspaces: { names: { [key]: label } } } },
      });
      if (result._tag !== "Success") {
        setError(gt("The workspace could not be saved."));
        return;
      }
      choose(key);
      setName("");
      setCreating(false);
      setError("");
    } finally {
      setSaving(false);
    }
  };
  const selected = projects.find((p) => p.environmentId === query.env && p.id === query.project);
  const labelFor = (id: EnvironmentId) =>
    identities.find((e) => e.environmentId === id)?.label ?? id;
  const visible = projects
    .filter((p) => {
      const row = projectPlacement(p, configs.get(p.environmentId)?.settings.it3Workspaces);
      return (
        (!active || workspaceKey(row.workspace) === active) &&
        (filter === "all" || row.status === filter) &&
        (p.title + " " + labelFor(p.environmentId))
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      );
    })
    .sort(
      (a, b) => a.title.localeCompare(b.title) || a.environmentId.localeCompare(b.environmentId),
    );
  return (
    <SidebarInset className="h-dvh overflow-hidden">
      <WorkspacePageHeader electron={isElectron} />
      <div className={styles["iw-scroll"]}>
        <div className={styles["iw"]}>
          <nav className={styles["iw-crumb"]} aria-label={gt("Breadcrumb")}>
            <Layers size={16} />
            <button onClick={() => go({ workspace: active, status: filter })}>
              <T>Workspaces</T>
            </button>
            <ChevronRight size={14} />
            <span>
              {names.get(active) ?? (active ? gt("Selected workspace") : gt("Everything"))}
            </span>
            {selected && (
              <>
                <ChevronRight size={14} />
                <span>{selected.title}</span>
              </>
            )}
          </nav>
          {query.project ? (
            selected ? (
              <ProjectHome
                key={JSON.stringify([selected.environmentId, selected.id, query.assign])}
                project={selected}
                machine={labelFor(selected.environmentId)}
                names={names}
                directory={configs.get(selected.environmentId)?.settings.it3Workspaces}
                supported={
                  configs.get(selected.environmentId)?.environment.capabilities.it3Workspaces ===
                  true
                }
                agentSupported={
                  configs.get(selected.environmentId)?.environment.capabilities.it3AgentView ===
                  true
                }
                query={query}
                go={go}
                node={query.node}
                onNode={(node) => {
                  const next = { ...query };
                  if (node) next.node = node;
                  else delete next.node;
                  go(next);
                }}
              />
            ) : (
              <p role="status">
                {ready
                  ? gt("Project unavailable in the connected environments.")
                  : gt("Loading project…")}
              </p>
            )
          ) : (
            <>
              <div className={styles["iw-title"]}>
                <h1>{names.get(active) ?? (active ? gt("Workspace") : gt("Everything"))}</h1>
                <button
                  className={styles["iw-action"]}
                  onClick={() => {
                    setCreating(!creating);
                    setError("");
                  }}
                >
                  {creating ? gt("Cancel") : gt("New workspace")}
                </button>
              </div>
              {creating && (
                <form
                  className={styles["iw-form"]}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void changeName();
                  }}
                >
                  <label>
                    <T>Workspace name</T>
                    <input
                      autoFocus
                      value={name}
                      maxLength={80}
                      required
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    <T>Save on</T>
                    <select
                      aria-label={gt("Save on")}
                      value={target ?? ""}
                      onChange={(e) => setCreationHost(e.target.value as EnvironmentId)}
                    >
                      {identities
                        .filter(
                          (e) =>
                            configs.get(e.environmentId)?.environment.capabilities.it3Workspaces,
                        )
                        .map((e) => (
                          <option key={e.environmentId} value={e.environmentId}>
                            {e.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button disabled={!target || !canCreate || saving || !name.trim()}>
                    <T>Create</T>
                  </button>
                  {(!target || !canCreate) && (
                    <p>
                      <T>Connect an iT3 environment with settings access to create workspaces.</T>
                    </p>
                  )}
                </form>
              )}
              {error && <p role="alert">{error}</p>}
              <div className={styles["iw-filters"]}>
                <label>
                  <T>Workspace</T>
                  <select
                    aria-label={gt("Workspace")}
                    value={active}
                    onChange={(e) => choose(e.target.value)}
                  >
                    <option value="">
                      <T>Everything</T>
                    </option>
                    {Array.from(names, ([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <T>Project status</T>
                  <select
                    aria-label={gt("Project status")}
                    value={filter}
                    onChange={(e) => go({ workspace: active, status: e.target.value })}
                  >
                    {["active", "paused", "idle", "archived", "all"].map((s) => (
                      <option key={s} value={s}>
                        {s === "all" ? gt("All statuses") : capitalize(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <T>Find a project</T>
                  <span className={styles["iw-search"]}>
                    <Search size={15} />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </span>
                </label>
              </div>
              {!active && <NeedsYou projects={projects} />}
              <h2>
                <T>Projects</T> <small>{visible.length}</small>
              </h2>
              <div className={styles["iw-list"]}>
                <PageList key={active + filter + search} items={visible}>
                  {(p) => (
                    <Link
                      className={styles["iw-row"]}
                      key={JSON.stringify([p.environmentId, p.id])}
                      to={route}
                      search={{
                        workspace: active,
                        status: filter,
                        env: p.environmentId,
                        project: p.id,
                      }}
                    >
                      <FolderOpen size={19} />
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {labelFor(p.environmentId)} ·{" "}
                          {projectPlacement(p, configs.get(p.environmentId)?.settings.it3Workspaces)
                            .workspace || gt("Unassigned")}
                        </small>
                      </span>
                      <em>
                        {capitalize(
                          projectPlacement(p, configs.get(p.environmentId)?.settings.it3Workspaces)
                            .status,
                        )}
                      </em>
                      <ChevronRight size={16} />
                    </Link>
                  )}
                </PageList>
              </div>
              {!visible.length && (
                <p role="status">
                  {ready ? gt("No projects match this view.") : gt("Loading projects…")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

function ProjectHome({
  project: p,
  machine,
  agentSupported,
  query,
  go,
  names,
  directory,
  supported,
  node,
  onNode,
}: {
  project: Project;
  machine: string;
  names: Map<string, string>;
  directory: Directory | undefined;
  supported: boolean;
  agentSupported: boolean;
  query: SearchState;
  go: (q: SearchState) => void;
  node: string | undefined;
  onNode: (n: string | undefined) => void;
}) {
  const gt = useGT();
  const placement = projectPlacement(p, directory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = useEnvironmentScope(p.environmentId, AuthSettingsWriteScope);
  const write = useAtomCommand(serverEnvironment.updateSettings, "project placement");
  const { updateProjectGroup, canOrganizeProjectGroup } = useProjectGroupUpdate();
  const member = { ...p, environmentLabel: machine };
  const threads = useThreadShellsForProjectRefs([
    { environmentId: p.environmentId, projectId: p.id },
  ]);
  const newChat = useNewThreadHandler();
  const group = useSettingsProjectGroups().find((g) =>
    g.memberProjects.some((m) => m.environmentId === p.environmentId && m.id === p.id),
  );
  const checkout = group?.memberProjects.find(
    (m) => m.environmentId === p.environmentId && m.id === p.id,
  )?.physicalProjectKey;
  const tree = agentTree(threads);
  const config = directory?.projects?.[p.id];
  const chosen = config?.managerThreadId;
  const manager = chosen
    ? tree.byId.get(chosen)
    : tree.roots.length === 1
      ? tree.roots[0]
      : undefined;
  const rosterSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3TeamRoster === true;
  const guardedSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3GuardedLoop === true;
  const canvasSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3WorkflowCanvas === true;
  const reviewSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3ReviewerDispatch === true;
  const queueSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3QueuePreview === true;
  const taskSupported =
    useServerConfigs().get(p.environmentId)?.environment.capabilities.it3Tasks === true;
  const view = node ? "docs" : (query.view ?? "agents");
  const [taskThread, setTaskThread] = useState("");
  const [reference, setReference] = useState(query.assign ?? "");
  const saveBinding = async (change: {
    managerThreadId?: ThreadId | null;
    taskRefs?: Record<ThreadId, string | null>;
  }) => {
    setBusy(true);
    setError("");
    try {
      const result = await write({
        environmentId: p.environmentId,
        input: { patch: { it3Workspaces: { projects: { [p.id]: change } } } },
      });
      if (result._tag !== "Success") setError(gt("Could not save the project change."));
    } finally {
      setBusy(false);
    }
  };
  if (!query.view && !node && manager)
    return (
      <Navigate
        replace
        to="/$environmentId/$threadId"
        params={{ environmentId: p.environmentId, threadId: manager.id }}
        search={{ team: true }}
      />
    );
  const mutate = async (change: { workspace?: string | null; status?: ProjectStatus }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (change.status !== "archived") {
        const result = await write({
          environmentId: p.environmentId,
          input: {
            patch: {
              it3Workspaces: {
                projects: {
                  [p.id]: change as {
                    workspace?: string | null;
                    status?: "active" | "paused" | "idle";
                  },
                },
              },
            },
          },
        });
        if (result._tag !== "Success") {
          setError(gt("Could not save the project change."));
          return;
        }
      }
      if (change.status && (change.status === "archived" || p.archivedAt)) {
        const result = await updateProjectGroup(
          [member],
          { archived: change.status === "archived" },
          "Could not update project archive",
        );
        if (result._tag !== "Success")
          setError(gt("Could not update the project archive. Retry to finish."));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h1>{p.title}</h1>
      <p className={styles["iw-secondary"]}>
        {machine} · {p.workspaceRoot}
      </p>
      {view === "agents" && (
        <>
          <ProjectIntents
            project={p}
            tasks={taskSupported}
            workflows={canvasSupported}
            roster={rosterSupported}
          />
          {rosterSupported && <ProjectRoster project={p} threads={threads} />}
        </>
      )}
      <div className={styles["iw-filters"]}>
        <label>
          <T>Workspace</T>
          <select
            aria-label={gt("Workspace")}
            value={placement.workspace ? workspaceKey(placement.workspace) : ""}
            disabled={!supported || !writable || busy}
            onChange={(e) => void mutate({ workspace: names.get(e.target.value) ?? null })}
          >
            <option value="">
              <T>Unassigned</T>
            </option>
            {Array.from(names, ([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>Project status</T>
          <select
            aria-label={gt("Project status")}
            value={placement.status}
            disabled={!supported || !writable || busy}
            onChange={(e) => void mutate({ status: e.target.value as ProjectStatus })}
          >
            {statuses.map((s) => (
              <option
                key={s}
                value={s}
                disabled={s === "archived" && !canOrganizeProjectGroup([member])}
              >
                {capitalize(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!supported && (
        <p className={styles["iw-secondary"]}>
          <T>Workspace changes require an iT3 host with workspace support.</T>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <nav className={styles["iw-tabs"]} aria-label={gt("Project views")}>
        {[
          ["agents", gt("Agents")],
          ["tasks", gt("Tasks")],
          ...(queueSupported ? [["queue", gt("Queue preview")]] : []),
          ["docs", gt("Documentation")],
          ["usage", gt("Usage and cost")],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => {
              const next = { ...query, view: key! };
              delete next.node;
              delete next.agent;
              go(next);
            }}
          >
            {label}
          </button>
        ))}
        {canvasSupported && (
          <Link to="/workflows" search={{ env: p.environmentId, project: p.id, definitions: true }}>
            <T>Workflows</T>
          </Link>
        )}
      </nav>
      {view === "tasks" ? (
        taskSupported ? (
          <TaskBoard
            place={config}
            key={JSON.stringify([query.task, query.assign, query.intent, query.concept])}
            intent={query.intent}
            concept={query.concept}
            project={p}
            threads={threads}
            rosterSupported={rosterSupported}
            guardedSupported={guardedSupported}
            reviewSupported={reviewSupported}
            queueSupported={queueSupported}
            selected={query.task}
            thread={query.agent}
            seed={query.assign}
            source={query.source}
            onSelect={(id) => {
              const q = { ...query, view: "tasks" };
              delete q.intent;
              delete q.concept;
              delete q.assign;
              delete q.source;
              if (id) q.task = id;
              else delete q.task;
              go(q);
            }}
          />
        ) : (
          <p>
            <T>Update this environment to enable shared tasks.</T>
          </p>
        )
      ) : view === "queue" && queueSupported ? (
        <QueuePreview
          reviewerChats={reviewSupported ? threads : undefined}
          project={p}
          policy={config?.queuePolicy ?? null}
        />
      ) : view === "docs" ? (
        <ProjectLibrary
          key={query.section}
          initialSection={query.section}
          project={p}
          node={node}
          onNode={onNode}
        />
      ) : view === "usage" ? (
        <ProjectUsage
          env={p.environmentId}
          project={p.id}
          threads={threads}
          refs={config?.taskRefs ?? {}}
          supported={agentSupported}
          agent={query.agent}
        />
      ) : (
        <>
          <h2>
            <T>Project agents</T>
          </h2>
          <p>
            {tree.rows.filter(working).length} <T>working</T> ·{" "}
            {tree.rows.filter(needsAttention).length} <T>need attention</T>
          </p>
          {manager && (
            <Link
              className={styles["iw-row"]}
              to="/$environmentId/$threadId"
              params={{ environmentId: p.environmentId, threadId: manager.id }}
              search={{ team: true }}
            >
              <strong>
                <T>Open manager chat</T>
              </strong>
              <span>{manager.title}</span>
              <ChevronRight size={16} />
            </Link>
          )}
          <div className={styles["iw-filters"]}>
            <label>
              <T>Manager chat</T>
              <select
                aria-label={gt("Manager chat")}
                disabled={!agentSupported || !writable || busy}
                value={chosen ?? ""}
                onChange={(e) =>
                  void saveBinding({ managerThreadId: (e.target.value as ThreadId) || null })
                }
              >
                <option value="">{gt("Choose a conversation")}</option>
                {chosen && !tree.byId.has(chosen) && (
                  <option value={chosen}>{gt("Saved manager is unavailable")}</option>
                )}
                {tree.roots.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={styles["iw-action"]}
              onClick={async () => {
                const draft = await newChat({ environmentId: p.environmentId, projectId: p.id });
                if (draft && agentSupported && writable)
                  await saveBinding({ managerThreadId: draft.threadId });
              }}
            >
              {gt("Start manager chat")}
            </button>
          </div>
          {group && checkout && (
            <Link
              to="/settings/projects"
              hash="project-defaults"
              search={{ project: group?.projectKey, machine: p.environmentId, checkout }}
            >
              <T>Project permission defaults</T> ↗
            </Link>
          )}
          <p className={styles["iw-secondary"]}>
            <T>
              Auto mode lets supported providers review requests. Requests that need a person appear
              in the team panel.
            </T>
          </p>
          {tree.rows.length > 0 && (
            <details open={query.assign ? true : undefined} className={styles["iw-chats"]}>
              <summary>
                <T>Assign a task reference</T>
              </summary>
              <form
                className={styles["iw-form"]}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (taskThread)
                    void saveBinding({ taskRefs: { [taskThread]: reference.trim() || null } });
                }}
              >
                <label>
                  <T>Conversation</T>
                  <select
                    required
                    value={taskThread}
                    onChange={(e) => {
                      setTaskThread(e.target.value);
                      setReference(
                        query.assign ?? config?.taskRefs?.[e.target.value as ThreadId] ?? "",
                      );
                    }}
                  >
                    <option value="">{gt("Choose a conversation")}</option>
                    {tree.rows.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <T>Task reference</T>
                  <input
                    value={reference}
                    maxLength={160}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <button disabled={!agentSupported || !writable || busy || !taskThread}>
                  <T>Save reference</T>
                </button>
              </form>
            </details>
          )}
        </>
      )}

      <details className={styles["iw-chats"]}>
        <summary>
          <T>Chats</T> <small>{threads.length}</small>
        </summary>
        <PageList items={threads}>
          {(t) => (
            <Link
              key={t.id}
              className={styles["iw-row"]}
              to="/$environmentId/$threadId"
              search={{ team: true }}
              params={{ environmentId: t.environmentId, threadId: t.id }}
            >
              {t.title}
              <ChevronRight size={16} />
            </Link>
          )}
        </PageList>
        {threads.length === 0 && (
          <p>
            <T>No chats in this project.</T>
          </p>
        )}
      </details>
    </>
  );
}
