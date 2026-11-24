import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useEffect, useState } from "react";
import { T, useGT } from "gt-react";
import { Link } from "@tanstack/react-router";
import {
  AuthDiagnosticsReadScope,
  AuthOrchestrationReadScope,
  type QueuePolicy,
} from "@t3tools/contracts";
import { useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import type { Project } from "~/types";
import { QueuePolicyForm } from "./QueueForms";
import styles from "./workspaces.module.css";

const pct = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%";
export function QueuePreview({
  project,
  policy,
  reviewerChats,
}: {
  reviewerChats?: readonly EnvironmentThreadShell[] | undefined;
  project: Project;
  policy: QueuePolicy | null;
}) {
  const gt = useGT(),
    [offset, setOffset] = useState(0);
  const env = project.environmentId;
  const diagnostics = useEnvironmentScope(env, AuthDiagnosticsReadScope),
    read = useEnvironmentScope(env, AuthOrchestrationReadScope);
  const q = useEnvironmentQuery(
    read && diagnostics
      ? serverEnvironment.it3QueuePreview({ environmentId: env, input: { offset } })
      : null,
  );
  const refresh = q.refresh;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refresh host observations while the operator is viewing the preview
  useEffect(() => {
    if (!read || !diagnostics) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh, read, diagnostics]);
  const data = q.data;
  if (!read || !diagnostics)
    return (
      <p>
        <T>The queue requires orchestration and diagnostics read access.</T>
      </p>
    );
  return (
    <section>
      <div className={styles["iw-title"]}>
        <h2>
          <T>Queue preview</T>
        </h2>
        <button disabled={q.isPending} onClick={q.refresh}>
          <T>Refresh</T>
        </button>
      </div>
      <p>
        <T>
          Active projects on this host share one queue. Each estimate shows what would remain if
          that step ran next. Previewing starts no work.
        </T>
      </p>
      <QueuePolicyForm
        reviewerChats={reviewerChats}
        project={project}
        policy={policy}
        onSaved={q.refresh}
      />
      {q.error && <p role="alert">{q.error}</p>}
      {data ? (
        <>
          <p>
            {data.eligible} <T>eligible</T> · {data.total} <T>candidate attempts</T> · {data.day}{" "}
            <T>UTC</T> · <T>Observed</T> {new Date(data.asOf).toLocaleTimeString()}
          </p>
          {!data.total && (
            <p>
              <T>No ready task attempts in active projects.</T>
            </p>
          )}
          {data.rows.map((r, i) => (
            <article
              key={JSON.stringify([r.projectId, r.key, r.attempt])}
              className={styles["task-attempt"]}
            >
              <p>
                <strong>
                  {r.reason === "ready"
                    ? offset + i === 0
                      ? gt("Next up")
                      : gt("Eligible")
                    : gt("Waiting")}
                </strong>{" "}
                · {r.priority} · {r.project}
              </p>
              <Link
                to="/workspaces"
                search={{ env, project: r.projectId, view: "tasks", task: r.key }}
              >
                {r.title}
              </Link>{" "}
              · {r.key} · <T>Attempt</T> {r.attempt}
              <p>{r.detail}</p>
              {r.reviewer && (
                <p>
                  <strong>
                    <T>Reviewer</T>
                  </strong>{" "}
                  · {r.reviewer}
                </p>
              )}
              {r.next && (
                <details>
                  <summary>{r.next}</summary>
                  <p>
                    <T>Completion check</T> · {r.verification}
                  </p>
                </details>
              )}
              {r.model && (
                <p>
                  {r.provider} / {r.model} · {r.input.toLocaleString()} <T>input tokens</T> ·{" "}
                  {r.output.toLocaleString()} <T>output tokens</T>
                  {r.estimatedUsd !== null && (
                    <>
                      {" "}
                      · <T>Estimated cost</T> ${r.estimatedUsd.toFixed(4)}
                    </>
                  )}
                </p>
              )}
              {r.remainingTokens !== null && (
                <p>
                  <T>Projected daily balance</T> · {r.remainingTokens.toLocaleString()}{" "}
                  <T>tokens</T>
                  {r.remainingUsd !== null && " · $" + r.remainingUsd.toFixed(4)}
                </p>
              )}
              {r.windows.length > 0 && (
                <details>
                  <summary>
                    <T>Provider allowance windows</T>
                  </summary>
                  {r.windows.map((w) => (
                    <p key={w.id}>
                      {w.label} · {pct(w.remaining)} <T>remaining</T> → {pct(w.after)} ·{" "}
                      {w.reset
                        ? gt("Resets") + " " + new Date(w.reset).toLocaleString()
                        : gt("Reset unknown")}
                    </p>
                  ))}
                  {r.checkedAt && (
                    <p>
                      <T>Allowance observed</T> · {new Date(r.checkedAt).toLocaleString()}
                    </p>
                  )}
                </details>
              )}
            </article>
          ))}
          {(offset > 0 || data.total > 12) && (
            <nav>
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>
                <T>Previous</T>
              </button>
              <button disabled={offset + 12 >= data.total} onClick={() => setOffset(offset + 12)}>
                <T>Next</T>
              </button>
            </nav>
          )}
        </>
      ) : (
        !q.error && (
          <p role="status">
            <T>Reading queue…</T>
          </p>
        )
      )}
    </section>
  );
}
