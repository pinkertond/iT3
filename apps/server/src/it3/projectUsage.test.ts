import { expect, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { readProjectUsageOwners } from "./projectUsage.ts";

it.effect("maps strong session IDs only to a unique live owner, across projects", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT, project_id TEXT, deleted_at TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_provider_threads(thread_id TEXT, driver TEXT, payload_json TEXT)`;
    yield* sql`INSERT INTO orchestration_v2_projection_threads VALUES ('a','A',NULL),('b','B',NULL),('d','A','deleted')`;
    for (const [owner, native, strength] of [
      ["a", "owned", "strong"],
      ["a", "shared", "strong"],
      ["b", "shared", "strong"],
      ["a", "unknown", "weak"],
      ["d", "deleted", "strong"],
    ]) {
      yield* sql`INSERT INTO orchestration_v2_projection_provider_threads VALUES (${owner ?? ""},'claudeAgent',json_object('nativeThreadRef',json_object('nativeId',${native ?? ""},'strength',${strength ?? ""})))`;
    }
    const owners = yield* readProjectUsageOwners(sql, ProjectId.make("A"));
    expect([...owners]).toEqual([["claude\nowned", "a"]]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
