import { useEffect, useState, useId } from "react";
import { Link } from "@tanstack/react-router";
import { useGT, T } from "gt-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  AuthOrchestrationReadScope,
  AuthSettingsWriteScope,
  type ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { Project } from "~/types";
import { useServerConfigs } from "~/state/entities";
import { useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { serverEnvironment } from "~/state/server";
import { agentTree, working, needsAttention } from "./agentTree";
import { BranchUsage } from "./ProjectUsage";
import { useSeatRoutes, specialist, type RosterRole } from "./seatRoutes";
import styles from "./workspaces.module.css";

export function ProjectRoster({
  project,
  threads,
}: {
  project: Project;
  threads: readonly EnvironmentThreadShell[];
}) {
  const helpId = useId();
  const seatRoutes = useSeatRoutes();
  const gt = useGT(),
    env = project.environmentId,
    config = useServerConfigs().get(env);
  const place = config?.settings.it3Workspaces?.projects?.[project.id];
  const read = useEnvironmentScope(env, AuthOrchestrationReadScope),
    writable = useEnvironmentScope(env, AuthSettingsWriteScope);
  const [selected, select] = useState<RosterRole | null>(null),
    [offset, page] = useState(0),
    [saving, save] = useState(false),
    [error, fail] = useState("");
  const write = useAtomCommand(serverEnvironment.updateSettings, "bind project seat");
  const q = useEnvironmentQuery(
    read
      ? serverEnvironment.it3Tasks({
          environmentId: env,
          input: {
            projectId: project.id,
            roster: true,
            offset,
            ...(selected ? { rosterSeat: selected } : {}),
          },
        })
      : null,
  );
  const refresh = q.refresh;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- other project clients and agents write to this host ledger.
  useEffect(() => {
    if (!read) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, read]);
  const tree = agentTree(
    threads.filter((t) => t.environmentId === env && t.projectId === project.id),
  );
  const home = { env, project: project.id },
    snapshot = q.data?.roster;
  const taskLink = (key: string, title: string) => (
    <Link to="/workspaces" search={{ ...home, view: "tasks", task: key }}>
      {title}
    </Link>
  );
  return (
    <section className={styles["seat-roster"]} aria-label={gt("Project team roster")}>
      <h3>
        <T>Project team</T>
      </h3>
      {q.error && <p role="alert">{q.error}</p>}
      {!read && (
        <small>
          <T>Orchestration read access is required to see assignments.</T>
        </small>
      )}
      {(Object.keys(seatRoutes) as RosterRole[]).map((role) => {
        const def = seatRoutes[role],
          manual = specialist(role),
          bound = manual
            ? place?.seats?.[role]
            : role === "reviewer"
              ? place?.queuePolicy?.reviewer
              : null;
        const occupant = bound ? tree.byId.get(bound) : undefined,
          summary = snapshot?.seats.find((s) => s.seat === role),
          receipt = snapshot?.receipts?.find((s) => s.seat === role);
        const open = selected === role;
        return (
          <div key={role} className={styles["seat-card"]}>
            <button
              className={styles["seat-heading"]}
              aria-expanded={open}
              onClick={() => {
                select(open ? null : role);
                page(0);
                fail("");
              }}
            >
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span>
                <strong>{def.name}</strong>
                <small>{def.purpose}</small>
              </span>
              <span>
                <small>
                  {occupant
                    ? occupant.title
                    : bound
                      ? gt("Chat unavailable")
                      : manual || role === "reviewer"
                        ? gt("Vacant")
                        : gt("Per-turn agent")}
                </small>
                {occupant && (
                  <small>
                    {needsAttention(occupant)
                      ? gt("Needs input")
                      : working(occupant)
                        ? gt("Working")
                        : gt("Idle")}{" "}
                    · {tree.activeBelow.get(occupant.id) ?? 0} <T>working below</T>
                  </small>
                )}
              </span>
            </button>
            {summary?.active ? (
              <p>
                {summary.first} {summary.active > 1 && " +" + (summary.active - 1)}{" "}
                {summary.decisions > 0 && (
                  <strong>
                    {" "}
                    · <T>Needs decision</T>
                  </strong>
                )}{" "}
                {summary.running > 0 && (
                  <small>
                    {" "}
                    · {summary.running} <T>running</T>
                  </small>
                )}
              </p>
            ) : null}
            {open && (
              <div className={styles["seat-detail"]}>
                <p>
                  {def.deliverable} → {def.next}
                </p>
                {manual && (
                  <>
                    <label>
                      <T>Seat occupant</T>
                      <select
                        aria-describedby={helpId}
                        disabled={!writable || saving}
                        value={bound ?? ""}
                        onChange={async (e) => {
                          const id = e.target.value as ThreadId;
                          save(true);
                          fail("");
                          try {
                            const result = await write({
                              environmentId: env,
                              input: {
                                patch: {
                                  it3Workspaces: {
                                    projects: { [project.id]: { seats: { [role]: id || null } } },
                                  },
                                },
                              },
                            });
                            if (result._tag !== "Success")
                              fail(gt("Could not save the seat binding."));
                          } finally {
                            save(false);
                          }
                        }}
                      >
                        <option value="">{gt("Vacant")}</option>
                        {bound &&
                          !tree.rows.some(
                            (t) =>
                              t.id === bound &&
                              t.interactionMode === "plan" &&
                              ["auto", "approval-required"].includes(t.runtimeMode),
                          ) && (
                            <option value={bound}>
                              {occupant?.title ?? bound} · {gt("Unavailable for dispatch")}
                            </option>
                          )}
                        {tree.rows
                          .filter(
                            (t) =>
                              t.interactionMode === "plan" &&
                              ["auto", "approval-required"].includes(t.runtimeMode),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <small id={helpId}>
                      <T>
                        Choose a project Plan chat with Auto or approval-required permissions. Route
                        an existing attempt to transfer its checkpoint.
                      </T>
                    </small>
                  </>
                )}
                {role === "reviewer" && (
                  <Link to="/workspaces" search={{ ...home, view: "queue" }}>
                    <T>Configure Reviewer in queue policy</T>
                  </Link>
                )}
                {occupant && (
                  <Link
                    to="/$environmentId/$threadId"
                    params={{ environmentId: env, threadId: occupant.id }}
                    search={{ team: true }}
                  >
                    <T>Open seat chat</T> ↗
                  </Link>
                )}
                {error && <p role="alert">{error}</p>}
                {receipt && (
                  <p>
                    {receipt.turns} <T>protected turns</T> ·{" "}
                    {receipt.tokens?.toLocaleString() ?? gt("Unknown")} <T>reported tokens</T> ·{" "}
                    {receipt.usd === null ? gt("Cost unavailable") : "$" + receipt.usd.toFixed(4)}
                    {receipt.unknown > 0 && (
                      <>
                        {" "}
                        · {receipt.unknown} <T>unpriced</T>
                      </>
                    )}
                  </p>
                )}
                {occupant && (
                  <details>
                    <summary>
                      <T>Occupant chat usage</T>
                    </summary>
                    <BranchUsage
                      env={env}
                      project={project.id}
                      ids={new Set([occupant.id])}
                      supported={!!config?.environment.capabilities.it3AgentView}
                    />
                  </details>
                )}
                <h4>
                  <T>Assignments</T>
                </h4>
                {snapshot?.assignments.map((a) => (
                  <div key={JSON.stringify([a.key, a.attempt])}>
                    {taskLink(a.key, a.title)}{" "}
                    <small>
                      · {a.attempt} · {a.stage} {a.decision && " · " + gt("Needs decision")}{" "}
                      {a.owner && " · " + (tree.byId.get(a.owner)?.title ?? a.owner)}
                    </small>
                    <p>{a.hold || a.next || a.expected}</p>
                  </div>
                ))}
                {!snapshot?.assignments.length && (
                  <small>
                    {q.isPending ? gt("Loading…") : gt("No recorded assignments on this page.")}
                  </small>
                )}
                {!!snapshot?.history?.length && (
                  <details>
                    <summary>
                      <T>Handoff history</T>
                    </summary>
                    {snapshot.history.map((e) => (
                      <p key={e.id ?? JSON.stringify([e.key, e.at, e.action, e.detail])}>
                        {taskLink(e.key, e.key)} · {e.detail}
                        <small>{new Date(e.at).toLocaleString()}</small>
                      </p>
                    ))}
                  </details>
                )}
                {(offset > 0 || q.data?.more) && (
                  <div>
                    <button disabled={!offset} onClick={() => page(offset - 12)}>
                      <T>Previous</T>
                    </button>{" "}
                    <button disabled={!q.data?.more} onClick={() => page(offset + 12)}>
                      <T>Next</T>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
