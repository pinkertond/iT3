import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProjectTaskSeat,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ServerSettings from "../serverSettings.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";

it.effect(
  "rechecks active seat, model, permissions, and current binding before committing native dispatch",
  () =>
    Effect.gen(function* () {
      const settingsLayer = ServerSettings.layerTest();
      // Expose the same real, mutable settings service to the test and the harness's private runtime.
      yield* Effect.acquireRelease(
        Effect.sync(() => vi.spyOn(ServerSettings, "layerTest").mockReturnValue(settingsLayer)),
        (spy) => Effect.sync(() => spy.mockRestore()),
      );
      const instanceId = ProviderInstanceId.make("codex"),
        modelSelection = { instanceId, model: "gpt-5.1-codex" };
      const adapter = {
        instanceId,
        driver: ProviderDriverKind.make("codex"),
        getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
        planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
        openSession: () => Effect.die("metadata proof must not start a provider process"),
      } as ProviderAdapter.ProviderAdapterV2["Service"];
      const database = SqlitePersistence.layerMemory;
      const layer = Layer.mergeAll(
        settingsLayer,
        ProjectStore.layer.pipe(Layer.provide(database)),
        ProviderReplayHarness.layerWithRegistry(
          { name: "protected-seat-delivery" },
          ProviderAdapterRegistry.layerFromAdapters([adapter]),
          { databaseLayer: database, runEffectWorker: false },
        ),
      );
      yield* Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2,
          projects = yield* ProjectStore.ProjectStoreV2,
          settings = yield* ServerSettings.ServerSettingsService;
        const projectId = ProjectId.make("studio"),
          thread = ThreadId.make("architect"),
          replacement = ThreadId.make("next-architect"),
          full = ThreadId.make("full-access");
        const at = "2026-11-24T17:00:00.000Z";
        yield* projects.apply({
          sequence: 1,
          eventId: EventId.make("studio-created"),
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: at,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created",
          payload: {
            projectId,
            title: "Studio",
            workspaceRoot: "/tmp/studio",
            defaultModelSelection: modelSelection,
            scripts: [],
            createdAt: at,
            updatedAt: at,
          },
        });
        for (const id of [thread, replacement, full])
          yield* orchestrator.dispatch({
            type: "thread.create",
            commandId: CommandId.make("create-" + id),
            threadId: id,
            projectId,
            title: id,
            modelSelection,
            runtimeMode: id === full ? "full-access" : "approval-required",
            interactionMode: "plan",
            branch: null,
            worktreePath: null,
            createdBy: "user",
            creationSource: "web",
          });
        const bind = (architect: ThreadId | null) =>
          settings.updateSettings({
            it3Workspaces: {
              projects: {
                [projectId]: {
                  seats: { architect },
                  queuePolicy: {
                    priority: "normal",
                    dailyTokens: 10000,
                    dailyUsd: 1,
                    contextTokens: 4000,
                    reservePercent: 10,
                    economy: modelSelection,
                    advanced: null,
                  },
                },
              },
            },
          });
        let serial = 0;
        const send = (
          id: ThreadId,
          role: ProjectTaskSeat = "architect",
          model = modelSelection.model,
          route: "economy" | "advanced" = "economy",
        ) =>
          orchestrator.dispatch({
            type: "message.dispatch",
            projectSeatOnly: role,
            projectSeatRoute: route,
            commandId: CommandId.make("send-" + ++serial),
            threadId: id,
            messageId: MessageId.make("message-" + serial),
            text: "Inspect design",
            attachments: [],
            modelSelection: { instanceId, model },
            dispatchMode: { type: "defer_start" },
            createdBy: "system",
            creationSource: "server",
          });
        const denied = (request: ReturnType<typeof send>) =>
          Effect.gen(function* () {
            const err = yield* Effect.flip(request);
            expect(err._tag).toBe("OrchestratorCommandRejectedError");
            if (err._tag === "OrchestratorCommandRejectedError")
              expect(String(err.cause)).toContain("Project seat");
          });
        const count = (id: ThreadId) =>
          orchestrator
            .getThreadRecords(id, ["runs", "messages"])
            .pipe(Effect.map((x) => [x.runs.length, x.messages.length]));
        yield* bind(thread);
        yield* denied(send(thread, "explorer"));
        yield* denied(send(thread, "architect", "wrong"));
        yield* denied(send(thread, "architect", modelSelection.model, "advanced"));
        expect(yield* count(thread)).toEqual([0, 0]);
        yield* send(thread);
        expect(yield* count(thread)).toEqual([1, 1]);
        yield* bind(replacement);
        yield* denied(send(thread));
        expect(yield* count(thread)).toEqual([1, 1]);
        yield* send(replacement);
        expect(yield* count(replacement)).toEqual([1, 1]);
        yield* bind(null);
        yield* denied(send(replacement));
        expect(yield* count(replacement)).toEqual([1, 1]);
        yield* bind(full);
        yield* denied(send(full));
        expect(yield* count(full)).toEqual([0, 0]);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped),
);
