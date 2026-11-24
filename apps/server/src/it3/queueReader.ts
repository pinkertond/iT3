import { TaskLedgerError, UsageDay } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/sql/SqlClient";
import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as UsageService from "../usage/UsageService.ts";
import { readProjectUsageOwners } from "./projectUsage.ts";
import { activeQueueProjects } from "./queuePreview.ts";
import { readQueueAttempts } from "./taskLedger.ts";
export const makeQueueReader = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig,
    projectStore = yield* ProjectStore.ProjectStoreV2,
    providerRegistry = yield* ProviderRegistry.ProviderRegistry,
    serverSettings = yield* ServerSettings.ServerSettingsService,
    usage = yield* UsageService.UsageService,
    sql = yield* SqlClient.SqlClient;
  return Effect.fn("it3.queue.read")(function* (offset = 0, reviewerOnly = false) {
    const settings = yield* serverSettings.getSettings.pipe(
      Effect.mapError(() => new TaskLedgerError({ detail: "Could not read queue policy." })),
    );
    const projects = yield* projectStore
      .listShells()
      .pipe(
        Effect.mapError(
          () => new TaskLedgerError({ detail: "Could not read projects for the queue." }),
        ),
      );
    const attempts = yield* readQueueAttempts(config.stateDir);
    const providers = yield* providerRegistry.getProviders;
    const day = UsageDay.make(DateTime.formatIso(yield* DateTime.now).slice(0, 10));
    const paidProjects = new Set(
      attempts
        .filter(
          (a) =>
            (!reviewerOnly || a.step?.seat === "reviewer") &&
            (a.stage === "ready" || (a.stage === "assigned" && a.step?.seat)) &&
            a.step &&
            a.step.route !== "check",
        )
        .map((a) => a.projectId),
    );
    const reports = yield* Effect.forEach(
      activeQueueProjects(projects, settings).filter(
        (p) => paidProjects.has(p.id) && settings.it3Workspaces?.projects?.[p.id]?.queuePolicy,
      ),
      (p) =>
        readProjectUsageOwners(sql, p.id).pipe(
          Effect.flatMap((owners) =>
            usage.readSummary(
              { it3ProjectId: p.id, timeZone: "UTC", sinceDay: day, untilDay: day },
              owners,
            ),
          ),
          Effect.orElseSucceed(() => null),
          Effect.map((report) => [p.id, report] as const),
        ),
      { concurrency: 2 },
    );
    return {
      projects,
      settings,
      attempts,
      providers,
      reports: new Map(reports),
      offset,
      asOf: DateTime.formatIso(yield* DateTime.now),
    };
  });
});
