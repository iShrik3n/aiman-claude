import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MANAGER_DB as CFG_MANAGER_DB, OPENCODE_DB as CFG_OPENCODE_DB } from "./config";

export const OPENCODE_DB = CFG_OPENCODE_DB;
export const MANAGER_DB = CFG_MANAGER_DB;

mkdirSync(dirname(MANAGER_DB), { recursive: true });
mkdirSync(dirname(OPENCODE_DB), { recursive: true });

/**
 * The "opencode" database here is aiman-claude's derived index of Claude Code's
 * JSONL transcripts (see claude.ts), laid out like opencode v1 so the queries
 * elsewhere in the server keep working. Claude Code's own files are never
 * written to; this database is.
 */
export const ocRW = new Database(OPENCODE_DB);
ocRW.exec("PRAGMA journal_mode = WAL;");
ocRW.exec("PRAGMA busy_timeout = 5000;");
ocRW.exec(`
  CREATE TABLE IF NOT EXISTS session (
    id           TEXT PRIMARY KEY,
    parent_id    TEXT,
    slug         TEXT NOT NULL DEFAULT '',
    directory    TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL DEFAULT '',
    title_locked INTEGER NOT NULL DEFAULT 0,
    revert       TEXT,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    time_archived INTEGER
  );
  CREATE TABLE IF NOT EXISTS message (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    data         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id, time_created);
  CREATE TABLE IF NOT EXISTS part (
    id           TEXT PRIMARY KEY,
    message_id   TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_part_session ON part(session_id, time_created);
  CREATE INDEX IF NOT EXISTS idx_part_updated ON part(time_updated);
  CREATE TABLE IF NOT EXISTS source_file (
    path       TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    size       INTEGER NOT NULL,
    mtime_ms   INTEGER NOT NULL
  );
`);

// Read-only handle for queries, so a stray write elsewhere fails loudly.
export const ocRO = new Database(OPENCODE_DB, { readonly: true });
ocRO.exec("PRAGMA busy_timeout = 5000;");
ocRO.exec("PRAGMA query_only = true;");

/** Always the v1 (session / message / part) layout; kept for call sites. */
export function isV2(): boolean {
  return false;
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

  /* Messages the user wants delivered after the current agent task is fully
     quiescent. The aiman worker owns delivery; opencode only sees the prompt
     when the strict gate passes. */
  CREATE TABLE IF NOT EXISTS queued_prompts (
    id                TEXT PRIMARY KEY,
    session_id        TEXT NOT NULL,
    text              TEXT NOT NULL DEFAULT '',
    files_json        TEXT NOT NULL DEFAULT '[]',
    created_at        INTEGER NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',
    quiet_ms          INTEGER NOT NULL DEFAULT 10000,
    block_questions   INTEGER NOT NULL DEFAULT 1,
    block_permissions INTEGER NOT NULL DEFAULT 1,
    block_shells      INTEGER NOT NULL DEFAULT 1,
    block_subagents   INTEGER NOT NULL DEFAULT 1,
    next_send_at      INTEGER,
    blocked_reason    TEXT,
    error             TEXT,
    attempts          INTEGER NOT NULL DEFAULT 0,
    sent_at           INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_queued_prompts_session
    ON queued_prompts(session_id, status, created_at);

  /* /btw side questions and their answers, scoped to the main session so the
     user can re-open old answers without keeping child sessions visible. */
  CREATE TABLE IF NOT EXISTS btw_history (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    side_session_id TEXT,
    question        TEXT NOT NULL,
    answer          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    created_at      INTEGER NOT NULL,
    prompted_at     INTEGER,
    completed_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_btw_history_session
    ON btw_history(session_id, created_at DESC);
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
ensureColumn("folders", "parent_id", "TEXT");
ensureColumn("session_meta", "auto_organized_at", "INTEGER");
ensureColumn("btw_history", "model_json", "TEXT");

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
