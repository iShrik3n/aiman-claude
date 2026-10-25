import { isV2, mgr, ocRO } from "./db";
import { locationParams, ocData } from "./ocClient";
import { getSession, setArchived } from "./manager";
import { getSessionEntries } from "./messages";

/**
 * /btw side questions.
 *
 * A side question runs in its own short-lived child session with a snapshot of
 * the main session's recent context. The main transcript is never touched; the
 * answer is stored in btw_history and the child session is archived afterwards.
 */

type BtwStatus = "pending" | "done" | "failed";

type BtwRow = {
  id: string;
  session_id: string;
  side_session_id: string | null;
  question: string;
  answer: string | null;
  status: BtwStatus;
  error: string | null;
  created_at: number;
  prompted_at: number | null;
  completed_at: number | null;
};

export type BtwItem = {
  id: string;
  sessionId: string;
  sideSessionId: string | null;
  question: string;
  answer: string | null;
  status: BtwStatus;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
};

const ANSWER_TIMEOUT_MS = 180_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const value = (error as any)?.message ?? error;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function item(row: BtwRow): BtwItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    sideSessionId: row.side_session_id,
    question: row.question,
    answer: row.answer,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function row(id: string): BtwRow | null {
  return (mgr.query("SELECT * FROM btw_history WHERE id = ?").get(id) as BtwRow | undefined) ?? null;
}

export function listBtw(sessionId: string): BtwItem[] {
  return (
    mgr
      .query("SELECT * FROM btw_history WHERE session_id = ? ORDER BY created_at DESC")
      .all(sessionId) as BtwRow[]
  ).map(item);
}

