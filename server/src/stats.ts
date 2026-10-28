import { isV2, mgr, ocRO } from "./db";

export type Usage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  messages: number;
};

function empty(): Usage {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    cost: 0,
    messages: 0,
  };
}

function add(a: Usage, b: Partial<Usage>): Usage {
  a.input += b.input ?? 0;
  a.output += b.output ?? 0;
  a.reasoning += b.reasoning ?? 0;
  a.cacheRead += b.cacheRead ?? 0;
  a.cacheWrite += b.cacheWrite ?? 0;
  a.cost += b.cost ?? 0;
  a.messages += b.messages ?? 0;
  a.total = a.input + a.output + a.reasoning;
  return a;
}

const AGG = `
  IFNULL(SUM(json_extract(data,'$.tokens.input')),0)       AS input,
  IFNULL(SUM(json_extract(data,'$.tokens.output')),0)      AS output,
  IFNULL(SUM(json_extract(data,'$.tokens.reasoning')),0)   AS reasoning,
  IFNULL(SUM(json_extract(data,'$.tokens.cache.read')),0)  AS cacheRead,
  IFNULL(SUM(json_extract(data,'$.tokens.cache.write')),0) AS cacheWrite,
  IFNULL(SUM(json_extract(data,'$.cost')),0)               AS cost,
  COUNT(*)                                                 AS messages
`;

const MESSAGE_TABLE = () => (isV2() ? "session_message" : "message");
const SESSION_TABLE = () => (isV2() ? "session_v2" : "session");
const WHERE_ASSISTANT = () =>
  isV2() ? "type = 'assistant'" : "json_extract(data,'$.role') = 'assistant'";
const WHERE_USER = () => (isV2() ? "type = 'user'" : "json_extract(data,'$.role') = 'user'");
const MODEL_PROVIDER = () => (isV2() ? "$.model.providerID" : "$.providerID");
const MODEL_ID = () => (isV2() ? "$.model.id" : "$.modelID");

/** SQL fragment + params restricting an aggregate to a set of session ids. */
function sessionFilter(ids?: string[]): { sql: string; params: any[] } {
  if (!ids) return { sql: "", params: [] };
  if (!ids.length) return { sql: " AND 1=0", params: [] };
  return { sql: ` AND session_id IN (${ids.map(() => "?").join(",")})`, params: ids };
}

export function usageBySession(sessionIds?: string[]): Map<string, Usage> {
  const map = new Map<string, Usage>();

  // v2 maintains per-session totals on `session_v2`, so reading those 358 rows
  // is ~100x faster than json_extract() over every message.
  if (isV2()) {
    const filter =
      sessionIds && sessionIds.length
        ? ` WHERE id IN (${sessionIds.map(() => "?").join(",")})`
        : sessionIds
          ? " WHERE 1=0"
          : "";
    const rows = ocRO
      .query(
        `SELECT id AS sid, tokens_input AS input, tokens_output AS output,
                tokens_reasoning AS reasoning, tokens_cache_read AS cacheRead,
                tokens_cache_write AS cacheWrite, cost, 0 AS messages
           FROM session_v2${filter}`,
      )
      .all(...(sessionIds ?? [])) as any[];
    for (const r of rows) map.set(r.sid, add(empty(), r));
    return map;
  }

  const f = sessionFilter(sessionIds);
  const rows = ocRO
    .query(
      `SELECT session_id AS sid, ${AGG} FROM ${MESSAGE_TABLE()} WHERE ${WHERE_ASSISTANT()}${f.sql} GROUP BY session_id`,
    )
    .all(...f.params) as any[];
  for (const r of rows) {
    const u = add(empty(), r);
    map.set(r.sid, u);
  }
  return map;
}

const USAGE_AGG = `
  IFNULL(SUM(input),0)       AS input,
  IFNULL(SUM(output),0)      AS output,
  IFNULL(SUM(reasoning),0)   AS reasoning,
  IFNULL(SUM(cache_read),0)  AS cacheRead,
  IFNULL(SUM(cache_write),0) AS cacheWrite,
  IFNULL(SUM(cost),0)        AS cost,
  COUNT(*)                   AS messages
`;

function usageFilter(sessionIds?: string[]): { sql: string; params: any[] } {
  if (!sessionIds) return { sql: "", params: [] };
  if (!sessionIds.length) return { sql: " WHERE 1=0", params: [] };
  return { sql: ` WHERE session_id IN (${sessionIds.map(() => "?").join(",")})`, params: sessionIds };
}

export type UsageRange = { from?: number; to?: number };

