import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "./config";
import { mgr, ocRO, ocRW } from "./db";

/**
 * Indexer for Claude Code transcripts (`~/.claude/projects/<dir>/<id>.jsonl`).
 *
 * Each transcript is parsed into opencode's v1 shapes and upserted into the
 * derived index database, which is what the rest of the server queries:
 *
 *   session  one per transcript file (id = file name without extension)
 *   message  `{role, …}` JSON; assistant messages carry model + token usage
 *   part     `{type: text | reasoning | tool, …}` JSON
 *
 * Things about the transcript format that shape this module:
 *  - One API response is written as several `assistant` lines (one per content
 *    block) that share `message.id` and repeat the same `usage`. They are merged
 *    into one message so tokens are counted once.
 *  - Tool results arrive as `user` lines holding `tool_result` blocks. They are
 *    attached to the matching `tool_use` part and are not user turns.
 *  - Many line types are bookkeeping (`attachment`, `api-request*`, …).
 */

type Json = any;

const MAX_TEXT = 200_000;
const MAX_OUTPUT = 60_000;

const SKIP_PREFIXES = ['{"type":"api-request', '{"type":"file-history', '{"type":"attachment'];

function parseLine(line: string): Json | null {
  if (!line) return null;
  for (const p of SKIP_PREFIXES) if (line.startsWith(p)) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function ts(v: unknown): number {
  const n = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Text for the XML-ish wrappers Claude Code puts in user lines. */
function cleanUserText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("<local-command-caveat>")) return null;
  if (text.startsWith("<local-command-stdout>") || text.startsWith("<local-command-stderr>")) {
    const inner = text.replace(/<\/?local-command-std(out|err)>/g, "").trim();
    return inner ? inner : null;
  }
  const cmd = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (cmd) {
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
    return [cmd[1]!.trim(), args].filter(Boolean).join(" ");
  }
  // Harness-injected reminders are context, not something the user typed.
  const stripped = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  return stripped || null;
}

const TOOL_NAMES: Record<string, string> = {
  Bash: "bash",
  Read: "read",
  Edit: "edit",
  MultiEdit: "edit",
  Write: "write",
  Grep: "grep",
  Glob: "glob",
  WebFetch: "webfetch",
  WebSearch: "websearch",
  Task: "task",
  Agent: "task",
  TodoWrite: "todowrite",
  NotebookEdit: "edit",
};

function toolTitle(name: string, input: Json): string {
  const i = input && typeof input === "object" ? input : {};
  const first = (s: unknown) => String(s ?? "").split("\n")[0]!.slice(0, 120);
  if (name === "Bash") return first(i.description ?? i.command);
  if (i.file_path) return String(i.file_path);
  if (i.pattern) return first(i.pattern);
  if (i.url) return first(i.url);
  if (i.description) return first(i.description);
  return "";
}

/** Minimal unified diff so Edit calls render in the UI's diff viewer. */
function editDiff(input: Json): string | null {
  const path = input?.file_path;
  if (!path || typeof input.old_string !== "string" || typeof input.new_string !== "string") {
    return null;
  }
  const minus = input.old_string.split("\n").map((l: string) => "-" + l);
  const plus = input.new_string.split("\n").map((l: string) => "+" + l);
  return [`--- a/${path}`, `+++ b/${path}`, "@@", ...minus, ...plus].join("\n");
}

