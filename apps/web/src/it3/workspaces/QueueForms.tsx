import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useState } from "react";
import { T, useGT } from "gt-react";
import { AuthSettingsWriteScope, type QueuePolicy, type QueueStep } from "@t3tools/contracts";
import type { Project } from "~/types";
import { useAtomCommand } from "~/state/use-atom-command";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { useEnvironmentProviders } from "~/state/environments";
import styles from "./workspaces.module.css";

function Amount({
  name,
  label,
  value,
  fraction,
  max,
  optional,
}: {
  name: string;
  label: string;
  value: number | null;
  fraction?: boolean;
  max?: number;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        name={name}
        min={0}
        max={max}
        step={fraction ? "any" : "1"}
        defaultValue={value ?? ""}
        required={!optional}
      />
    </label>
  );
}
const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const number = (d: FormData, k: string) => Number(field(d, k));
function priority(value: string): QueuePolicy["priority"] {
  return value === "urgent" || value === "background" ? value : "normal";
}
function Priority({ value, inherit }: { value: string; inherit?: boolean }) {
  return (
    <label>
      <T>Priority</T>
      <select name="priority" defaultValue={value}>
        {inherit && (
          <option value="">
            <T>Use project priority</T>
          </option>
        )}
        <option value="urgent">
          <T>Urgent</T>
        </option>
        <option value="normal">
          <T>Normal</T>
        </option>
        <option value="background">
          <T>Background</T>
        </option>
      </select>
    </label>
  );
}

