import { query, type PermissionResult, type PermissionUpdate, type Query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { syncSession, transcriptPath } from "./claude";
import { CLAUDE_CONFIG_DIR } from "./config";
import { ocRO, ocRW } from "./db";

/**
 * Live control of Claude Code sessions through the Agent SDK.
 *
 * The SDK drives the user's installed `claude` binary (so their existing login
 * and settings apply). What the browser renders is still the JSONL transcript:
 * after each SDK message the session is re-indexed and only the rows that
 * changed are pushed over the event stream, in the shapes the web UI already
 * understands from opencode. There is deliberately no second SDK-message to
 * UI-part converter.
 */

// ---------------------------------------------------------------- event hub

const enc = new TextEncoder();
const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function emit(type: string, properties: Record<string, unknown>): void {
  const frame = enc.encode(`data: ${JSON.stringify({ payload: { type, properties } })}\n\n`);
  for (const c of subscribers) {
    try {
      c.enqueue(frame);
    } catch {
      subscribers.delete(c);
    }
  }
}

export function eventStream(req: Request): Response {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctl = controller;
      subscribers.add(controller);
      controller.enqueue(enc.encode(": connected\n\n"));
      timer = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          clearInterval(timer);
          subscribers.delete(controller);
        }
      }, 15_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        subscribers.delete(controller);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(timer);
      subscribers.delete(ctl);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ------------------------------------------------------------ catalogue

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

const MODELS = [
  { id: "claude-fable-5-1", name: "Fable 5.1", effort: true },
  { id: "claude-opus-5-5", name: "Opus 5.5", effort: true },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", effort: true },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", effort: false },
];

export function providers() {
  return {
    providers: [
      {
        id: "anthropic",
        name: "Anthropic",
        models: Object.fromEntries(
          MODELS.map((m) => [
            m.id,
            {
              id: m.id,
              name: m.name,
              reasoning: m.effort,
              tool_call: true,
              ...(m.effort ? { variants: [...EFFORTS] } : {}),
            },
          ]),
        ),
      },
    ],
    default: {},
  };
}

export const agents = () => [
  { name: "claude", description: "Claude Code", mode: "primary" },
];

// -------------------------------------------------------------- sessions

export class LiveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function sessionRow(id: string): { id: string; directory: string } | null {
  return (
    (ocRO.query("SELECT id, directory FROM session WHERE id = ?").get(id) as
      | { id: string; directory: string }
      | undefined) ?? null
  );
}

/** Register a new, empty session; the transcript appears on its first prompt. */
export function createSession(directory: string, title?: string) {
  if (!directory || !isAbsolute(directory) || !existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new LiveError("directory must be an existing absolute path", 400);
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const name = title?.trim() || "New session";
  ocRW
    .query(
      "INSERT INTO session(id, slug, directory, title, time_created, time_updated) VALUES(?,?,?,?,?,?)",
    )
    .run(id, id.slice(0, 8), directory, name, now, now);
  emit("session.created", { info: { id, directory, title: name } });
  return { id, title: name, directory };
}

// ------------------------------------------------------------------ runs

type Run = { q: Query; abort: AbortController; timer: ReturnType<typeof setInterval> };
const runs = new Map<string, Run>();

export const isBusy = (sessionId: string) => runs.has(sessionId);

/** Push whatever changed in the transcript since the last flush. */
function flush(sessionId: string): void {
  let changed;
  try {
    changed = syncSession(sessionId);
  } catch (e) {
    console.error("[live] sync failed:", e);
    return;
  }
  if (!changed) return;
  // The browser already shows the user's own message optimistically; skip user
  // rows so it is not duplicated until the idle reload swaps in the real one.
  const userIds = new Set<string>();
  for (const info of changed.messages) {
    if (info.role === "user") userIds.add(info.id);
    else emit("message.updated", { info });
  }
  for (const part of changed.parts) {
    if (!userIds.has(part.messageID)) emit("message.part.updated", { part });
  }
}

function findClaude(): string | undefined {
  return process.env.CLAUDE_BIN?.trim() || Bun.which("claude") || undefined;
}

export type PromptOptions = { model?: string; variant?: string };

export function startPrompt(sessionId: string, text: string, opts: PromptOptions = {}): void {
  const row = sessionRow(sessionId);
  if (!row) throw new LiveError("session not found", 404);
  if (runs.has(sessionId)) throw new LiveError("session is busy", 409);
  if (!text.trim()) throw new LiveError("empty prompt", 400);
  if (!row.directory || !existsSync(row.directory)) {
    throw new LiveError(`working directory no longer exists: ${row.directory}`, 400);
  }

  const abort = new AbortController();
  const stderr: string[] = [];
  const effort = EFFORTS.includes(opts.variant as Effort) ? (opts.variant as Effort) : undefined;
  const modelMeta = MODELS.find((m) => m.id === opts.model);
  const exe = findClaude();

  const q = query({
    prompt: text,
    options: {
      cwd: row.directory,
      // A session with a transcript is resumed; a brand-new one is created
      // under the id we already handed to the browser.
      ...(transcriptPath(sessionId) ? { resume: sessionId } : { sessionId }),
      abortController: abort,
      // Never bypass permissions: every ask goes to the browser.
      permissionMode: "default",
      canUseTool: (toolName, input, o) =>
        askUser(sessionId, toolName, input, o.toolUseID, o.requestId, o.suggestions, o.signal, o.title),
      ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(effort && modelMeta?.effort ? { effort } : {}),
      env: { ...process.env, CLAUDE_CONFIG_DIR } as Record<string, string>,
      stderr: (d) => {
        stderr.push(d);
        if (stderr.length > 20) stderr.shift();
      },
    },
  });

  const timer = setInterval(() => flush(sessionId), 1000);
  runs.set(sessionId, { q, abort, timer });
  emit("session.status", { sessionID: sessionId, status: { type: "busy" } });

  void (async () => {
    let failure = "";
    try {
      for await (const msg of q) {
        if (msg.type === "result" && msg.is_error) {
          failure = ("result" in msg && typeof msg.result === "string" && msg.result) || msg.subtype;
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        failure = (e as Error)?.message ?? String(e);
        const tail = stderr.join("").trim().split("\n").slice(-3).join("\n");
        if (tail) failure += `\n${tail}`;
      }
    } finally {
      clearInterval(timer);
      runs.delete(sessionId);
      denyAll(sessionId, "The run ended");
      flush(sessionId);
      if (failure) {
        emit("session.error", { sessionID: sessionId, error: { name: "error", data: { message: failure } } });
      }
      emit("session.idle", { sessionID: sessionId });
      emit("session.updated", { info: { id: sessionId } });
    }
  })();
}

export async function abortSession(sessionId: string): Promise<void> {
  const run = runs.get(sessionId);
  if (!run) return;
  denyAll(sessionId, "Interrupted");
  try {
    await run.q.interrupt();
  } catch {}
  // If the CLI ignores the interrupt, stop waiting for it.
  setTimeout(() => {
    if (runs.get(sessionId) === run) run.abort.abort();
  }, 5000);
}

export function shutdownAll(): void {
  for (const [id, run] of runs) {
    denyAll(id, "Server shutting down");
    run.abort.abort();
  }
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    shutdownAll();
    process.exit(0);
  });
}

