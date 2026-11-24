import { useNowMinute } from "~/hooks/useNowMinute";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  AuthDiagnosticsReadScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
} from "@t3tools/contracts";
import type { Project } from "~/types";
import { useThreadShellsForProjectRefs, useServerConfigs } from "~/state/entities";
import { useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { needsAttention } from "./agentTree";
import { PageList } from "./PageList";
import styles from "./workspaces.module.css";

function Since({ at }: { at: string | null | undefined }) {
  const gt = useGT();
  const now = useNowMinute();
  if (!at) return null;
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(at)) / 60000));
  return (
    <time dateTime={at}>
      {minutes < 1 ? gt("Just now") : gt("{minutes} min waiting", { minutes })}
    </time>
  );
}
export function NeedsYou({ projects }: { projects: readonly Project[] }) {
  const gt = useGT();
  const configs = useServerConfigs();
  const chats = useThreadShellsForProjectRefs(
    projects.map((p) => ({ environmentId: p.environmentId, projectId: p.id })),
  ).filter((t) => !t.deletedAt && !t.archivedAt && needsAttention(t));
  const hosts = Array.from(new Set(projects.map((p) => p.environmentId))).filter(
    (id) => configs.get(id)?.environment.capabilities.it3GuardedLoop,
  );
  return (
    <section aria-label={gt("Needs you")}>
      <h2>
        <T>Needs you</T>
      </h2>
      <PageList items={chats}>
        {(t) => (
          <Link
            key={JSON.stringify([t.environmentId, t.id])}
            className={styles["iw-row"]}
            to="/$environmentId/$threadId"
            params={{ environmentId: t.environmentId, threadId: t.id }}
          >
            <span>
              <strong>
                {t.hasPendingApprovals || t.pendingSubagentRequest === "approval"
                  ? gt("Review approval")
                  : gt("Answer question")}{" "}
                · {t.title}
              </strong>
              <small>
                {
                  projects.find((p) => p.id === t.projectId && p.environmentId === t.environmentId)
                    ?.title
                }{" "}
                · <Since at={t.pendingRequestAt} />
              </small>
            </span>
          </Link>
        )}
      </PageList>
      {hosts.map((env) => (
        <HostHolds key={env} env={env} projects={projects} />
      ))}
      {!hosts.length && !chats.length && (
        <p>
          <T>No pending chat requests.</T>
        </p>
      )}
    </section>
  );
}
function HostHolds({ env, projects }: { env: EnvironmentId; projects: readonly Project[] }) {
  const [offset, setOffset] = useState(0);
  const read = useEnvironmentScope(env, AuthOrchestrationReadScope),
    diag = useEnvironmentScope(env, AuthDiagnosticsReadScope);
  const q = useEnvironmentQuery(
    read && diag
      ? serverEnvironment.it3QueuePreview({ environmentId: env, input: { offset } })
      : null,
  );
  const refresh = q.refresh;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refresh persisted host holds only while the inbox is visible
  useEffect(() => {
    if (!read || !diag) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, read, diag]);
  if (!read || !diag)
    return (
      <small>
        <T>Task holds require diagnostics and orchestration read access.</T>
      </small>
    );
  if (q.error) return <p role="alert">{q.error}</p>;
  if (!q.data)
    return (
      <small>
        <T>Checking task holds…</T>
      </small>
    );
  return (
    <>
      {q.data.attention?.map((a) => (
        <Link
          key={JSON.stringify([a.projectId, a.key])}
          className={styles["iw-row"]}
          to="/workspaces"
          search={{ env, project: a.projectId, view: "tasks", task: a.key }}
        >
          <span>
            <strong>{a.title}</strong>
            <small>
              {projects.find((p) => p.id === a.projectId && p.environmentId === env)?.title} ·{" "}
              <Since at={a.since} />
            </small>
            <span>{a.detail}</span>
          </span>
        </Link>
      ))}
      {!q.data.attentionTotal && (
        <small>
          <T>No held tasks on this host.</T>
        </small>
      )}
      {(offset > 0 || (q.data.attentionTotal ?? 0) > 12) && (
        <nav className={styles["iw-pager"]}>
          <button disabled={offset === 0} onClick={() => setOffset(offset - 12)}>
            <T>Previous</T>
          </button>
          <button
            disabled={offset + 12 >= (q.data.attentionTotal ?? 0)}
            onClick={() => setOffset(offset + 12)}
          >
            <T>Next</T>
          </button>
        </nav>
      )}
    </>
  );
}