function usageRangeFilter(range?: UsageRange): { sql: string; params: any[] } {
  if (!range) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: any[] = [];
  if (range.from != null) {
    parts.push("time_created >= ?");
    params.push(range.from);
  }
  if (range.to != null) {
    parts.push("time_created <= ?");
    params.push(range.to);
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

export function usageByModel(sessionIds?: string[], range?: UsageRange): any[] {
  if (isV2()) {
    const f = usageFilter(sessionIds);
    const r = usageRangeFilter(range);
    const rows = mgr
      .query(
        `SELECT provider_id AS providerID, model_id AS modelID, ${USAGE_AGG}
           FROM msg_usage${f.sql}${r.sql}
          GROUP BY provider_id, model_id ORDER BY cost DESC`,
      )
      .all(...f.params, ...r.params) as any[];
    return rows.map((row) => {
      const u = add(empty(), row);
      return { providerID: row.providerID ?? "unknown", modelID: row.modelID ?? "unknown", ...u };
    });
  }

  const f = sessionFilter(sessionIds);
  const r = usageRangeFilter(range);
  const rows = ocRO
    .query(
      `SELECT json_extract(data,'${MODEL_PROVIDER()}') AS providerID,
              json_extract(data,'${MODEL_ID()}') AS modelID, ${AGG}
       FROM ${MESSAGE_TABLE()} WHERE ${WHERE_ASSISTANT()}${f.sql}${r.sql}
       GROUP BY providerID, modelID ORDER BY cost DESC`,
    )
    .all(...f.params, ...r.params) as any[];
  return rows.map((row) => {
    const u = add(empty(), row);
    return { providerID: row.providerID ?? "unknown", modelID: row.modelID ?? "unknown", ...u };
  });
}

export function usageByDay(sessionIds?: string[], range?: UsageRange): any[] {
  if (isV2()) {
    const f = usageFilter(sessionIds);
    const r = usageRangeFilter(range);
    const rows = mgr
      .query(
        `SELECT day, ${USAGE_AGG}
           FROM msg_usage${f.sql}${r.sql} GROUP BY day ORDER BY day DESC LIMIT 120`,
      )
      .all(...f.params, ...r.params) as any[];
    return rows
      .map((row) => {
        const u = add(empty(), row);
        return { day: row.day, ...u };
      })
      .reverse();
  }

  const f = sessionFilter(sessionIds);
  const r = usageRangeFilter(range);
  const rows = ocRO
    .query(
      `SELECT date(time_created/1000,'unixepoch') AS day, ${AGG}
       FROM ${MESSAGE_TABLE()} WHERE ${WHERE_ASSISTANT()}${f.sql}${r.sql} GROUP BY day ORDER BY day DESC LIMIT 120`,
    )
    .all(...f.params, ...r.params) as any[];
  return rows
    .map((row) => {
      const u = add(empty(), row);
      return { day: row.day, ...u };
    })
    .reverse();
}

const sessionStatsCache = new Map<string, { at: number; data: any }>();

export function sessionStats(sessionId: string) {
  const cached = sessionStatsCache.get(sessionId);
  if (cached && Date.now() - cached.at < 5000) return cached.data;

  const models = usageByModel([sessionId]);
  const totals = empty();
  for (const m of models) add(totals, m);
  const userMessages = (
    ocRO
      .query(
        `SELECT COUNT(*) AS n FROM ${MESSAGE_TABLE()} WHERE session_id = ? AND ${WHERE_USER()}`,
      )
      .get(sessionId) as { n: number }
  ).n;
  const data = { sessionId, totals, userMessages, models };
  sessionStatsCache.set(sessionId, { at: Date.now(), data });
  return data;
}

const aggregateCache = new Map<string, { at: number; data: any }>();

export function aggregateStats(sessionIds?: string[], range?: UsageRange) {
  const key =
    (sessionIds ? [...sessionIds].sort().join(",") : "*") +
    (range ? `|${range.from ?? ""}|${range.to ?? ""}` : "|all");
  const cached = aggregateCache.get(key);
  if (cached && Date.now() - cached.at < 10_000) return cached.data;

  const models = usageByModel(sessionIds, range);
  const totals = empty();
  for (const m of models) add(totals, m);
  const days = usageByDay(sessionIds, range);

  let counts: { sessions: number; archived: number; userMessages: number };
  if (sessionIds) {
    const n = sessionIds.length;
    let archived = 0;
    if (n) {
      const ph = sessionIds.map(() => "?").join(",");
      archived = (
        ocRO
          .query(
            `SELECT COUNT(*) AS n FROM ${SESSION_TABLE()} WHERE time_archived IS NOT NULL AND id IN (${ph})`,
          )
          .get(...sessionIds) as { n: number }
      ).n;
    }
    let userMessages = 0;
    if (n) {
      const ph = sessionIds.map(() => "?").join(",");
      userMessages = (
        ocRO
          .query(
            `SELECT COUNT(*) AS n FROM ${MESSAGE_TABLE()} WHERE ${WHERE_USER()} AND session_id IN (${ph})`,
          )
          .get(...sessionIds) as { n: number }
      ).n;
    }
    counts = { sessions: n, archived, userMessages };
  } else {
    counts = ocRO
      .query(
        `SELECT
           (SELECT COUNT(*) FROM ${SESSION_TABLE()}) AS sessions,
           (SELECT COUNT(*) FROM ${SESSION_TABLE()} WHERE time_archived IS NOT NULL) AS archived,
           (SELECT COUNT(*) FROM ${MESSAGE_TABLE()} WHERE ${WHERE_USER()}) AS userMessages`,
      )
      .get() as any;
  }

  const data = {
    totals: {
      ...totals,
      sessions: counts.sessions,
      archived: counts.archived,
      userMessages: counts.userMessages,
    },
    models,
    days,
  };
  aggregateCache.set(key, { at: Date.now(), data });
  return data;
}
