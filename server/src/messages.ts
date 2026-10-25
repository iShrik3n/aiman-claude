import { ocRO, isV2 } from "./db";

/**
 * The web UI speaks opencode's v1 message shape:
 *
 *   { info: { id, sessionID, role, time, modelID, providerID, … },
 *     parts: [{ id, sessionID, messageID, type, … }] }
 *
 * opencode v2 persists flat messages instead (one row per message, with
 * `content[]` holding what used to be parts). This module reads either schema
 * and returns the v1 shape the frontend already renders.
 */

export type V1Entry = { info: any; parts: any[] };

const MAX_TEXT = 200_000;

function parse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function errMessage(err: any): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return String(err.message ?? err.data?.message ?? err.name ?? err.type ?? "");
}

/** Normalise a v2 structured error to what the UI reads (`error.data.message`). */
function legacyError(err: any): any {
  if (!err) return undefined;
  const message = errMessage(err);
  return { name: err.type ?? err.name ?? "error", data: { message } };
}

function contentText(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!c) return "";
      if (c.type === "text") return String(c.text ?? "");
      if (c.type === "file") return String(c.name ?? c.uri ?? "");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parsePartialInput(input: any): any {
  if (input && typeof input === "object") return input;
  if (typeof input === "string" && input.trim()) {
    const parsed = parse(input);
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  return {};
}

function toolState(st: any): any {
  const input = parsePartialInput(st?.input);
  const status =
    st?.status === "streaming"
      ? "running"
      : st?.status === "running"
        ? "running"
        : st?.status === "completed"
          ? "completed"
          : st?.status === "error"
            ? "error"
            : "pending";
  const metadata = st?.metadata && typeof st.metadata === "object" ? st.metadata : {};
  const output = contentText(st?.content);
  return {
    status,
    input,
    metadata,
    output,
    ...(st?.error ? { error: errMessage(st.error) } : {}),
    ...(metadata.title ? { title: metadata.title } : {}),
  };
}

/** Convert one v2 `session_message` row into a v1 entry (or null if hidden). */
function convertV2(row: any): V1Entry | null {
  const data = parse(row.data) ?? {};
  const sid = row.session_id;
  const id = row.id;
  const type = row.type ?? data.type;

  if (type === "user") {
    const text = String(data.text ?? "");
    return {
      info: {
        id,
        sessionID: sid,
        role: "user",
        time: { created: data.time?.created ?? row.time_created },
      },
      parts: [
        {
          id: `${id}:text`,
          sessionID: sid,
          messageID: id,
          type: "text",
          text: text.slice(0, MAX_TEXT),
        },
      ],
    };
  }

  if (type === "assistant") {
    const content: any[] = Array.isArray(data.content) ? data.content : [];
    const parts: any[] = [];
    content.forEach((item, index) => {
      if (!item) return;
      if (item.type === "text" || item.type === "reasoning") {
        const kind = item.type === "reasoning" ? "r" : "t";
        parts.push({
          id: `${id}:${kind}:${index}`,
          sessionID: sid,
          messageID: id,
          type: item.type,
          text: String(item.text ?? "").slice(0, MAX_TEXT),
          ...(item.time ? { time: item.time } : {}),
        });
      } else if (item.type === "tool") {
        parts.push({
          id: item.id ?? `${id}:tool:${index}`,
          sessionID: sid,
          messageID: id,
          type: "tool",
          tool: item.name,
          callID: item.id,
          executed: item.executed,
          state: toolState(item.state),
          ...(item.time ? { time: item.time } : {}),
        });
      }
    });

    return {
      info: {
        id,
        sessionID: sid,
        role: "assistant",
        time: {
          created: data.time?.created ?? row.time_created,
          ...(data.time?.completed ? { completed: data.time.completed } : {}),
          ...(data.time?.streamed ? { streamed: data.time.streamed } : {}),
        },
        agentID: data.agent,
        modelID: data.model?.id,
        providerID: data.model?.providerID,
        ...(data.cost != null ? { cost: data.cost } : {}),
        ...(data.tokens ? { tokens: data.tokens } : {}),
        ...(data.error ? { error: legacyError(data.error) } : {}),
        ...(data.finish ? { finish: data.finish } : {}),
      },
      parts,
    };
  }

  return null;
}

/** v1 databases: read the old `message` + `part` tables directly. */
function getV1Entries(sessionId: string): V1Entry[] {
  const messages = ocRO
    .query("SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC")
    .all(sessionId) as { id: string; time_created: number; data: string }[];
  if (!messages.length) return [];

  const parts = ocRO
    .query(
      "SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY time_created ASC, rowid ASC",
    )
    .all(sessionId) as { id: string; message_id: string; data: string }[];

  const byMessage = new Map<string, any[]>();
  for (const p of parts) {
    const data = parse(p.data) ?? {};
    const list = byMessage.get(p.message_id) ?? [];
    list.push({ ...data, id: p.id, sessionID: sessionId, messageID: p.message_id });
    byMessage.set(p.message_id, list);
  }

  const out: V1Entry[] = [];
  for (const m of messages) {
    const data = parse(m.data) ?? {};
    const info = {
      ...data,
      id: m.id,
      sessionID: sessionId,
      role: data.role ?? "assistant",
      time: { created: data.time?.created ?? m.time_created, ...(data.time?.completed ? { completed: data.time.completed } : {}) },
      ...(data.error ? { error: legacyError(data.error) } : {}),
    };
    out.push({ info, parts: byMessage.get(m.id) ?? [] });
  }
  return out;
}

export function getSessionEntries(sessionId: string): V1Entry[] {
  if (!isV2()) return getV1Entries(sessionId);

  const rows = ocRO
    .query(
      `SELECT rowid, id, session_id, type, time_created, data
         FROM session_message
        WHERE session_id = ?
        ORDER BY seq ASC, rowid ASC`,
    )
    .all(sessionId) as any[];

  const out: V1Entry[] = [];
  for (const row of rows) {
    const entry = convertV2(row);
    if (entry) out.push(entry);
  }
  return out;
}
