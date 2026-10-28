/**
 * In-memory log capture for the live log viewer.
 *
 * The manager writes diagnostics with console.log/warn/error. We keep a small
 * bounded ring so the UI can show recent activity and subscribe over SSE
 * without depending on an external log file or a process supervisor.
 */

import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEntry = {
  id: number;
  at: number;
  level: LogLevel;
  line: string;
};

const MAX = 1200;
const entries: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();
let nextId = 1;
let installed = false;

function stringify(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function clean(line: string): string {
  // Strip terminal colour escapes so the browser viewer stays readable.
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

export function appendLog(level: LogLevel, ...args: unknown[]): void {
  const line = clean(args.map(stringify).join(" ")).slice(0, 8000);
  if (!line) return;
  const entry: LogEntry = { id: nextId++, at: Date.now(), level, line };
  entries.push(entry);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  for (const listener of subscribers) {
    try {
      listener(entry);
    } catch {}
  }
}

export function recentLogs(after = 0, limit = 800): LogEntry[] {
  const list = after ? entries.filter((entry) => entry.id > after) : entries;
  return list.slice(-Math.max(1, Math.min(1200, limit)));
}

export function installLogCapture(): void {
  if (installed) return;
  installed = true;
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      appendLog(level === "log" ? "info" : level, ...args);
    };
  }
}

/**
 * Tail opencode's own newest log file. The manager logs remain in the same
 * viewer, but this makes provider/MCP/plugin errors visible without asking the
 * user to find the data directory.
 */
export function startOpencodeLogWatcher(logDir: string): void {
  let activeFile = "";
  let offset = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const readNew = () => {
    try {
      const files = readdirSync(logDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .map((entry) => {
          const full = join(logDir, entry.name);
          return { path: full, mtime: statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      const newest = files[0]?.path;
      if (!newest) return;
      const stat = statSync(newest);
      if (newest !== activeFile || stat.size < offset) {
        activeFile = newest;
        offset = Math.max(0, stat.size - 24_000);
      }
      if (stat.size <= offset) return;
      const fd = openSync(newest, "r");
      const length = stat.size - offset;
      const buffer = Buffer.alloc(Math.min(length, 1_000_000));
      readSync(fd, buffer, 0, buffer.length, offset);
      closeSync(fd);
      offset += buffer.length;
      for (const line of buffer.toString("utf8").split(/\r?\n/)) {
        const clean = line.trim();
        if (clean) appendLog("info", "[opencode]", clean);
      }
    } catch {}
  };

  readNew();
  timer = setInterval(readNew, 2500);
  return () => {
    if (timer) clearInterval(timer);
  };
}

export function logStream(req: Request): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (entry: LogEntry) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(entry)}\n\n`),
          );
        } catch {}
      };
      for (const entry of recentLogs(0, 300)) send(entry);
      const listener = (entry: LogEntry) => send(entry);
      subscribers.add(listener);
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 20_000);
      const cleanup = () => {
        subscribers.delete(listener);
        if (timer) clearInterval(timer);
        timer = null;
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (timer) clearInterval(timer);
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
