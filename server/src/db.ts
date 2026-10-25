import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  MANAGER_DB as CFG_MANAGER_DB,
  OPENCODE_DB as CFG_OPENCODE_DB,
  OPENCODE_DATA_DIR,
} from "./config";

export const OPENCODE_DB = CFG_OPENCODE_DB;
export const MANAGER_DB = CFG_MANAGER_DB;

mkdirSync(dirname(MANAGER_DB), { recursive: true });

if (!existsSync(OPENCODE_DB)) {
  console.error(
    [
      "",
      "  aiman could not find opencode's database.",
      "",
      `    looked for: ${OPENCODE_DB}`,
      `    data dir:   ${OPENCODE_DATA_DIR}`,
      "",
      "  Start opencode once (or set OPENCODE_DB) and try again.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Read-only connection to opencode's database.
export const ocRO = new Database(OPENCODE_DB, { readonly: true });
ocRO.exec("PRAGMA busy_timeout = 5000;");
ocRO.exec("PRAGMA query_only = true;");

// Writable connection, used ONLY for the archive flag on session.time_archived.
export const ocRW = new Database(OPENCODE_DB);
ocRW.exec("PRAGMA busy_timeout = 5000;");

/**
 * opencode v2 stores sessions/messages in `session_v2` / `session_message`
 * (with parts embedded in the message JSON). The v1 tables still exist for
 * databases that were migrated, so detect by schema rather than by app version.
 */
let _isV2: boolean | null = null;
export function isV2(): boolean {
  if (_isV2 === null) {
    try {
      const has = (name: string) =>
        !!ocRO
          .query("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(name);
      _isV2 = has("session_v2") && has("session_message");
    } catch {
      _isV2 = false;
    }
  }
  return _isV2;
}

// Our own database: folders, per-session metadata, search index, settings.
export const mgr = new Database(MANAGER_DB);
mgr.exec("PRAGMA journal_mode = WAL;");
mgr.exec("PRAGMA busy_timeout = 5000;");

mgr.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_meta (
    session_id TEXT PRIMARY KEY,
    folder_id  TEXT,
    tags       TEXT,
    notes      TEXT,
    pinned     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_auth (
    profile_id  TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    auth_json   TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id)
  );

  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id           TEXT PRIMARY KEY,
    active_profile_id TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip         TEXT
  );

  /* FTS5 index over conversation parts. rowid mirrors the opencode part rowid. */
  CREATE VIRTUAL TABLE IF NOT EXISTS part_fts USING fts5(
    text,
    part_id    UNINDEXED,
    session_id UNINDEXED,
    message_id UNINDEXED,
    type       UNINDEXED
  );

  /* Compact per-message usage so statistics never json_extract() the whole
     message body (which is dominated by content arrays). Filled by the same
     background pass that builds the FTS index. */
  CREATE TABLE IF NOT EXISTS msg_usage (
    message_id  TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    day         TEXT,
    provider_id TEXT,
    model_id    TEXT,
    input       INTEGER NOT NULL DEFAULT 0,
    output      INTEGER NOT NULL DEFAULT 0,
    reasoning   INTEGER NOT NULL DEFAULT 0,
    cache_read  INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    cost        REAL NOT NULL DEFAULT 0,
    time_created INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_msg_usage_session ON msg_usage(session_id);
  CREATE INDEX IF NOT EXISTS idx_msg_usage_day ON msg_usage(day);
  CREATE INDEX IF NOT EXISTS idx_msg_usage_model ON msg_usage(provider_id, model_id);
`);

// ---- lightweight migrations (add columns to existing databases) ----
function ensureColumn(table: string, column: string, decl: string): void {
  const cols = mgr.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    mgr.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
ensureColumn("session_meta", "user_id", "TEXT");
ensureColumn("session_meta", "profile_id", "TEXT");
ensureColumn("user_prefs", "onboarded", "INTEGER NOT NULL DEFAULT 0");

export function getSetting(key: string): string | null {
  const row = mgr.query("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  mgr
    .query(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}