// ----------------------------------------------------------- permissions

type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool: { messageID: string; callID: string };
};
type QuestionInfo = {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiple?: boolean;
};
type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool: { messageID: string; callID: string };
};
type Pending = {
  sessionId: string;
  input: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolve: (r: PermissionResult) => void;
  permission?: PermissionRequest;
  question?: QuestionRequest;
};
const pending = new Map<string, Pending>();

function summarize(input: Record<string, unknown>): string {
  for (const k of ["command", "file_path", "path", "url", "pattern", "description"]) {
    if (typeof input[k] === "string" && input[k]) return String(input[k]).slice(0, 300);
  }
  return JSON.stringify(input).slice(0, 300);
}

function askUser(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  toolUseID: string,
  requestId: string,
  suggestions: PermissionUpdate[] | undefined,
  signal: AbortSignal,
  title?: string,
): Promise<PermissionResult> {
  return new Promise<PermissionResult>((resolve) => {
    const id = `${toolName === "AskUserQuestion" ? "que" : "per"}_${requestId}`;
    const entry: Pending = { sessionId, input, suggestions, resolve };
    const tool = { messageID: "", callID: toolUseID };

    if (toolName === "AskUserQuestion" && Array.isArray(input.questions)) {
      entry.question = {
        id,
        sessionID: sessionId,
        tool,
        questions: (input.questions as any[]).map((q) => ({
          question: String(q.question ?? ""),
          header: String(q.header ?? ""),
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => ({ label: String(o.label ?? ""), description: String(o.description ?? "") }))
            : [],
          multiple: !!q.multiSelect,
        })),
      };
      pending.set(id, entry);
      emit("question.asked", entry.question as unknown as Record<string, unknown>);
    } else {
      entry.permission = {
        id,
        sessionID: sessionId,
        permission: toolName,
        patterns: [summarize(input)],
        metadata: { title, input, ...(typeof input.command === "string" ? { command: input.command } : {}) },
        always: suggestions?.length ? [toolName] : [],
        tool,
      };
      pending.set(id, entry);
      emit("permission.asked", entry.permission as unknown as Record<string, unknown>);
    }

    signal.addEventListener("abort", () => settle(id, { behavior: "deny", message: "Cancelled" }), { once: true });
  });
}

function settle(id: string, result: PermissionResult, reply?: string): boolean {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  p.resolve(result);
  if (p.question) {
    emit(reply === "reject" || result.behavior === "deny" ? "question.rejected" : "question.replied", {
      sessionID: p.sessionId,
      requestID: id,
    });
  } else {
    emit("permission.replied", { sessionID: p.sessionId, requestID: id, reply: reply ?? "reject" });
  }
  return true;
}

function denyAll(sessionId: string, message: string): void {
  for (const [id, p] of [...pending]) {
    if (p.sessionId === sessionId) settle(id, { behavior: "deny", message });
  }
}

export const listPermissions = () =>
  [...pending.values()].flatMap((p) => (p.permission ? [p.permission] : []));
export const listQuestions = () =>
  [...pending.values()].flatMap((p) => (p.question ? [p.question] : []));

export function replyPermission(id: string, reply: string): boolean {
  const p = pending.get(id);
  if (!p?.permission) return false;
  if (reply === "once") return settle(id, { behavior: "allow", updatedInput: p.input }, "once");
  if (reply === "always") {
    return settle(
      id,
      { behavior: "allow", updatedInput: p.input, ...(p.suggestions ? { updatedPermissions: p.suggestions } : {}) },
      "always",
    );
  }
  return settle(id, { behavior: "deny", message: "The user rejected this action" }, "reject");
}

export function replyQuestion(id: string, answers: string[][] | null): boolean {
  const p = pending.get(id);
  if (!p?.question) return false;
  if (!answers) return settle(id, { behavior: "deny", message: "The user declined to answer" }, "reject");
  const byQuestion: Record<string, string> = {};
  p.question.questions.forEach((q, i) => {
    byQuestion[q.question] = (answers[i] ?? []).join(", ");
  });
  return settle(id, { behavior: "allow", updatedInput: { ...p.input, answers: byQuestion } }, "reply");
}
