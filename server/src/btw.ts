import { mgr } from "./db";
import { getSession } from "./manager";
import { oneShot } from "./oneshot";
import { getSessionEntries } from "./messages";

/**
 * /btw side questions.
 *
 * A side question is a one-shot, tool-free call to Claude (oneshot.ts) with a
 * snapshot of the main session's recent context. The main transcript is never
 * touched and nothing is written to ~/.claude; the answer is stored in
 * btw_history.
 */

type BtwStatus = "pending" | "done" | "failed";

export type BtwModel = {
  providerID: string;
  id: string;
  variant?: string;
};

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
  model_json: string | null;
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
  /** Model selected in the composer when the side question was asked. */
  model: BtwModel | null;
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

function normalizeModel(value: any): BtwModel | null {
  const providerID = typeof value?.providerID === "string" ? value.providerID : "";
  const id =
    typeof value?.id === "string"
      ? value.id
      : typeof value?.modelID === "string"
        ? value.modelID
        : "";
  if (!providerID || !id) return null;
  return {
    providerID,
    id,
    ...(typeof value?.variant === "string" && value.variant
      ? { variant: value.variant }
      : {}),
  };
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
    model: parseJson<BtwModel | null>(row.model_json, null),
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

export function askBtw(
  sessionId: string,
  question: string,
  model?: BtwModel | null,
): BtwItem {
  const text = question.trim();
  if (!text) throw new Error("question required");
  const id = "btw_" + crypto.randomUUID();
  const normalized = normalizeModel(model);
  mgr
    .query(
      `INSERT INTO btw_history(id, session_id, question, status, created_at, model_json)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    )
    .run(id, sessionId, text, Date.now(), normalized ? JSON.stringify(normalized) : null);
  kickBtw();
  return item(row(id)!);
}

export function deleteBtw(id: string): boolean {
  const current = row(id);
  if (!current) return false;
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
  try {
    mgr.query("UPDATE btw_history SET prompted_at = ? WHERE id = ?").run(Date.now(), current.id);
    const model = parseJson<BtwModel | null>(current.model_json, null);
    const answer = await oneShot(promptText(contextFor(current.session_id), current.question), {
      model: model?.id,
      timeoutMs: ANSWER_TIMEOUT_MS,
    });
    finish(current.id, { status: "done", answer });
  } catch (e) {
    const message = errorText(e);
    console.warn("[btw] side question failed:", message);
    finish(current.id, { status: "failed", error: message });
  }
}

let processing = false;
let timer: ReturnType<typeof setInterval> | null = null;

export async function processBtw(): Promise<void> {
  if (processing) return;
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
