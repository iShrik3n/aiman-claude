import { isV2, ocRO, mgr, getSetting, setSetting } from "./db";

type Row = {
  rowid: number;
  id: string;
  message_id?: string;
  session_id: string;
  type?: string;
  data: string;
  time_updated: number;
  time_created?: number;
};

const MAX_TEXT = 20000;
const MAX_TOOL_OUTPUT = 6000;

// Bumping this string forces a one-time reindex (and refills msg_usage).
// v2u = v2 schema + per-message usage table.
const mode = () => (isV2() ? "v2u" : "v1");

/**
 * The index row layout differs between schemas (v1 indexes parts, v2 indexes
 * whole messages), so a database upgrade invalidates the old index. Wipe and
 * rebuild once when the mode changes.
 */
export function ensureFtsMode(): boolean {
  const current = getSetting("fts_mode");
  if (current === mode()) return false;
  mgr.exec("DELETE FROM part_fts");
  mgr.exec("DELETE FROM msg_usage");
  setSetting("fts_mode", mode());
  setSetting("fts_boot_done", "0");
  setSetting("fts_cursor", "0");
  setSetting("fts_last_sync_ms", "0");
  return true;
}

/** Extract indexable text from a v1 part payload. */
export function partText(type: string, d: any): string {
  switch (type) {
    case "text":
    case "reasoning":
      return String(d?.text ?? "").slice(0, MAX_TEXT);
    case "tool": {
      const st = d?.state ?? {};
      const input = st.input ? JSON.stringify(st.input) : "";
      const output = String(st.output ?? st.error ?? "").slice(0, MAX_TOOL_OUTPUT);
      return [d?.tool ?? "", st.status ?? "", st.title ?? "", input, output]
        .filter(Boolean)
        .join("\n");
    }
    case "file":
      return [d?.filename ?? "", d?.url ?? ""].join(" ");
    case "patch":
      return Array.isArray(d?.files) ? d.files.join("\n") : "";
    case "agent":
      return String(d?.name ?? "");
    case "subtask":
      return [d?.description ?? "", d?.prompt ?? ""].join("\n");
    default:
      return "";
  }
}

function toolText(item: any): string {
  const st = item?.state ?? {};
  const input = st?.input ? JSON.stringify(st.input) : "";
  const content = Array.isArray(st?.content)
    ? st.content
        .map((c: any) => (c?.type === "text" ? String(c.text ?? "") : c?.name ?? c?.uri ?? ""))
        .join("\n")
    : "";
  return [item?.name ?? "", st?.status ?? "", input, content].filter(Boolean).join("\n");
}

