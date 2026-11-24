import type { TaskPage, ThreadId } from "@t3tools/contracts";
import type * as NodeSqlite from "node:sqlite";

type Roster = NonNullable<TaskPage["roster"]>;
type Seat = Roster["seats"][number]["seat"];

// Read one consistent ledger snapshot. Only compact rows leave the host.
export function projectSeatRoster(
  db: NodeSqlite.DatabaseSync,
  project: string,
  seat: Seat | undefined,
  offset: number,
) {
  const candidates = `WITH attempts AS (
    SELECT tasks.key,body->>'$.title' title,body->>'$.accepted' accepted,body->>'$.comparison' comparison,
      COALESCE(body->>'$.seat', a.value->>'$.guarded.role',
        CASE WHEN body->>'$.protectedImplementation' OR body->>'$.queueStep.guarded' IS NOT NULL THEN 'builder'
        WHEN body->>'$.queueStep.seat'='reviewer' THEN 'reviewer' END) role,
      COALESCE(body->>'$.queueStep.verification','') expected,a.value a,
      NOT EXISTS(SELECT 1 FROM json_each(body,'$.attempts') other WHERE other.value->>'$.stage'!='submitted') submitted
    FROM tasks, json_each(body,'$.attempts') a WHERE project=?),
    work AS (SELECT *,CASE WHEN accepted IS NULL AND (((comparison OR role IN ('designer','architect')) AND submitted) OR a->>'$.guarded.approved'=1) THEN 1 ELSE 0 END decision,
     CASE WHEN accepted IS NULL AND (a->>'$.stage'!='submitted' OR comparison OR role IN ('designer','architect')) THEN 1 ELSE 0 END active FROM attempts WHERE role IS NOT NULL)`;
  const seats = db
    .prepare(
      candidates +
        ` SELECT role,SUM(active) active,COUNT(DISTINCT CASE WHEN decision=1 THEN key END) decisions,SUM(CASE WHEN active AND a->>'$.review.phase'='running' THEN 1 ELSE 0 END) running,
    (SELECT title FROM work x WHERE x.role=w.role AND active ORDER BY decision DESC,a->>'$.updated' DESC,key LIMIT 1) first FROM work w GROUP BY role`,
    )
    .all(project)
    .map((r) => ({
      seat: r.role as Seat,
      first: String(r.first ?? ""),
      active: Number(r.active),
      decisions: Number(r.decisions),
      running: Number(r.running),
    }));
  const rows = seat
    ? db
        .prepare(
          candidates +
            ` SELECT *,role!=? historical FROM work WHERE role=? OR EXISTS (
      SELECT 1 FROM json_each(work.a,'$.guarded.history') h WHERE COALESCE(h.value->>'$.role',substr(h.value->>'$.detail',1,instr(h.value->>'$.detail',' · ')-1))=?)
    ORDER BY (role=? AND active) DESC,decision DESC,a->>'$.updated' DESC,key,a->>'$.number' LIMIT 13 OFFSET ?`,
        )
        .all(project, seat, seat, seat, seat, offset)
    : [];
  const assignments: Roster["assignments"] = rows.slice(0, 12).map((r) => {
    const a = JSON.parse(String(r.a)) as import("@t3tools/contracts").TaskAttempt;
    return {
      seat: seat!,
      key: String(r.key),
      title: String(r.title),
      attempt: a.number,
      stage: r.historical
        ? "handed off"
        : r.accepted !== null
          ? "closed"
          : a.guarded?.stopped
            ? "stopped"
            : a.stage,
      owner: (!r.historical && !a.guarded ? a.owner : null) as ThreadId | null,
      expected: String(r.expected),
      next: a.next,
      hold: a.seatHold ? "Last routing hold · " + a.seatHold : (a.reviewHold ?? ""),
      decision: !!r.decision,
      accepted: r.accepted === a.number,
      updated: a.updated,
    };
  });
  const receipts = db
    .prepare(`SELECT COALESCE(h.value->>'$.role',substr(h.value->>'$.detail',1,instr(h.value->>'$.detail',' · ')-1)) role,
    COUNT(*) turns,SUM(h.value->>'$.pricedUsd') usd, SUM(h.value->>'$.tokens') tokens,
    COUNT(*)-COUNT(h.value->>'$.pricedUsd') unknown FROM tasks,json_each(body,'$.attempts[0].guarded.history') h
    WHERE project=? GROUP BY role`)
    .all(project)
    .flatMap((r) =>
      ["builder", "reviewer", "test-maintainer"].includes(String(r.role))
        ? [
            {
              seat: r.role as Seat,
              turns: Number(r.turns),
              usd: r.usd === null ? null : Number(r.usd),
              tokens: r.tokens === null ? null : Number(r.tokens),
              unknown: Number(r.unknown),
            },
          ]
        : [],
    );
  const events = seat
    ? db
        .prepare(`SELECT e.id,e.key,e.action,e.detail,e.at FROM events e JOIN tasks t ON t.project=e.project AND t.key=e.key
    WHERE e.project=? AND ((t.body->>'$.seat'=? AND e.action IN ('routeSeat','handoff','claim','submit','accept','seatHold')) OR
    (e.action='review' AND (e.detail LIKE ? OR (t.body->>'$.queueStep.seat'='reviewer' AND t.body->>'$.queueStep.guarded' IS NULL AND ?='reviewer'))))
    ORDER BY e.id DESC LIMIT 13 OFFSET ?`)
        .all(project, seat, seat + " · %", seat, offset)
    : [];
  const history = events.slice(0, 12).map((r) => ({
    id: Number(r.id),
    key: String(r.key),
    action: String(r.action),
    detail: String(r.detail),
    at: String(r.at),
  }));
  return {
    roster: { seats, assignments, receipts, history },
    more: rows.length > 12 || events.length > 12,
  };
}
