import { resolveRuntimeModeOption } from "~/components/chat/runtimeModeConfig";
import { BranchUsage } from "./ProjectUsage";
import { TaskReference } from "./ProjectLibrary";

import { useOpenThreadFamily } from "~/components/ThreadRouteView";
import { Link } from "@tanstack/react-router";
import { type ScopedThreadRef } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { T, useGT } from "gt-react";
import { useState } from "react";
import { ChevronRight, Network } from "lucide-react";
import {
  useProject,
  useQuietThreadShell,
  useThreadShellsForProjectRefs,
  useServerConfigs,
} from "~/state/entities";
import { agentTree, needsAttention, working } from "./agentTree";
import { PageList } from "./PageList";
import styles from "./workspaces.module.css";

export function AgentPanel({
  threadRef,
  requested,
}: {
  threadRef: ScopedThreadRef;
  requested: boolean;
}) {
  const t = useQuietThreadShell(threadRef);
  const configs = useServerConfigs();
  if (
    !t ||
    (!requested &&
      configs.get(t.environmentId)?.settings.it3Workspaces?.projects?.[t.projectId]
        ?.managerThreadId !== t.id)
  )
    return null;
  return <Roster key={t.projectId} selected={t} />;
}

function Roster({ selected: t }: { selected: EnvironmentThreadShell }) {
  const gt = useGT();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width:760px)").matches);
  const [usageOpen, setUsageOpen] = useState(false);
  const threads = useThreadShellsForProjectRefs([
    { environmentId: t.environmentId, projectId: t.projectId },
  ]);
  useOpenThreadFamily({ environmentId: t.environmentId, threadId: t.id }, true);
  const configs = useServerConfigs();
  const refs = configs.get(t.environmentId)?.settings.it3Workspaces?.projects?.[t.projectId]
    ?.taskRefs;
  const project = useProject({ environmentId: t.environmentId, projectId: t.projectId });
  const taskRef = refs?.[t.id];
  const tree = agentTree(threads);
  const home = { env: t.environmentId, project: t.projectId };
  const parent = tree.byId.get(tree.parent.get(t.id) ?? t.id);
  const children = tree.children.get(t.id) ?? [];
  const waiting = tree.rows.filter(needsAttention);
  const link = (agent: EnvironmentThreadShell) => (
    <Link
      key={agent.id}
      className={styles["iw-row"]}
      to="/$environmentId/$threadId"
      params={{ environmentId: agent.environmentId, threadId: agent.id }}
      search={{ team: true }}
    >
      <span>
        <strong>{agent.title}</strong>
        <small>
          {agent.hasPendingApprovals || agent.pendingSubagentRequest === "approval"
            ? gt("Needs approval")
            : needsAttention(agent)
              ? gt("Needs input")
              : working(agent)
                ? gt("Working")
                : agent.blockedOnThreadWait || agent.runtime?.status === "waiting"
                  ? gt("Waiting")
                  : gt("Idle")}{" "}
          · {agent.modelSelection?.model}
        </small>
        {!!tree.activeBelow.get(agent.id) && (
          <small>
            {tree.activeBelow.get(agent.id)} <T>working below</T>
          </small>
        )}
      </span>
      <ChevronRight size={14} />
    </Link>
  );
  const tasks = t.pendingBackgroundTasks ?? [];
  const family = new Set([t.id]);
  for (const id of family) for (const c of tree.children.get(id) ?? []) family.add(c.id);
  const assigned = new Set(
    Array.from(family, (id) => refs?.[id]).filter((id): id is string => !!id),
  );
  return (
    <aside
      aria-label={gt("Agent team")}
      className={collapsed ? styles["team-closed"] : styles["team-panel"]}
    >
      <button
        className={styles["team-toggle"]}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Network size={16} />
        <T>Team</T>
      </button>
      {!collapsed && (
        <>
          <nav className={styles["team-links"]}>
            <Link to="/workspaces" search={{ ...home, view: "agents" }}>
              <T>Project</T>
            </Link>
            <Link to="/workspaces" search={{ ...home, view: "docs" }}>
              <T>Docs</T>
            </Link>
            <Link to="/workspaces" search={{ ...home, view: "usage", agent: t.id }}>
              <T>Usage</T>
            </Link>
          </nav>
          <h2>{t.title}</h2>
          <p>
            {working(t)
              ? gt("Working")
              : needsAttention(t)
                ? gt("Needs attention")
                : (t.runtime?.status ?? gt("Idle"))}{" "}
            · {t.modelSelection?.model}
          </p>
          <p>
            {resolveRuntimeModeOption(t.runtimeMode).label} · {tree.activeBelow.get(t.id) ?? 0}{" "}
            <T>working below</T>
          </p>
          {parent && parent.id !== t.id && (
            <div>
              <h3>
                <T>Parent</T>
              </h3>
              {link(parent)}
            </div>
          )}
          <h3>
            <T>Direct agents</T> · {children.length}
          </h3>
          {children.length ? (
            <PageList key={t.id} items={children}>
              {link}
            </PageList>
          ) : (
            <p>
              <T>No visible child agents.</T>
            </p>
          )}
          <h3>
            <T>Assigned work</T>
          </h3>
          <p>
            {assigned.size} <T>linked tasks in this branch</T>
          </p>
          {taskRef &&
            (project ? <TaskReference project={project} reference={taskRef} /> : <p>{taskRef}</p>)}
          {t.workflowRun && (
            <p>
              {t.workflowRun.workflow} / {t.workflowRun.step}
            </p>
          )}
          {t.goal && (
            <p>
              {t.goal.objective} · {t.goal.status}
            </p>
          )}
          <PageList items={tasks}>
            {(task) => <p key={task.taskId}>{task.description ?? task.taskId}</p>}
          </PageList>
          {!taskRef && !t.workflowRun && !t.goal && !tasks.length && (
            <p>
              <T>No assignment reported.</T>
            </p>
          )}
          <details onToggle={(e) => setUsageOpen(e.currentTarget.open)}>
            <summary>
              <T>Branch usage · last 7 days</T>
            </summary>
            {usageOpen && (
              <BranchUsage
                env={t.environmentId}
                project={t.projectId}
                ids={family}
                supported={
                  configs.get(t.environmentId)?.environment.capabilities.it3AgentView === true
                }
              />
            )}
          </details>
          <details open={waiting.length > 0}>
            <summary>
              <T>Project attention</T> · {waiting.length}
            </summary>
            <PageList items={waiting}>{link}</PageList>
          </details>
          <details>
            <summary>
              <T>Project conversations</T> · {tree.roots.length}
            </summary>
            <PageList items={tree.roots}>{link}</PageList>
          </details>
        </>
      )}
    </aside>
  );
}