export function QueuePolicyForm({
  project,
  policy,
  onSaved,
  reviewerChats,
}: {
  reviewerChats?: readonly EnvironmentThreadShell[] | undefined;
  project: Project;
  policy: QueuePolicy | null;
  onSaved: () => void;
}) {
  const gt = useGT();
  const writable = useEnvironmentScope(project.environmentId, AuthSettingsWriteScope);
  const providers = useEnvironmentProviders().get(project.environmentId) ?? [];
  const routes = providers.flatMap((p) =>
    p.models.map((m) => ({ instanceId: p.instanceId, model: m.slug })),
  );
  const write = useAtomCommand(serverEnvironment.updateSettings, "project queue policy");
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const key = (route: QueuePolicy["economy"]) =>
    route ? JSON.stringify([route.instanceId, route.model]) : "";
  const save = async (next: QueuePolicy | null) => {
    setSaving(true);
    try {
      const result = await write({
        environmentId: project.environmentId,
        input: { patch: { it3Workspaces: { projects: { [project.id]: { queuePolicy: next } } } } },
      });
      setMessage(
        result._tag === "Success" ? gt("Queue policy saved.") : gt("Could not save queue policy."),
      );
      if (result._tag === "Success") onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <details>
      <summary>
        <T>Project queue policy</T> · {project.title}
      </summary>
      <form
        key={JSON.stringify(policy)}
        className={styles["iw-form"]}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const route = (k: "economy" | "advanced") =>
            routes.find((r) => key(r) === field(d, k)) ??
            (key(policy?.[k] ?? null) === field(d, k) ? (policy?.[k] ?? null) : null);
          void save({
            ...(reviewerChats
              ? { reviewer: reviewerChats.find((t) => t.id === field(d, "reviewer"))?.id ?? null }
              : {}),
            priority: priority(field(d, "priority")),
            dailyTokens: number(d, "tokens"),
            dailyUsd: field(d, "usd") ? number(d, "usd") : null,
            contextTokens: number(d, "context"),
            reservePercent: number(d, "reserve"),
            economy: route("economy"),
            advanced: route("advanced"),
          });
        }}
      >
        <fieldset disabled={!writable || saving}>
          {reviewerChats && (
            <label>
              <T>Reviewer seat</T>
              <select name="reviewer" defaultValue={policy?.reviewer ?? ""}>
                <option value="">
                  <T>Unbound</T>
                </option>
                {reviewerChats
                  .filter((t) => !t.archivedAt && !t.deletedAt)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <small>
                <T>
                  Choose a Plan chat using the queue model and Auto or approval-required
                  permissions.
                </T>
              </small>
            </label>
          )}
          <Priority value={policy?.priority ?? "normal"} />
          <Amount
            name="tokens"
            label={gt("Daily token budget (UTC)")}
            value={policy?.dailyTokens ?? null}
          />
          <Amount
            name="usd"
            label={gt("Daily USD limit (optional)")}
            value={policy?.dailyUsd ?? null}
            fraction
            optional
          />
          <Amount
            name="context"
            label={gt("Context ceiling per step (tokens)")}
            value={policy?.contextTokens ?? null}
          />
          <Amount
            name="reserve"
            label={gt("Reserve for urgent work (%)")}
            value={policy?.reservePercent ?? 0}
            fraction
            max={100}
          />
          {(["economy", "advanced"] as const).map((tier) => (
            <label key={tier}>
              {tier === "economy" ? gt("Economy model") : gt("Advanced model")}
              <select name={tier} defaultValue={key(policy?.[tier] ?? null)}>
                <option value="">
                  <T>Unconfigured</T>
                </option>
                {policy?.[tier] && !routes.some((r) => key(r) === key(policy[tier])) && (
                  <option value={key(policy[tier])}>
                    {policy[tier].instanceId} / {policy[tier].model}
                  </option>
                )}
                {routes.map((r) => (
                  <option key={key(r)} value={key(r)}>
                    {r.instanceId} / {r.model}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button>
            <T>Save queue policy</T>
          </button>
          {policy && (
            <button type="button" onClick={() => void save(null)}>
              <T>Clear policy</T>
            </button>
          )}
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}

export function QueueStepForm({
  step,
  busy,
  onSave,
  reviewSupported = false,
}: {
  reviewSupported?: boolean | undefined;
  step: QueueStep | null;
  busy: boolean;
  onSave: (step: QueueStep | null) => void;
}) {
  const gt = useGT();
  const [route, setRoute] = useState<QueueStep["route"]>(step?.route ?? "check");
  return (
    <details>
      <summary>
        <T>Queue step</T>
        {step && " · " + step.next}
      </summary>
      <form
        className={styles["iw-form"]}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget),
            tier = field(d, "priority");
          onSave({
            next: field(d, "next"),
            verification: field(d, "verification"),
            ...(reviewSupported && route !== "check" && d.has("reviewer")
              ? { seat: "reviewer" as const }
              : {}),
            priority: tier ? priority(tier) : null,
            route,
            dependencies: Array.from(
              new Set(field(d, "dependencies").split(/\s+/).filter(Boolean)),
            ),
            inputTokens: number(d, "input"),
            outputTokens: number(d, "output"),
            estimatedUsd: field(d, "cost") ? number(d, "cost") : null,
            windowPercent: number(d, "window"),
          });
        }}
      >
        <fieldset disabled={busy}>
          <label>
            <T>Next step</T>
            <input name="next" required maxLength={600} defaultValue={step?.next} />
          </label>
          <label>
            <T>Completion check</T>
            <input name="verification" required maxLength={600} defaultValue={step?.verification} />
          </label>
          <label>
            <T>Prerequisite task IDs in this project (up to 12, separated by spaces)</T>
            <input name="dependencies" defaultValue={step?.dependencies.join(" ")} />
          </label>
          <Priority value={step?.priority ?? ""} inherit />
          <label>
            <T>Execution route</T>
            <select
              value={route}
              onChange={(e) =>
                setRoute(
                  e.target.value === "advanced"
                    ? "advanced"
                    : e.target.value === "economy"
                      ? "economy"
                      : "check",
                )
              }
            >
              <option value="check">
                <T>Deterministic check</T>
              </option>
              <option value="economy">
                <T>Economy model</T>
              </option>
              <option value="advanced">
                <T>Advanced model</T>
              </option>
            </select>
          </label>
          {route !== "check" && (
            <>
              {reviewSupported && (
                <label>
                  <input
                    type="checkbox"
                    name="reviewer"
                    defaultChecked={step?.seat === "reviewer"}
                  />
                  <T>Assign to Reviewer automatically when eligible</T>
                </label>
              )}
              <Amount
                name="input"
                label={gt("Estimated input tokens")}
                value={step?.inputTokens ?? null}
              />
              <Amount
                name="output"
                label={gt("Estimated output tokens")}
                value={step?.outputTokens ?? null}
              />
              <Amount
                name="cost"
                label={gt("Estimated USD")}
                value={step?.estimatedUsd ?? null}
                fraction
                optional
              />
              <Amount
                name="window"
                label={gt("Estimated percentage points used in each provider window")}
                value={step?.windowPercent ?? null}
                fraction
                max={100}
              />
            </>
          )}
          <button>
            <T>Save queue step</T>
          </button>
          {step && (
            <button type="button" onClick={() => onSave(null)}>
              <T>Remove queue step</T>
            </button>
          )}
        </fieldset>
      </form>
    </details>
  );
}
