import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Central, cross-platform path/port configuration.
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
    return join(base, "aiman");
  }
  if (isMac) return join(homedir(), "Library", "Application Support", "aiman");
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "aiman");
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

export const UPDATE_REPO = process.env.AIMAN_REPO ?? "spacewalkingninja/aiman";

export const DIST =
  ensureEnv("DIST") ?? resolve(import.meta.dir, "..", "..", "dist");

export const MANAGER_DB = ensureEnv("MANAGER_DB") ?? join(AIMAN_HOME, "manager.db");

/**
 * Candidate opencode data directories.
 *
 * opencode moved its state between v1 and v2 (and Windows builds have used
 * %LOCALAPPDATA% and %APPDATA% over time), so a directory existing is not proof
 * that it holds the database. Prefer whichever candidate actually contains
 * `opencode.db`, then fall back to a directory that exists.
 */
function opencodeDataDir(): string {
  const home = homedir();
  const candidates: string[] = [];
  if (isWindows) {
    candidates.push(join(home, ".local", "share", "opencode"));
    if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "opencode"));
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "opencode"));
  } else if (isMac) {
    candidates.push(join(home, "Library", "Application Support", "opencode"));
    candidates.push(join(home, ".local", "share", "opencode"));
  } else {
    if (process.env.XDG_DATA_HOME) candidates.push(join(process.env.XDG_DATA_HOME, "opencode"));
    candidates.push(join(home, ".local", "share", "opencode"));
  }

  const withDb = candidates.find((c) => existsSync(join(c, "opencode.db")));
  if (withDb) return withDb;

  const withDir = candidates.find((c) => existsSync(c));
  return withDir ?? candidates[candidates.length - 1]!;
}

export type OpenCodeServerProfile = {
  id: string;
  name: string;
  url: string;
  password?: string;
  db?: string;
  auth?: string;
};

export type OpenCodeServersFile = {
  activeId: string | null;
  servers: OpenCodeServerProfile[];
};

export const SERVERS_FILE = join(AIMAN_HOME, "opencode-servers.json");

function readServerFile(): OpenCodeServersFile {
  try {
    const parsed = JSON.parse(readFileSync(SERVERS_FILE, "utf8"));
    if (parsed && Array.isArray(parsed.servers)) {
      return {
        activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
        servers: parsed.servers.filter(
          (item: any) => item && typeof item.id === "string" && typeof item.url === "string",
        ),
      };
    }
  } catch {}
  return { activeId: null, servers: [] };
}

const serverFile = readServerFile();
const activeServer =
  serverFile.servers.find((item) => item.id === serverFile.activeId) ??
  serverFile.servers[0] ??
  null;

const detectedDataDir = opencodeDataDir();
export const OPENCODE_DATA_DIR = activeServer?.db
  ? dirname(activeServer.db)
  : detectedDataDir;

export const OPENCODE_DB =
  ensureEnv("OPENCODE_DB") ?? activeServer?.db ?? join(OPENCODE_DATA_DIR, "opencode.db");

export const OPENCODE_AUTH =
  ensureEnv("OPENCODE_AUTH") ?? activeServer?.auth ?? join(OPENCODE_DATA_DIR, "auth.json");

/**
 * Password for `opencode serve` (v2 requires HTTP basic auth for every /api
 * route). `OPENCODE_SERVER_PASSWORD` is the variable opencode itself reads, so
 * accept both spellings and pass the same value to the child process.
 */
export const OPENCODE_PASSWORD =
  ensureEnv("OPENCODE_PASSWORD") ??
  ensureEnv("OPENCODE_SERVER_PASSWORD") ??
  activeServer?.password ??
  "";

export const AUTH_BACKUP =
  ensureEnv("AUTH_BACKUP") ?? join(AIMAN_HOME, "opencode-auth-backup.json");

export const PORT = Number(ensureEnv("PORT") ?? 4097);
export const HOST = ensureEnv("HOST") ?? "127.0.0.1";
export const OPENCODE_URL =
  ensureEnv("OPENCODE_URL") ?? activeServer?.url ?? "http://127.0.0.1:4096";
export const TERMINAL_URL = ensureEnv("TERMINAL_URL") ?? "http://127.0.0.1:4098";
