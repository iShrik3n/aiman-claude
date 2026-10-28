import { homedir } from "node:os";
import { projectRoot } from "./security";

/**
 * Terminals for the web UI, on Bun's built-in PTY (no external terminal server).
 *
 * A PTY is a shell on this machine, so the client never picks the command:
 * it asks for either the user's shell or `claude --resume <id>`, in a
 * directory of a known session. Only reachable with live control on.
 */

const MAX_PTYS = 8;
const SCROLLBACK = 256 * 1024;
const CLAUDE_BIN = () => process.env.CLAUDE_BIN?.trim() || Bun.which("claude") || "claude";
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Sock = { send(data: string | Uint8Array): unknown; close(): unknown };
type Pty = {
  id: string;
  title: string;
  command: string;
  args: string[];
  cwd: string;
  proc: ReturnType<typeof Bun.spawn>;
  socks: Set<Sock>;
  buffer: Uint8Array[];
  buffered: number;
  exited: boolean;
};

const ptys = new Map<string, Pty>();

export class PtyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type PtyRequest = { cwd?: string; title?: string; resume?: string; rows?: number; cols?: number };

export function listPtys() {
  return [...ptys.values()].map(({ id, title, command, args, cwd }) => ({ id, title, command, args, cwd }));
}

export function createPty(req: PtyRequest) {
  if (ptys.size >= MAX_PTYS) throw new PtyError("too many terminals open", 429);
  const cwd = req.cwd ? projectRoot(req.cwd) : homedir();
  if (!cwd) throw new PtyError("directory is not a known project", 403);
  if (req.resume !== undefined && !SESSION_ID.test(req.resume)) {
    throw new PtyError("invalid session id", 400);
  }
  const shell = process.env.SHELL || "/bin/bash";
  const command = req.resume ? CLAUDE_BIN() : shell;
  const args = req.resume ? ["--resume", req.resume] : ["-l"];

  const id = "pty_" + crypto.randomUUID();
  const socks = new Set<Sock>();
  const pty = { id, socks, buffer: [], buffered: 0, exited: false } as unknown as Pty;
  pty.proc = Bun.spawn([command, ...args], {
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    terminal: {
      cols: clamp(req.cols, 20, 500, 120),
      rows: clamp(req.rows, 5, 200, 30),
      data(_t: unknown, chunk: Uint8Array) {
        const copy = chunk.slice();
        pty.buffer.push(copy);
        pty.buffered += copy.length;
        while (pty.buffered > SCROLLBACK && pty.buffer.length > 1) pty.buffered -= pty.buffer.shift()!.length;
        for (const s of socks) {
          try {
            s.send(copy);
          } catch {}
        }
      },
    },
  });
  Object.assign(pty, {
    title: req.title || (req.resume ? `claude ${req.resume.slice(0, 8)}` : "terminal"),
    command,
    args,
    cwd,
  });
  pty.proc.exited.then(() => {
    pty.exited = true;
    for (const s of socks) {
      try {
        s.close();
      } catch {}
    }
    socks.clear();
    ptys.delete(id);
  });
  ptys.set(id, pty);
  return { id, title: pty.title, command, args, cwd };
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(Math.max(Math.round(v), lo), hi) : dflt;
};

export function resizePty(id: string, rows: number, cols: number, title?: string): boolean {
  const p = ptys.get(id);
  if (!p) return false;
  if (title) p.title = title.slice(0, 80);
  try {
    p.proc.terminal?.resize(clamp(cols, 20, 500, 120), clamp(rows, 5, 200, 30));
  } catch {}
  return true;
}

export function deletePty(id: string): boolean {
  const p = ptys.get(id);
  if (!p) return false;
  try {
    p.proc.kill();
  } catch {}
  ptys.delete(id);
  return true;
}

export function attachPty(id: string, sock: Sock): boolean {
  const p = ptys.get(id);
  if (!p) return false;
  for (const chunk of p.buffer) sock.send(chunk);
  p.socks.add(sock);
  return true;
}

export function detachPty(id: string, sock: Sock): void {
  ptys.get(id)?.socks.delete(sock);
}

export function writePty(id: string, data: string | Uint8Array): void {
  const p = ptys.get(id);
  if (!p || p.exited) return;
  try {
    p.proc.terminal?.write(data);
  } catch {}
}

export function shutdownPtys(): void {
  for (const id of [...ptys.keys()]) deletePty(id);
}
// Runs on process.exit(), which the SIGINT/SIGTERM handler in live.ts calls.
process.on("exit", shutdownPtys);