export function askBtw(sessionId: string, question: string): BtwItem {
  const text = question.trim();
  if (!text) throw new Error("question required");
  const id = "btw_" + crypto.randomUUID();
  mgr
    .query(
      `INSERT INTO btw_history(id, session_id, question, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(id, sessionId, text, Date.now());
  kickBtw();
  return item(row(id)!);
}

export function deleteBtw(id: string): boolean {
  const current = row(id);
  if (!current) return false;
  if (current.side_session_id) {
    try {
      setArchived(current.side_session_id, true);
    } catch {}
  }
  mgr.query("DELETE FROM btw_history WHERE id = ?").run(id);
  return true;
}

function contextFor(sessionId: string): string {
  const session = getSession(sessionId);
  const entries = getSessionEntries(sessionId).slice(-16);
  const chunks: string[] = [];
  for (const entry of entries) {
    const role = entry.info?.role === "user" ? "User" : "Assistant";
    const texts = entry.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => String(part.text).trim())
      .filter(Boolean)
      .join("\n");
    const tools = entry.parts
      .filter((part) => part.type === "tool")
      .map((part) => {
        const input = part.state?.input ?? {};
        const detail =
          input.command ??
          input.description ??
          input.filePath ??
          input.path ??
          part.state?.title ??
          "";
        const status = part.state?.status ? ` [${part.state.status}]` : "";
        const output = part.state?.output ?? part.state?.metadata?.output ?? "";
        return `- ${part.tool ?? "tool"}${detail ? `: ${String(detail).slice(0, 240)}` : ""}${status}${
          output ? `\n  output: ${String(output).slice(0, 240)}` : ""
        }`;
      })
      .slice(0, 6);
    if (texts) chunks.push(`${role}:\n${texts.slice(0, 4000)}`);
    if (tools.length) chunks.push(`${role} tools:\n${tools.join("\n")}`);
  }
  const body = chunks.join("\n\n");
  return [
    `Main session: ${session?.title || "(untitled)"}`,
    `Working directory: ${session?.directory || "(unknown)"}`,
    "",
    "Recent conversation context:",
    body || "(no messages yet)",
  ]
    .join("\n")
    .slice(-24_000);
}

function parentModel(sessionId: string): any | null {
  if (!isV2()) return null;
  try {
    const row = ocRO.query("SELECT model FROM session_v2 WHERE id = ?").get(sessionId) as
      | { model: string | null }
      | undefined;
    const model = parseJson<any>(row?.model, null);
    if (!model?.providerID || !(model?.id ?? model?.modelID)) return null;
    return {
      providerID: String(model.providerID),
      id: String(model.id ?? model.modelID),
      ...(typeof model.variant === "string" && model.variant ? { variant: model.variant } : {}),
    };
  } catch {
    return null;
  }
}

async function createSideSession(mainSessionId: string, question: string): Promise<string> {
  const session = getSession(mainSessionId);
  if (!session) throw new Error("main session not found");
  const base = {
    parentID: mainSessionId,
    title: `btw: ${question.slice(0, 60)}`,
    location: { directory: session.directory },
    permissions: [{ action: "*", resource: "*", effect: "deny" }],
    metadata: { aiman: { btw: true, mainSessionID: mainSessionId } },
  };
  const model = parentModel(mainSessionId);
  const attempts: any[] = [
    { ...base, agent: "general", ...(model ? { model } : {}) },
    { ...base, ...(model ? { model } : {}) },
    { ...base, agent: "general", permissions: undefined, ...(model ? { model } : {}) },
  ];
  let lastError: unknown;
  for (const body of attempts) {
    try {
      const created = await ocData<any>(
        "/api/session",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        locationParams(session.directory),
      );
      if (created?.id) return String(created.id);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(String((lastError as any)?.message ?? lastError ?? "could not create side session"));
}

function promptText(context: string, question: string): string {
  return [
    'You are answering a quick "by the way" side question about a main coding session.',
    "Use the context below. Do not use tools, edit files, run commands, make plans, or ask questions.",
    "Answer directly and concisely (under 200 words unless the question needs more).",
    "",
    context,
    "",
    "Side question:",
    question,
  ].join("\n");
}

async function promptSide(
  sideSessionId: string,
  directory: string,
  context: string,
  question: string,
): Promise<void> {
  await ocData(
    `/api/session/${encodeURIComponent(sideSessionId)}/prompt`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: promptText(context, question) }),
    },
    locationParams(directory),
  );
}

function sideIdle(sideSessionId: string): { idle: boolean; missing: boolean } {
  if (!isV2()) return { idle: false, missing: false };
  const row = ocRO
    .query("SELECT time_idle, time_updated FROM session_v2 WHERE id = ?")
    .get(sideSessionId) as { time_idle: number | null; time_updated: number } | undefined;
  if (!row) return { idle: false, missing: true };
  return {
    idle: row.time_idle != null && row.time_idle >= row.time_updated,
    missing: false,
  };
}

function lastAnswer(sideSessionId: string): { text: string; error: string | null } {
  const entries = getSessionEntries(sideSessionId);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.info?.role !== "assistant") continue;
    const text = entry.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => String(part.text).trim())
      .filter(Boolean)
      .join("\n");
    if (text) return { text, error: null };
    if (entry.info?.error) return { text: "", error: errorText(entry.info.error) };
  }
  return { text: "", error: null };
}

function finish(id: string, patch: { answer?: string; error?: string; status: BtwStatus }): void {
  mgr
    .query(
      `UPDATE btw_history
          SET status = ?, answer = ?, error = ?, completed_at = ?
        WHERE id = ?`,
    )
    .run(patch.status, patch.answer ?? null, patch.error ?? null, Date.now(), id);
}

async function processOne(current: BtwRow): Promise<void> {
  const main = getSession(current.session_id);
  if (!main || main.time_archived != null) {
    finish(current.id, {
      status: "failed",
      error: main ? "Main session is archived" : "Main session not found",
    });
    return;
  }

  let sideSessionId = current.side_session_id;
  try {
    if (!sideSessionId) {
      sideSessionId = await createSideSession(current.session_id, current.question);
      mgr
        .query("UPDATE btw_history SET side_session_id = ? WHERE id = ?")
        .run(sideSessionId, current.id);
    }

    if (!current.prompted_at) {
      const context = contextFor(current.session_id);
      await promptSide(sideSessionId, main.directory, context, current.question);
      mgr
        .query("UPDATE btw_history SET prompted_at = ? WHERE id = ?")
        .run(Date.now(), current.id);
      return;
    }

    if (Date.now() - current.prompted_at > ANSWER_TIMEOUT_MS) {
      finish(current.id, { status: "failed", error: "Side question timed out" });
      setArchived(sideSessionId, true);
      return;
    }

    const state = sideIdle(sideSessionId);
    if (state.missing) {
      finish(current.id, { status: "failed", error: "Side session was removed" });
      return;
    }
    if (!state.idle) return;

    const answer = lastAnswer(sideSessionId);
    if (answer.text) {
      finish(current.id, { status: "done", answer: answer.text });
      setArchived(sideSessionId, true);
    } else {
      finish(current.id, {
        status: "failed",
        error: answer.error || "The side question returned no answer",
      });
      setArchived(sideSessionId, true);
    }
  } catch (e) {
    const message = errorText(e);
    console.warn("[btw] side question failed:", message);
    finish(current.id, { status: "failed", error: message });
    if (sideSessionId) {
      try {
        setArchived(sideSessionId, true);
      } catch {}
    }
  }
}

let processing = false;
let timer: ReturnType<typeof setInterval> | null = null;

export async function processBtw(): Promise<void> {
  if (processing || !isV2()) return;
  processing = true;
  try {
    const rows = mgr
      .query("SELECT * FROM btw_history WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10")
      .all() as BtwRow[];
    for (const current of rows) await processOne(current);
  } catch (e) {
    console.warn("[btw] worker failed:", String(e));
  } finally {
    processing = false;
  }
}

export function kickBtw(): void {
  setTimeout(() => void processBtw(), 0);
}

export function startBtwWorker(): void {
  if (timer) return;
  timer = setInterval(() => void processBtw(), 1_500);
  if (typeof timer.unref === "function") timer.unref();
  void processBtw();
}
