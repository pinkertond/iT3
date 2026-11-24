import { useNowMinute } from "~/hooks/useNowMinute";
import {
  AuthDiagnosticsReadScope,
  UsageDay,
  type UsageBucket,
  type ThreadId,
  type ProjectId,
  type EnvironmentId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { T, useGT } from "gt-react";
import { useState } from "react";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironmentScope } from "~/state/session";
import { serverEnvironment } from "~/state/server";
import { PageList } from "./PageList";
import { agentTree } from "./agentTree";
import styles from "./workspaces.module.css";

function aggregate(rows: readonly UsageBucket[], key: (row: UsageBucket) => string) {
  const groups = new Map<
    string,
    { tokens: number; cost: number; unpriced: number; records: number }
  >();
  for (const r of rows) {
    const k = key(r);
    const v = groups.get(k) ?? { tokens: 0, cost: 0, unpriced: 0, records: 0 };
    v.tokens +=
      r.totals.uncachedInputTokens +
      r.totals.cachedInputTokens +
      r.totals.cacheCreationTokens +
      r.totals.outputTokens;
    v.cost += r.costUsd;
    v.unpriced += r.unpricedRecords;
    v.records += r.records;
    groups.set(k, v);
  }
  return groups;
}
const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
function useReport(env: EnvironmentId, project: ProjectId, windowDays: number, supported: boolean) {
  const canRead = useEnvironmentScope(env, AuthDiagnosticsReadScope);
  const today = new Date(useNowMinute());
  const day = (offset: number) =>
    UsageDay.make(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset))
        .toISOString()
        .slice(0, 10),
    );
  const q = useEnvironmentQuery(
    !supported || !canRead
      ? null
      : serverEnvironment.usageSummary({
          environmentId: env,
          input: {
            it3ProjectId: project,
            timeZone: "UTC",
            sinceDay: day(windowDays - 1),
            untilDay: day(0),
          },
        }),
  );
  const data = q.data?.it3ProjectId === project ? q.data : null;
  return { canRead, q, data };
}
export function BranchUsage({
  env,
  project,
  ids,
  supported,
}: {
  env: EnvironmentId;
  project: ProjectId;
  ids: ReadonlySet<ThreadId>;
  supported: boolean;
}) {
  const gt = useGT();
  const { canRead, data, q } = useReport(env, project, 7, supported);
  if (!supported || !canRead)
    return (
      <p>
        <T>Project usage requires an updated host and diagnostics access.</T>
      </p>
    );
  if (!data)
    return (
      <p>
        {q.error ??
          (q.data ? gt("Host did not confirm project attribution.") : gt("Reading usage…"))}
      </p>
    );
  const buckets = data.buckets.filter((r) => r.it3ThreadId && ids.has(r.it3ThreadId));
  const models = Array.from(aggregate(buckets, (r) => r.provider + " / " + r.model)).sort(
    (a, b) => b[1].tokens - a[1].tokens,
  );
  if (!models.length)
    return (
      <p>
        <T>No attributable usage in this period.</T>
      </p>
    );
  const total = aggregate(buckets, () => "all").get("all")!;
  return (
    <>
      <p>
        {total.tokens.toLocaleString()} <T>tokens</T> ·{" "}
        {total.unpriced === total.records ? gt("Unpriced") : usd.format(total.cost)}
      </p>
      <p>
        {total.unpriced} <T>unpriced records</T>
      </p>
      <PageList items={models}>
        {([model, v]) => (
          <p key={model}>
            {model} · {v.tokens.toLocaleString()}
          </p>
        )}
      </PageList>
    </>
  );
}
export function ProjectUsage({
  env,
  project,
  threads,
  agent,
  supported,
  refs,
}: {
  env: EnvironmentId;
  project: ProjectId;
  threads: readonly EnvironmentThreadShell[];
  agent?: string | undefined;
  supported: boolean;
  refs: Readonly<Record<ThreadId, string | null>>;
}) {
  const gt = useGT();
  const [windowDays, setWindowDays] = useState(7);
  const [group, setGroup] = useState("model");
  const [selected, setSelected] = useState(agent ?? "");
  const [subtree, setSubtree] = useState(true);
  const { canRead, q, data } = useReport(env, project, windowDays, supported);
  const tree = agentTree(threads);
  const ids = new Set<string>([selected]);
  if (subtree)
    for (const id of ids)
      for (const child of tree.children.get(id as ThreadId) ?? []) ids.add(child.id);
  const rows = (data?.buckets ?? []).filter(
    (b) => b.it3ThreadId && (!selected || ids.has(b.it3ThreadId)),
  );
  const totals = aggregate(rows, () => "all").get("all");
  const names = new Map(threads.map((t) => [t.id, t.title]));
  const groups = Array.from(
    aggregate(rows, (r) =>
      group === "day"
        ? r.day
        : group === "model"
          ? r.provider + " / " + r.model
          : group === "task"
            ? (refs[r.it3ThreadId!] ?? gt("Unassigned"))
            : r.it3ThreadId!,
    ),
  );
  groups.sort((a, b) =>
    group === "day" ? b[0].localeCompare(a[0]) : b[1].cost - a[1].cost || b[1].tokens - a[1].tokens,
  );
  return (
    <section>
      <div className={styles["iw-title"]}>
        <h2>
          <T>Project usage</T>
        </h2>
        <button onClick={q.refresh} disabled={!supported || !canRead}>
          <T>Refresh</T>
        </button>
      </div>
      <div className={styles["iw-filters"]}>
        <label>
          <T>Period (UTC)</T>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {n} {gt("days")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>Conversation</T>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{gt("Whole project")}</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>Group by</T>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="model">{gt("Model")}</option>
            <option value="day">{gt("Day")}</option>
            <option value="agent">{gt("Conversation")}</option>
            <option value="task">{gt("Task reference")}</option>
          </select>
        </label>
        {selected && (
          <label>
            <input
              type="checkbox"
              checked={subtree}
              onChange={(e) => setSubtree(e.target.checked)}
            />
            <T>Include visible subagents</T>
          </label>
        )}
      </div>
      {!supported ? (
        <p>
          <T>Update this host for project usage.</T>
        </p>
      ) : !canRead ? (
        <p>
          <T>Diagnostics access is required.</T>
        </p>
      ) : q.error ? (
        <p role="alert">{q.error}</p>
      ) : !data ? (
        <p role="status">
          {q.data ? gt("Host did not confirm project attribution.") : gt("Reading usage…")}
        </p>
      ) : (
        <>
          <p>
            {data.sinceDay} – {data.untilDay} · {gt("Updated")}{" "}
            {new Date(data.readAt).toLocaleTimeString()}
          </p>
          {totals ? (
            <>
              <h3>
                {totals.unpriced === totals.records ? gt("Unpriced") : usd.format(totals.cost)} ·{" "}
                {totals.tokens.toLocaleString()} <T>tokens</T>
              </h3>
              <p>
                {totals.unpriced.toLocaleString()}{" "}
                <T>unpriced records. Costs combine provider reports and model-rate estimates.</T>
              </p>
              <PageList key={[group, selected, windowDays, subtree].join("/")} items={groups}>
                {([label, v]) => (
                  <div className={styles["iw-row"]} key={label}>
                    <span>
                      {group === "agent" ? (names.get(label as ThreadId) ?? label) : label}
                    </span>
                    <small>
                      {v.tokens.toLocaleString()} <T>tokens</T>
                    </small>
                    <strong>
                      {v.unpriced === v.records ? gt("Unpriced") : usd.format(v.cost)}
                    </strong>
                  </div>
                )}
              </PageList>
            </>
          ) : (
            <p>
              <T>No attributable usage in this period.</T>
            </p>
          )}
          <p className={styles["iw-secondary"]}>
            <T>
              Only uniquely matched provider sessions are counted. Task references group a
              conversation’s whole history.
            </T>
          </p>
          {data.sources.some(
            (s) => s.refreshing || s.status === "partial" || s.status === "failed",
          ) && (
            <p role="status">
              <T>Some usage sources are incomplete or refreshing.</T>
            </p>
          )}
        </>
      )}
    </section>
  );
}