function resultText(content: Json): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: Json) => {
      if (c?.type === "text") return String(c.text ?? "");
      if (c?.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export type ParsedMessage = { id: string; time: number; data: Json; parts: ParsedPart[] };
export type ParsedPart = { id: string; time: number; data: Json };
export type ParsedSession = {
  id: string;
  directory: string;
  title: string;
  created: number;
  updated: number;
  messages: ParsedMessage[];
};

export function parseTranscript(sessionId: string, text: string): ParsedSession | null {
  const messages: ParsedMessage[] = [];
  const assistantById = new Map<string, ParsedMessage>();
  const toolParts = new Map<string, ParsedPart>();
  let directory = "";
  let aiTitle = "";
  let customTitle = "";
  let firstPrompt = "";
  let created = 0;
  let updated = 0;

  for (const line of text.split("\n")) {
    const d = parseLine(line);
    if (!d || typeof d !== "object") continue;

    if (d.type === "ai-title" && d.aiTitle) aiTitle = String(d.aiTitle);
    else if (d.type === "custom-title" && d.customTitle) customTitle = String(d.customTitle);

    if (d.type !== "user" && d.type !== "assistant") continue;
    if (!d.message) continue;

    const t = ts(d.timestamp);
    if (t) {
      if (!created || t < created) created = t;
      if (t > updated) updated = t;
    }
    if (!directory && typeof d.cwd === "string") directory = d.cwd;

    if (d.type === "user") {
      const content = d.message.content;
      const blocks: Json[] = Array.isArray(content)
        ? content
        : [{ type: "text", text: String(content ?? "") }];

      let hasToolResult = false;
      for (const b of blocks) {
        if (b?.type !== "tool_result") continue;
        hasToolResult = true;
        const part = toolParts.get(b.tool_use_id);
        if (!part) continue;
        const out = resultText(b.content).slice(0, MAX_OUTPUT);
        const st = part.data.state;
        st.status = b.is_error ? "error" : "completed";
        st.output = out;
        if (b.is_error) st.error = out;
        if (t) part.data.time = { ...(part.data.time ?? {}), end: t };
      }
      if (hasToolResult || d.isMeta || d.isSidechain) continue;

      const pieces: string[] = [];
      for (const b of blocks) {
        if (b?.type === "text") {
          const c = cleanUserText(String(b.text ?? ""));
          if (c) pieces.push(c);
        } else if (b?.type === "image") pieces.push("[image]");
      }
      if (!pieces.length) continue;
      const body = pieces.join("\n").slice(0, MAX_TEXT);
      if (!firstPrompt && d.origin?.kind !== "system" && !d.isCompactSummary) firstPrompt = body;

      const id = String(d.uuid);
      messages.push({
        id,
        time: t,
        data: { role: "user", time: { created: t } },
        parts: [{ id: `${id}:text`, time: t, data: { type: "text", text: body } }],
      });
      continue;
    }

    // ---- assistant ----
    if (d.isSidechain) continue;
    const m = d.message;
    const mid = String(m.id ?? d.uuid);
    let msg = assistantById.get(mid);
    if (!msg) {
      msg = {
        id: mid,
        time: t,
        data: { role: "assistant", providerID: "anthropic", time: { created: t } },
        parts: [],
      };
      assistantById.set(mid, msg);
      messages.push(msg);
    }
    if (t) msg.data.time.completed = t;
    if (m.model) msg.data.modelID = m.model;
    if (m.stop_reason) msg.data.finish = m.stop_reason;

    const u = m.usage;
    if (u) {
      // Streamed lines repeat usage (output_tokens may grow); keep the largest.
      const think = Number(u.output_tokens_details?.thinking_tokens ?? 0);
      const out = Math.max(Number(u.output_tokens ?? 0) - think, 0);
      const prev = msg.data.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
      msg.data.tokens = {
        input: Math.max(prev.input, Number(u.input_tokens ?? 0)),
        output: Math.max(prev.output, out),
        reasoning: Math.max(prev.reasoning, think),
        cache: {
          read: Math.max(prev.cache.read, Number(u.cache_read_input_tokens ?? 0)),
          write: Math.max(prev.cache.write, Number(u.cache_creation_input_tokens ?? 0)),
        },
      };
      // No per-message price is stored in transcripts; cost is left at 0.
      msg.data.cost = 0;
    }

    const blocks: Json[] = Array.isArray(m.content) ? m.content : [];
    for (const b of blocks) {
      const n = msg.parts.length;
      if (b?.type === "text") {
        const text = String(b.text ?? "").slice(0, MAX_TEXT);
        if (!text.trim()) continue;
        msg.parts.push({ id: `${mid}:${n}`, time: t, data: { type: "text", text } });
      } else if (b?.type === "thinking") {
        const text = String(b.thinking ?? "").slice(0, MAX_TEXT);
        if (!text.trim()) continue; // Claude Code stores thinking encrypted/empty
        msg.parts.push({ id: `${mid}:${n}`, time: t, data: { type: "reasoning", text } });
      } else if (b?.type === "tool_use") {
        const input = b.input && typeof b.input === "object" ? { ...b.input } : {};
        if (input.file_path && !input.filePath) input.filePath = input.file_path;
        const diff = b.name === "Edit" ? editDiff(b.input) : null;
        const part: ParsedPart = {
          id: String(b.id ?? `${mid}:${n}`),
          time: t,
          data: {
            type: "tool",
            tool: TOOL_NAMES[b.name] ?? String(b.name).toLowerCase(),
            callID: b.id,
            state: {
              status: "running",
              input,
              output: "",
              title: toolTitle(b.name, b.input),
              metadata: diff ? { diff } : {},
            },
            time: { start: t },
          },
        };
        msg.parts.push(part);
        if (b.id) toolParts.set(b.id, part);
      }
    }
  }

  if (!messages.length) return null;
  const title = (customTitle || aiTitle || firstPrompt.replace(/\s+/g, " ").slice(0, 80)).trim();
  return {
    id: sessionId,
    directory,
    title: title || sessionId.slice(0, 8),
    created: created || Date.now(),
    updated: updated || created || Date.now(),
    messages,
  };
}

// ---------------------------------------------------------------------------

function listTranscripts(): { path: string; size: number; mtime: number }[] {
  const out: { path: string; size: number; mtime: number }[] = [];
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return out;
  for (const dir of readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const base = join(CLAUDE_PROJECTS_DIR, dir.name);
    for (const f of readdirSync(base, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      const path = join(base, f.name);
      try {
        const st = statSync(path);
        out.push({ path, size: st.size, mtime: Math.floor(st.mtimeMs) });
      } catch {}
    }
  }
  return out;
}

const upsertSession = () =>
  ocRW.query(
    `INSERT INTO session(id, slug, directory, title, time_created, time_updated)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       directory = excluded.directory,
       title = CASE WHEN session.title_locked = 1 THEN session.title ELSE excluded.title END,
       time_created = excluded.time_created,
       time_updated = excluded.time_updated`,
  );

// time_updated only moves when the payload changed, so the search index (which
// syncs on time_updated) does not reprocess untouched parts on every rescan.
const upsertMessage = () =>
  ocRW.query(
    `INSERT INTO message(id, session_id, time_created, data) VALUES(?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET time_created = excluded.time_created, data = excluded.data
     WHERE message.data != excluded.data OR message.time_created != excluded.time_created`,
  );

const upsertPart = () =>
  ocRW.query(
    `INSERT INTO part(id, message_id, session_id, time_created, time_updated, data)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       message_id = excluded.message_id,
       time_created = excluded.time_created,
       time_updated = excluded.time_updated,
       data = excluded.data
     WHERE part.data != excluded.data OR part.message_id != excluded.message_id`,
  );

export type Changed = { messages: Json[]; parts: Json[] };

/** Upsert a parsed session; returns the message/part payloads that changed. */
function writeSession(s: ParsedSession): Changed {
  const changed: Changed = { messages: [], parts: [] };
  const now = Date.now();
  const sess = upsertSession();
  const msg = upsertMessage();
  const part = upsertPart();
  const keepMsg = new Set<string>();
  const keepPart = new Set<string>();

  const tx = ocRW.transaction(() => {
    sess.run(s.id, s.id.slice(0, 8), s.directory, s.title, s.created, s.updated);
    // Keys are prefixed with the session id: a forked or resumed session can
    // carry copies of another transcript's lines with the same uuids.
    for (const m of s.messages) {
      const mid = `${s.id}:${m.id}`;
      keepMsg.add(mid);
      const data = { ...m.data, id: mid, sessionID: s.id };
      if (msg.run(mid, s.id, m.time, JSON.stringify(data)).changes) changed.messages.push(data);
      for (const p of m.parts) {
        const pid = `${s.id}:${p.id}`;
        keepPart.add(pid);
        const pd = { ...p.data, id: pid, sessionID: s.id, messageID: mid };
        if (part.run(pid, mid, s.id, p.time, now, JSON.stringify(pd)).changes) changed.parts.push(pd);
      }
    }
    // Drop rows that vanished from the transcript (e.g. after a rewind).
    const staleParts = (
      ocRW.query("SELECT rowid, id FROM part WHERE session_id = ?").all(s.id) as {
        rowid: number;
        id: string;
      }[]
    ).filter((r) => !keepPart.has(r.id));
    for (const r of staleParts) {
      ocRW.query("DELETE FROM part WHERE id = ?").run(r.id);
      try {
        mgr.query("DELETE FROM part_fts WHERE rowid = ?").run(r.rowid);
      } catch {}
    }
    const staleMsgs = (
      ocRW.query("SELECT id FROM message WHERE session_id = ?").all(s.id) as { id: string }[]
    ).filter((r) => !keepMsg.has(r.id));
    for (const r of staleMsgs) ocRW.query("DELETE FROM message WHERE id = ?").run(r.id);
  });
  tx();
  return changed;
}

/** Path of the transcript file the index has for a session, if any. */
export function transcriptPath(sessionId: string): string | null {
  const r = ocRO.query("SELECT path FROM source_file WHERE session_id = ?").get(sessionId) as
    | { path: string }
    | undefined;
  return r?.path ?? null;
}

/**
 * Re-index one session right now (used while a run is streaming). Returns what
 * changed so callers can push it to the browser, or null if nothing was read.
 */
export function syncSession(sessionId: string): Changed | null {
  const path = transcriptPath(sessionId) ?? findTranscript(sessionId);
  if (!path) return null;
  const st = statSync(path);
  const text = readFileSync(path, "utf8");
  const parsed = parseTranscript(sessionId, text);
  const changed = parsed ? writeSession(parsed) : null;
  ocRW
    .query(
      `INSERT INTO source_file(path, session_id, size, mtime_ms) VALUES(?,?,?,?)
       ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms`,
    )
    .run(path, sessionId, st.size, Math.floor(st.mtimeMs));
  return changed;
}

/** Locate the transcript file of a session that is not indexed yet. */
function findTranscript(sessionId: string): string | null {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return null;
  for (const dir of readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const p = join(CLAUDE_PROJECTS_DIR, dir.name, `${sessionId}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Re-index transcripts whose size or mtime changed since the last pass.
 *
 * Whole files are re-parsed (not tailed) because an assistant message can be
 * extended by later lines and a tool result lands after its tool call. Sessions
 * whose transcript disappeared from disk are kept: Claude Code prunes old
 * transcripts, and the index doubles as the archive.
 */
export function syncTranscripts(): { files: number; changed: number } {
  const known = new Map(
    (
      ocRO.query("SELECT path, size, mtime_ms FROM source_file").all() as {
        path: string;
        size: number;
        mtime_ms: number;
      }[]
    ).map((r) => [r.path, r]),
  );
  const files = listTranscripts();
  let changed = 0;
  for (const f of files) {
    const k = known.get(f.path);
    if (k && k.size === f.size && k.mtime_ms === f.mtime) continue;
    try {
      const sessionId = basename(f.path, ".jsonl");
      const parsed = parseTranscript(sessionId, readFileSync(f.path, "utf8"));
      if (parsed) writeSession(parsed);
      ocRW
        .query(
          `INSERT INTO source_file(path, session_id, size, mtime_ms) VALUES(?,?,?,?)
           ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms`,
        )
        .run(f.path, sessionId, f.size, f.mtime);
      changed++;
    } catch (e) {
      console.error("[claude] failed to index", f.path, e);
    }
  }
  return { files: files.length, changed };
}
