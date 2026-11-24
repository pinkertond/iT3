import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { BranchUsage } from "./ProjectUsage";
import { useDiffPanelStore } from "~/diffPanelStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";
import { randomUUID } from "~/lib/utils";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  AuthOrchestrationOperateScope,
  type TaskBrief,
  type TaskEdit,
  type TaskAttempt,
  type ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import type { Project } from "~/types";
import { PageList } from "./PageList";
import styles from "./workspaces.module.css";

type Props = {
  thread?: string | undefined;
  project: Project;
  threads: readonly EnvironmentThreadShell[];
  selected?: string | undefined;
  seed?: string | undefined;
  source?: string | undefined;
  onSelect: (key?: string) => void;
};
export function TaskBoard({ project, threads, selected, seed, source, thread, onSelect }: Props) {
  const gt = useGT();
  const recordKey = selected ?? seed;
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(!!seed);
  const [key, setKey] = useState(seed ?? "");
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [ref, setRef] = useState(source ?? "");
  const [steps, setSteps] = useState("");
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useEnvironmentQuery(
    serverEnvironment.it3Tasks({
      environmentId: project.environmentId,
      input: {
        projectId: project.id,
        offset,
        ...(thread ? { threadId: thread as ThreadId } : {}),
        ...(recordKey ? { key: recordKey } : {}),
      },
    }),
  );
  const refresh = query.refresh;
  // Keep the human view current while agents checkpoint through MCP on another client.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refresh server-owned checkpoints while this page is visible
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refreshVisible, 5000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);
  const canWrite = useEnvironmentScope(project.environmentId, AuthOrchestrationOperateScope);
  const command = useAtomCommand(serverEnvironment.it3WriteTask, "update project task");
  const write = async (edit: TaskEdit) => {
    if (busy || !canWrite) return;
    setBusy(true);
    setError("");
    try {
      const result = await command({
        environmentId: project.environmentId,
        input: { projectId: project.id, edit },
      });
      if (result._tag === "Success") {
        setCreating(false);
        onSelect(edit.key);
      } else {
        const reason = Option.getOrNull(Cause.findErrorOption(result.cause));
        setError(
          reason instanceof Error
            ? reason.message
            : gt("The update could not be confirmed. Check the refreshed task before retrying."),
        );
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const current = query.data?.brief;
  const page = (
    <nav className={styles["iw-pager"]}>
      <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 12))}>
        <T>Previous</T>
      </button>
      <span>{Math.floor(offset / 12) + 1}</span>
      <button disabled={!query.data?.more} onClick={() => setOffset(offset + 12)}>
        <T>Next</T>
      </button>
    </nav>
  );
  return (
    <section aria-label={gt("Task board")}>
      <div className={styles["iw-title"]}>
        <h2>{current?.title ?? gt("Tasks")}</h2>
        {recordKey ? (
          <button onClick={() => onSelect()}>
            <T>All tasks</T>
          </button>
        ) : (
          <button disabled={!canWrite} onClick={() => setCreating(!creating)}>
            {creating ? gt("Cancel") : gt("New task")}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {query.error && <p role="alert">{query.error}</p>}
      {!selected && !current && creating && (
        <form
          className={styles["task-form"]}
          onSubmit={(e) => {
            e.preventDefault();
            void write({
              key: key.trim(),
              attempt: 1,
              generation: 0,
              revision: 0,
              requestId: randomUUID(),
              change: {
                action: "create",
                title: title.trim(),
                request: request.trim(),
                reference: ref.trim(),
                comparison: compare,
                steps: steps
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => ({ title: s, done: false })),
              },
            });
          }}
        >
          <label>
            <T>Task ID</T>
            <input
              required
              pattern="[\p{L}\p{N}][\p{L}\p{N}._:\/\-]*"
              maxLength={160}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label>
            <T>Title</T>
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            <T>Original request</T>
            <textarea
              required
              maxLength={4000}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </label>
          <label>
            <T>Specification link or repository path</T>
            <input maxLength={1000} value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label>
            <T>Subtasks, one per line</T>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} />
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => setCompare(e.target.checked)}
              />{" "}
              <T>Compare two attempts in separate worktrees</T>
            </span>
          </label>
          <button disabled={busy || !canWrite}>
            <T>Create task</T>
          </button>
        </form>
      )}
      {!recordKey && thread && (
        <p>
          {gt("Conversation")} · {threads.find((t) => t.id === thread)?.title ?? thread}
        </p>
      )}
      {!recordKey && (
        <>
          {query.data?.tasks.map((t) => (
            <button className={styles["iw-row"]} key={t.key} onClick={() => onSelect(t.key)}>
              <span>
                <strong>{t.title}</strong>
                <small>{t.key}</small>
              </span>
              <small>
                {t.stage} {t.owner}
              </small>
            </button>
          ))}
          {query.data && !query.data.tasks.length && (
            <p>
              <T>No tasks on this page.</T>
            </p>
          )}
          {(offset > 0 || query.data?.more) && page}
        </>
      )}
      {selected && query.data && !current && (
        <p role="status">
          <T>Task not found in this project.</T>
        </p>
      )}
      {current && recordKey && (
        <>
          <p className={styles["iw-secondary"]}>
            {current.key} ·{" "}
            {current.accepted
              ? gt("Accepted attempt") + " " + current.accepted
              : current.comparison
                ? gt("Comparing two attempts")
                : gt("Single attempt")}
          </p>
          <div className={styles["task-attempts"]}>
            {current.attempts.map((a) => (
              <Attempt
                key={a.number}
                contributors={
                  query.data?.contributors
                    .filter((c) => c.attempt === a.number)
                    .map((c) => c.threadId) ?? []
                }
                task={current}
                attempt={a}
                threads={threads}
                project={project}
                disabled={!canWrite || busy}
                write={write}
              />
            ))}
          </div>
          <details>
            <summary>
              <T>Request and specification</T>
            </summary>
            <p>{current.request}</p>
            {/^https?:\/\//i.test(current.reference) ? (
              <a href={current.reference} target="_blank" rel="noreferrer">
                {current.reference}
              </a>
            ) : (
              <TaskSource project={project} path={current.reference} />
            )}
          </details>
          <details>
            <summary>
              <T>Task history</T>
            </summary>
            {query.data?.events.map((e) => (
              <div key={e.id} className={styles["iw-row"]}>
                <span>
                  <strong>
                    {e.threadId ? (
                      <Link
                        to="/$environmentId/$threadId"
                        params={{ environmentId: project.environmentId, threadId: e.threadId }}
                        search={{ team: true }}
                      >
                        {e.actor} ↗
                      </Link>
                    ) : (
                      e.actor
                    )}{" "}
                    · {e.action}
                  </strong>
                  <small>{e.detail}</small>
                  <small>
                    {new Date(e.at).toLocaleString()} · {gt("Attempt")} {e.attempt}
                  </small>
                </span>
              </div>
            ))}
            {(offset > 0 || query.data?.more) && page}
          </details>
        </>
      )}
      {!query.data && !query.error && (
        <p role="status">
          <T>Loading tasks…</T>
        </p>
      )}
    </section>
  );
}
function Attempt({
  contributors,
  task,
  attempt: a,
  threads,
  project,
  disabled,
  write,
}: {
  contributors: readonly ThreadId[];
  task: TaskBrief;
  attempt: TaskAttempt;
  threads: readonly EnvironmentThreadShell[];
  project: Project;
  disabled: boolean;
  write: (edit: TaskEdit) => Promise<void>;
}) {
  const gt = useGT();
  const [usage, setUsage] = useState(false);
  const [target, setTarget] = useState("");
  const [next, setNext] = useState("");
  const change = (c: TaskEdit["change"]) =>
    write({
      key: task.key,
      attempt: a.number,
      revision: a.revision,
      generation: a.generation,
      requestId: randomUUID(),
      change: c,
    });
  const owner = threads.find((t) => t.id === a.owner);
  return (
    <article className={styles["task-attempt"]}>
      <h3>
        {gt("Attempt")} {a.number} · {a.stage}
      </h3>
      <p>
        {a.owner ? (
          <Link
            to="/$environmentId/$threadId"
            params={{ environmentId: project.environmentId, threadId: a.owner }}
            search={{ team: true }}
          >
            {owner?.title ?? a.ownerTitle} ↗
          </Link>
        ) : (
          gt("Unclaimed")
        )}{" "}
        {a.model && " · " + a.model}
      </p>
      <dl>
        <dt>
          <T>Last checkpoint</T>
        </dt>
        <dd>{a.checkpoint || gt("Awaiting first checkpoint")}</dd>
        <dt>
          <T>Next action</T>
        </dt>
        <dd>{a.next || gt("No next action")}</dd>
      </dl>
      {a.recovery && (
        <section aria-label={gt("Recovery brief")}>
          <h4>
            <T>Recovery brief</T>
          </h4>
          <p>
            {a.recovery.observed === "stopped"
              ? gt("Previous turn stopped")
              : a.recovery.observed === "busy"
                ? gt("Previous chat was busy")
                : gt("Previous turn status unknown")}{" "}
            · {new Date(a.recovery.captured).toLocaleString()}
          </p>
          {a.recovery.compared ? (
            <>
              <strong>
                {a.recovery.total} <T>file changes since the last claim or checkpoint</T>
              </strong>
              <PageList items={a.recovery.changes}>
                {(f) => (
                  <p key={f.path}>
                    <code>{f.path}</code> ·{" "}
                    {f.declared ? gt("Intended") : gt("Outside intended files")}
                  </p>
                )}
              </PageList>
              {a.recovery.total > a.recovery.changes.length && (
                <p>
                  <T>Showing the first 64 paths. Review the snapshot for the full diff.</T>
                </p>
              )}
            </>
          ) : (
            <p>
              <T>File comparison unavailable. Verify the checkout before continuing.</T>
            </p>
          )}
          {a.recovery.snapshot && (
            <details>
              <summary>
                <T>Recover in a separate worktree</T>
              </summary>
              <p>
                <T>
                  From this repository, create a new worktree from the inspected snapshot. Open a
                  chat in it and choose it as the recipient.
                </T>
              </p>
              <code>
                git worktree add --detach ../it3-recovery-{a.recovery.snapshot.slice(-8)}{" "}
                {a.recovery.snapshot}
              </code>
              <p>
                <T>
                  The snapshot covers files captured by Git. Verify ignored files and external
                  changes separately.
                </T>
              </p>
            </details>
          )}
        </section>
      )}
      {a.stage === "working" && (
        <button disabled={disabled} onClick={() => void change({ action: "inspect" })}>
          <T>Inspect interrupted work</T>
        </button>
      )}
      {a.delivery !== "none" && (
        <small>
          {gt("Handoff")} · {a.delivery}
        </small>
      )}
      <details>
        <summary>
          {a.steps.filter((s) => s.done).length}/{a.steps.length} <T>subtasks</T> · {a.files.length}{" "}
          <T>intended files</T>
        </summary>
        <PageList items={a.steps}>
          {(s) => (
            <p key={s.title}>
              {s.done ? "☑" : "☐"} {s.title}
            </p>
          )}
        </PageList>
        <PageList items={a.files}>
          {(f) => (
            <p key={f}>
              <code>{f}</code>
            </p>
          )}
        </PageList>
        {a.worktree && <p>{a.worktree}</p>}
      </details>
      {a.owner && a.hasClaimed && (
        <Link
          to="/$environmentId/$threadId"
          params={{ environmentId: project.environmentId, threadId: a.owner }}
          onClick={() => {
            if (a.owner) {
              const target = { environmentId: project.environmentId, threadId: a.owner };
              useDiffPanelStore.getState().selectGitScope(target, "branch");
              useRightPanelStore.getState().open(target, "diff");
            }
          }}
        >
          <T>Review changes in chat</T> ↗
        </Link>
      )}
      {!!contributors.length && (
        <details onToggle={(e) => setUsage(e.currentTarget.open)}>
          <summary>
            <T>Participating chats · 7-day usage</T>
          </summary>
          {usage && (
            <BranchUsage
              env={project.environmentId}
              project={project.id}
              ids={new Set(contributors)}
              supported
            />
          )}
          <small>
            <T>Includes other work in these chats.</T>
          </small>
        </details>
      )}
      {a.verification && (
        <p>
          <strong>
            <T>Verification</T>
          </strong>{" "}
          · {a.verification}
        </p>
      )}
      {!task.accepted && a.stage !== "submitted" && (
        <details>
          <summary>
            <T>Assign or hand off</T>
          </summary>
          <form
            className={styles["task-form"]}
            onSubmit={(e) => {
              e.preventDefault();
              void change({ action: "handoff", target: target as ThreadId, next: next.trim() });
            }}
          >
            <label>
              <T>Receiving chat</T>
              <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{gt("Choose a conversation")}</option>
                {threads
                  .filter((t) => !t.deletedAt && !t.archivedAt && t.id !== a.owner)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <T>Next action for the recipient</T>
              <textarea
                required
                maxLength={4000}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <button disabled={disabled}>
              <T>Assign and notify</T>
            </button>
          </form>
        </details>
      )}
      {a.stage === "assigned" && a.delivery === "saved" && (
        <button disabled={disabled} onClick={() => void change({ action: "notify" })}>
          <T>Retry delivery</T>
        </button>
      )}
      {task.comparison && !task.accepted && task.attempts.every((x) => x.stage === "submitted") && (
        <button disabled={disabled} onClick={() => void change({ action: "accept" })}>
          <T>Accept this attempt</T>
        </button>
      )}
    </article>
  );
}

function TaskSource({ project, path }: { project: Project; path: string }) {
  const [open, setOpen] = useState(false);
  const safe =
    !!path &&
    !/[\\:\x00-\x1f]/.test(path) &&
    path.split("/").every((s) => s && s !== ".." && s !== ".");
  const file = useProjectFileQuery(
    project.environmentId,
    project.workspaceRoot,
    open && safe ? path : null,
    open && safe,
  );
  if (!safe) return <p>{path}</p>;
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{path}</summary>
      {file.error ? (
        <p role="alert">{file.error}</p>
      ) : (
        <pre className={styles["task-source"]}>{file.data?.contents}</pre>
      )}
    </details>
  );
}
