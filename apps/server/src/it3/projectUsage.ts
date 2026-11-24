import { ThreadId, UsageReadError, type ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { SqlClient } from "effect/sql/SqlClient";

// A provider can expose the same native conversation through several app threads.
// Only attribute sessions with one owner across the environment.
export function readProjectUsageOwners(sql: SqlClient, projectId: ProjectId) {
  return sql<{ driver: string; native_id: string; thread_id: string }>`
    WITH sessions AS (
      SELECT pt.driver, json_extract(pt.payload_json, '$.nativeThreadRef.nativeId') AS native_id,
             t.thread_id, t.project_id, t.deleted_at
      FROM orchestration_v2_projection_provider_threads pt
      JOIN orchestration_v2_projection_threads t ON t.thread_id = pt.thread_id
      WHERE json_extract(pt.payload_json, '$.nativeThreadRef.strength') = 'strong'
    )
    SELECT driver, native_id, MIN(thread_id) AS thread_id FROM sessions
    WHERE native_id IS NOT NULL
    GROUP BY driver, native_id
    HAVING COUNT(DISTINCT thread_id) = 1 AND MIN(project_id) = ${projectId} AND MAX(deleted_at) IS NULL
  `.pipe(
    Effect.map(
      (rows) =>
        new Map(
          rows.map((row) => [
            (row.driver === "claudeAgent" ? "claude" : row.driver) + "\n" + row.native_id,
            ThreadId.make(row.thread_id),
          ]),
        ),
    ),
    Effect.mapError(
      (cause) =>
        new UsageReadError({
          reason: "scanFailed",
          detail: "Could not read project session ownership.",
          cause,
        }),
    ),
  );
}
