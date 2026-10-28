import { mgr } from "./db";
import { isBusy, startPrompt } from "./live";
import { getSession } from "./manager";

/**
 * Strict deferred-message queue.
 *
 * A queued prompt is kept in aiman's manager database until the target session
 * has been fully quiescent for the configured window. Only then is it handed to
 * Claude Code. A prompt is released only when no run is active for the session,
 * its transcript has been still for a moment and the quiet window has passed.
 */

export type QueueOptions = {
  quietMs: number;
  blockQuestions: boolean;
  blockPermissions: boolean;
  blockShells: boolean;
  blockSubagents: boolean;
};

export type QueueItem = {
  id: string;
  sessionId: string;
  text: string;
  files: any[];
  createdAt: number;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  quietMs: number;
  blockQuestions: boolean;
  blockPermissions: boolean;
  blockShells: boolean;
  blockSubagents: boolean;
  nextSendAt: number | null;
  blockedReason: string | null;
  error: string | null;
  attempts: number;
  sentAt: number | null;
};

type QueueRow = {
  id: string;
  session_id: string;
  text: string;
  files_json: string;
  created_at: number;
  status: QueueItem["status"];
  quiet_ms: number;
  block_questions: number;
  block_permissions: number;
  block_shells: number;
  block_subagents: number;
  next_send_at: number | null;
  blocked_reason: string | null;
  error: string | null;
  attempts: number;
  sent_at: number | null;
};

type GateResult = { ok: true } | { ok: false; reason: string };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    files: parseJson<any[]>(row.files_json, []),
    createdAt: row.created_at,
    status: row.status,
    quietMs: row.quiet_ms,
    blockQuestions: !!row.block_questions,
    blockPermissions: !!row.block_permissions,
    blockShells: !!row.block_shells,
    blockSubagents: !!row.block_subagents,
    nextSendAt: row.next_send_at,
    blockedReason: row.blocked_reason,
    error: row.error,
    attempts: row.attempts,
    sentAt: row.sent_at,
  };
}

function getRow(id: string): QueueRow | null {
  return (mgr.query("SELECT * FROM queued_prompts WHERE id = ?").get(id) as QueueRow | undefined) ?? null;
}

export function listQueue(sessionId: string): QueueItem[] {
  return (
    mgr
      .query(
        `SELECT * FROM queued_prompts
          WHERE session_id = ? AND status IN ('pending', 'sending', 'failed')
          ORDER BY created_at ASC`,
      )
      .all(sessionId) as QueueRow[]
  ).map(toItem);
}