/** Extract indexable text from a v2 `session_message` payload. */
export function messageText(type: string, d: any): string {
  switch (type) {
    case "user":
    case "system":
    case "synthetic":
    case "skill":
      return String(d?.text ?? "").slice(0, MAX_TEXT);
    case "assistant": {
      const content = Array.isArray(d?.content) ? d.content : [];
      const text = content
        .map((item: any) => {
          if (item?.type === "text" || item?.type === "reasoning") return String(item.text ?? "");
          if (item?.type === "tool") return toolText(item);
          if (item?.type === "file") return String(item.name ?? item.uri ?? "");
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return text.slice(0, MAX_TEXT + MAX_TOOL_OUTPUT);
    }
    case "compaction":
      return String(d?.summary ?? "").slice(0, MAX_TEXT);
    case "shell":
      return [d?.command ?? "", d?.output ?? ""].filter(Boolean).join("\n").slice(0, MAX_TOOL_OUTPUT);
    default:
      return "";
  }
}

const deleteStmt = () => mgr.query("DELETE FROM part_fts WHERE rowid = ?");
const insertStmt = () =>
  mgr.query(
    "INSERT INTO part_fts(rowid, text, part_id, session_id, message_id, type) VALUES(?,?,?,?,?,?)",
  );

const usageStmt = () =>
  mgr.query(
    `INSERT INTO msg_usage(
       message_id, session_id, day, provider_id, model_id,
       input, output, reasoning, cache_read, cache_write, cost, time_created
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(message_id) DO UPDATE SET
       session_id = excluded.session_id,
       day = excluded.day,
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
       input = excluded.input,
       output = excluded.output,
       reasoning = excluded.reasoning,
       cache_read = excluded.cache_read,
       cache_write = excluded.cache_write,
       cost = excluded.cost,
       time_created = excluded.time_created`,
  );

function indexRows(rows: Row[]): void {
  if (!rows.length) return;
  const v2 = isV2();
  const del = deleteStmt();
  const ins = insertStmt();
  const usage = v2 ? usageStmt() : null;
  const tx = mgr.transaction((batch: Row[]) => {
    for (const r of batch) {
      let d: any;
      try {
        d = JSON.parse(r.data);
      } catch {
        continue;
      }
      const type = v2 ? (r.type ?? d?.type ?? "") : (d?.type ?? "");
      const text = v2 ? messageText(type, d) : partText(type, d);
      del.run(r.rowid);
      if (text && text.trim().length >= 2) {
        ins.run(r.rowid, text, r.id, r.session_id, r.message_id ?? r.id, type);
      }
      if (usage && type === "assistant") {
        const tk = d?.tokens ?? {};
        const cache = tk.cache ?? {};
        const ts = Number(r.time_created ?? 0);
        usage.run(
          r.id,
          r.session_id,
          ts ? new Date(ts).toISOString().slice(0, 10) : null,
          d?.model?.providerID ?? null,
          d?.model?.id ?? null,
          Number(tk.input ?? 0),
          Number(tk.output ?? 0),
          Number(tk.reasoning ?? 0),
          Number(cache.read ?? 0),
          Number(cache.write ?? 0),
          Number(d?.cost ?? 0),
          ts,
        );
      }
    }
  });
  tx(rows);
}

/** One bounded sync pass; resumable while the initial index builds. */
export function syncFts(maxRows = 1500): { indexed: number; done: boolean } {
  ensureFtsMode();
  const v2 = isV2();
  const bootDone = getSetting("fts_boot_done");

  if (bootDone !== "1") {
    const cursor = Number(getSetting("fts_cursor") ?? "0");
    const sql = v2
      ? "SELECT rowid, id, session_id, type, data, time_updated, time_created FROM session_message WHERE rowid > ? ORDER BY rowid LIMIT ?"
      : "SELECT rowid, id, message_id, session_id, data, time_updated FROM part WHERE rowid > ? ORDER BY rowid LIMIT ?";
    const rows = ocRO.query(sql).all(cursor, maxRows) as Row[];
    if (!rows.length) {
      setSetting("fts_boot_done", "1");
      setSetting("fts_last_sync_ms", String(Date.now()));
      return { indexed: 0, done: true };
    }
    indexRows(rows);
    const next = rows[rows.length - 1]!.rowid;
    if (rows.length < maxRows) {
      setSetting("fts_boot_done", "1");
      setSetting("fts_last_sync_ms", String(Date.now()));
      return { indexed: rows.length, done: true };
    }
    setSetting("fts_cursor", String(next));
    return { indexed: rows.length, done: false };
  }

  const lastRaw = getSetting("fts_last_sync_ms");
  if (lastRaw === null) {
    setSetting("fts_boot_done", "0");
    setSetting("fts_cursor", "0");
    return { indexed: 0, done: false };
  }
  const since = Number(lastRaw) - 2000; // small overlap to avoid missed updates
  const sql = v2
    ? "SELECT rowid, id, session_id, type, data, time_updated, time_created FROM session_message WHERE time_updated >= ? LIMIT ?"
    : "SELECT rowid, id, message_id, session_id, data, time_updated FROM part WHERE time_updated >= ? LIMIT ?";
  const rows = ocRO.query(sql).all(since, maxRows) as Row[];
  indexRows(rows);
  setSetting("fts_last_sync_ms", String(Date.now()));
  return { indexed: rows.length, done: true };
}

/** Remove index rows for sessions that no longer exist. */
export function pruneFts(): number {
  const table = isV2() ? "session_v2" : "session";
  const ids = ocRO.query(`SELECT id FROM ${table}`).all() as { id: string }[];
  const valid = new Set(ids.map((r) => r.id));
  const rows = mgr
    .query("SELECT rowid, session_id FROM part_fts")
    .all() as { rowid: number; session_id: string }[];
  const del = deleteStmt();
  let removed = 0;
  const tx = mgr.transaction((batch: { rowid: number; session_id: string }[]) => {
    for (const r of batch) {
      if (!valid.has(r.session_id)) {
        del.run(r.rowid);
        removed++;
      }
    }
  });
  tx(rows);
  return removed;
}

export type SearchHit = {
  part_id: string;
  session_id: string;
  message_id: string;
  type: string;
  snippet: string;
};

export function search(q: string, limit = 200): SearchHit[] {
  const tokens = (q.match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 12);
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t}"*`).join(" AND ");
  try {
    return mgr
      .query(
        `SELECT part_id, session_id, message_id, type,
                snippet(part_fts, 0, '<mark>', '</mark>', '…', 14) AS snippet
         FROM part_fts
         WHERE part_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, limit) as SearchHit[];
  } catch {
    const like = `%${q}%`;
    return mgr
      .query(
        `SELECT part_id, session_id, message_id, type, substr(text,1,200) AS snippet
         FROM part_fts WHERE text LIKE ? LIMIT ?`,
      )
      .all(like, limit) as SearchHit[];
  }
}
