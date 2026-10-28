import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Central, cross-platform path/port configuration (Claude Code fork).
 *
 * Everything can be overridden with environment variables so the same build
 * runs on Linux, macOS and Windows:
 *
 *   AIMAN_HOME   base directory for our own data (manager.db, backups, …)
 *   MANAGER_DB   explicit path to our SQLite database
 *   OPENCODE_DB  explicit path to opencode's SQLite database
 *   OPENCODE_AUTH explicit path to opencode's auth.json
 *   DIST         directory containing the built web UI
 *   PORT / HOST / OPENCODE_URL
 */

const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

function ensureEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Pick the first existing path, falling back to the last candidate. */
function firstExisting(candidates: string[], fallback: string): string {
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {}
  }
  return fallback;
}

/** Platform-appropriate data directory for our own files. */
export function defaultHome(): string {
  const override = ensureEnv("AIMAN_HOME");
  if (override) return resolve(override);

  if (isWindows) {
    const base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(base, "aiman-claude");
  }
  if (isMac) return join(homedir(), "Library", "Application Support", "aiman-claude");
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "aiman-claude");
}

export const AIMAN_HOME = defaultHome();

/** Root of the installed app (contains package.json, server/, dist/, …). */
export const APP_ROOT = resolve(import.meta.dir, "..", "..");

export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/**
 * Self-update is disabled in this fork: the upstream releases are built for
 * opencode and would overwrite the Claude Code backend. Set AIMAN_REPO to a
 * repository that publishes compatible release archives to re-enable it.
 */
export const UPDATE_REPO = process.env.AIMAN_REPO ?? "";

export const DIST =
  ensureEnv("DIST") ?? resolve(import.meta.dir, "..", "..", "dist");

export const MANAGER_DB = ensureEnv("MANAGER_DB") ?? join(AIMAN_HOME, "manager.db");

/**
 * Claude Code's config directory. Its session transcripts live under
 * `<dir>/projects/<encoded cwd>/<session id>.jsonl`. We only ever read them.
 */
export const CLAUDE_CONFIG_DIR = resolve(
  ensureEnv("CLAUDE_CONFIG_DIR") ?? join(homedir(), ".claude"),
);
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_CONFIG_DIR, "projects");

/**
 * Derived index of the transcripts, stored in opencode's v1 table layout
 * (session / message / part) so the rest of the server can query it as is.
 * Mostly rebuildable from the JSONL files, but it also holds manual renames,
 * archive flags and sessions whose transcript Claude Code has since pruned, so
 * deleting it loses that data.
 */
export const INDEX_DB = ensureEnv("INDEX_DB") ?? join(AIMAN_HOME, "claude-index.db");
export const OPENCODE_DB = INDEX_DB;
export const OPENCODE_DATA_DIR = AIMAN_HOME;
/** Profiles that swap provider keys are not wired up yet; keep the path inert. */
export const OPENCODE_AUTH = join(AIMAN_HOME, "unused-auth.json");

/**
 * Password for `opencode serve` (v2 requires HTTP basic auth for every /api
 * route). `OPENCODE_SERVER_PASSWORD` is the variable opencode itself reads, so
 * accept both spellings and pass the same value to the child process.
 */
export const OPENCODE_PASSWORD =
  ensureEnv("OPENCODE_PASSWORD") ??
  ensureEnv("OPENCODE_SERVER_PASSWORD") ??
  "";

export const AUTH_BACKUP =
  ensureEnv("AUTH_BACKUP") ?? join(AIMAN_HOME, "opencode-auth-backup.json");

export const PORT = Number(ensureEnv("PORT") ?? 4197);
export const HOST = ensureEnv("HOST") ?? "127.0.0.1";
export const OPENCODE_URL =
  ensureEnv("OPENCODE_URL") ?? "http://127.0.0.1:4096";
export const TERMINAL_URL = ensureEnv("TERMINAL_URL") ?? "http://127.0.0.1:4098";

// Upstream's opencode server profiles. Disabled in this fork (the routes answer
// 501), but servers.ts still imports these, which keeps upstream merges clean.
export type OpenCodeServerProfile = {
  id: string;
  name: string;
  url: string;
  password?: string;
  db?: string;
  auth?: string;
};
export type OpenCodeServersFile = { activeId: string | null; servers: OpenCodeServerProfile[] };
export const SERVERS_FILE = join(AIMAN_HOME, "opencode-servers.json");