export function enqueuePrompt(
  sessionId: string,
  text: string,
  files: any[],
  options: Partial<QueueOptions> = {},
): QueueItem {
  if (!text.trim() && !files.length) throw new Error("empty message");
  const quietMs = Math.max(0, Math.min(120_000, Number(options.quietMs ?? 10_000) || 0));
  const id = "que_" + crypto.randomUUID();
  const now = Date.now();
  mgr
    .query(
      `INSERT INTO queued_prompts
        (id, session_id, text, files_json, created_at, status, quiet_ms,
         block_questions, block_permissions, block_shells, block_subagents)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sessionId,
      text,
      JSON.stringify(files ?? []),
      now,
      quietMs,
      options.blockQuestions === false ? 0 : 1,
      options.blockPermissions === false ? 0 : 1,
      options.blockShells === false ? 0 : 1,
      options.blockSubagents === false ? 0 : 1,
    );
  kickQueue();
  return toItem(getRow(id)!);
}

export function cancelQueuedPrompt(id: string): "ok" | "not_found" | "sending" {
  const row = getRow(id);
  if (!row) return "not_found";
  if (row.status === "sending") return "sending";
  mgr.query("UPDATE queued_prompts SET status = 'cancelled' WHERE id = ?").run(id);
  return "ok";
}

// ---------------------------------------------------------------------------
// Quiescence checks

async function gateForSession(sessionId: string, _options: QueueOptions): Promise<GateResult> {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "Session not found" };
  if (session.time_archived) return { ok: false, reason: "Session is archived" };
  // Permission and question prompts only exist while a run is active (they are
  // denied when it ends), so "not busy" covers the block* options too.
  if (isBusy(sessionId)) return { ok: false, reason: "Agent is still running" };
  // Someone may be using the same session from a terminal: its transcript moves.
  if (Date.now() - session.time_updated < EXTERNAL_ACTIVITY_MS) {
    return { ok: false, reason: "Session was just active" };
  }
  return { ok: true };
}

const EXTERNAL_ACTIVITY_MS = 4_000;

// ---------------------------------------------------------------------------
// Worker

let workerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;
const lastSent = new Map<string, number>();

function optionsFor(row: QueueRow): QueueOptions {
  return {
    quietMs: row.quiet_ms,
    blockQuestions: !!row.block_questions,
    blockPermissions: !!row.block_permissions,
    blockShells: !!row.block_shells,
    blockSubagents: !!row.block_subagents,
  };
}

async function sendQueued(row: QueueRow): Promise<void> {
  const session = getSession(row.session_id);
  if (!session || session.time_archived != null) {
    mgr
      .query(
        "UPDATE queued_prompts SET status='failed', error=?, blocked_reason=?, next_send_at=NULL WHERE id=?",
      )
      .run(session ? "Session is archived" : "Session not found", session ? "Session is archived" : "Session not found", row.id);
    return;
  }

  // Claim the item so a second worker tick cannot pick it up.
  mgr
    .query(
      "UPDATE queued_prompts SET status='sending', next_send_at=NULL, blocked_reason=NULL WHERE id=? AND status='pending'",
    )
    .run(row.id);

  try {
    if (parseJson<any[]>(row.files_json, []).length) {
      throw new Error("attachments are not supported yet");
    }
    startPrompt(row.session_id, row.text);
    const now = Date.now();
    mgr
      .query(
        "UPDATE queued_prompts SET status='sent', sent_at=?, next_send_at=NULL, blocked_reason=NULL, error=NULL WHERE id=?",
      )
      .run(now, row.id);
    lastSent.set(row.session_id, now);
  } catch (e) {
    const message = String((e as any)?.message ?? e);
    const attempts = row.attempts + 1;
    if (attempts >= 5) {
      mgr
        .query(
          "UPDATE queued_prompts SET status='failed', attempts=?, error=?, blocked_reason=? WHERE id=?",
        )
        .run(attempts, message, `Failed: ${message}`, row.id);
    } else {
      mgr
        .query(
          `UPDATE queued_prompts
              SET status='pending', attempts=?, error=?, blocked_reason=?,
                  next_send_at=?
            WHERE id=?`,
        )
        .run(attempts, message, `Retrying: ${message}`, Date.now() + 5_000 * attempts, row.id);
    }
  }
}

async function processSession(sessionId: string): Promise<void> {
  if ((lastSent.get(sessionId) ?? 0) + 1_500 > Date.now()) return;
  if (mgr.query("SELECT 1 AS x FROM queued_prompts WHERE session_id=? AND status='sending' LIMIT 1").get(sessionId)) {
    return;
  }

  const session = getSession(sessionId);
  if (!session || session.time_archived != null) {
    const reason = session ? "Session is archived" : "Session not found";
    mgr
      .query(
        `UPDATE queued_prompts
            SET status='failed', error=?, blocked_reason=?, next_send_at=NULL
          WHERE session_id=? AND status='pending'`,
      )
      .run(reason, reason, sessionId);
    return;
  }

  const row = mgr
    .query(
      `SELECT * FROM queued_prompts
        WHERE session_id = ? AND status = 'pending'
        ORDER BY created_at ASC LIMIT 1`,
    )
    .get(sessionId) as QueueRow | undefined;
  if (!row) return;

  const options = optionsFor(row);
  const gate = await gateForSession(sessionId, options);
  if (!gate.ok) {
    mgr
      .query(
        "UPDATE queued_prompts SET blocked_reason=?, next_send_at=NULL WHERE id=? AND status='pending'",
      )
      .run(gate.reason, row.id);
    return;
  }

  const now = Date.now();
  if (!row.next_send_at) {
    if (options.quietMs <= 0) {
      await sendQueued(row);
    } else {
      mgr
        .query(
          "UPDATE queued_prompts SET next_send_at=?, blocked_reason=NULL WHERE id=? AND status='pending'",
        )
        .run(now + options.quietMs, row.id);
    }
    return;
  }

  if (now < row.next_send_at) return;
  await sendQueued(row);
}

export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const sessions = mgr
      .query("SELECT DISTINCT session_id FROM queued_prompts WHERE status='pending'")
      .all() as { session_id: string }[];
    for (const row of sessions) {
      await processSession(row.session_id);
    }
  } catch (e) {
    console.warn("[queue] worker failed:", String(e));
  } finally {
    processing = false;
  }
}

export function kickQueue(): void {
  setTimeout(() => void processQueue(), 0);
}

export function startQueueWorker(): void {
  if (workerTimer) return;
  try {
    // A crash between admitting and sending leaves an item in `sending`. Retry
    // it; the prompt endpoint is idempotent enough to make duplicate loss rare.
    mgr
      .query(
        `UPDATE queued_prompts
            SET status='pending', next_send_at=NULL, blocked_reason='Recovered after restart'
          WHERE status='sending'`,
      )
      .run();
    mgr
      .query("DELETE FROM queued_prompts WHERE status IN ('sent','cancelled') AND COALESCE(sent_at, created_at) < ?")
      .run(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } catch (e) {
    console.warn("[queue] startup cleanup failed:", String(e));
  }
  workerTimer = setInterval(() => void processQueue(), 1_500);
  if (typeof workerTimer.unref === "function") workerTimer.unref();
  void processQueue();
}
