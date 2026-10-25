import { isV2, ocRO, ocRW, mgr } from "./db";
import { ocData } from "./ocClient";

export type SessionRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  directory: string;
  title: string;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
  message_count: number;
};

export type SessionMeta = {
  session_id: string;
  folder_id: string | null;
  tags: string | null;
  notes: string | null;
  pinned: number;
  user_id: string | null;
  profile_id: string | null;
  auto_organized_at?: number | null;
};

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  parent_id: string | null;
};

/**
 * Session projection for either schema. v2 keeps sessions in `session_v2` and
 * messages in `session_message` (types user/assistant; the other types are
 * synthetic markers that should not count as conversation turns).
 */
function sessionSelect(where = ""): string {
  if (isV2()) {
    return `SELECT s.id, s.parent_id, s.slug, s.directory, COALESCE(s.title, '') AS title,
                   s.time_created, s.time_updated, s.time_archived,
                   COALESCE(c.n, 0) AS message_count
              FROM session_v2 s
              LEFT JOIN (
                SELECT session_id, COUNT(*) AS n
                  FROM session_message
                 WHERE type IN ('user', 'assistant')
                 GROUP BY session_id
              ) c ON c.session_id = s.id
              ${where}`;
  }
  return `SELECT s.id, s.parent_id, s.slug, s.directory, s.title,
                 s.time_created, s.time_updated, s.time_archived,
                 (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS message_count
            FROM session s
            ${where}`;
}

export function getSession(id: string): SessionRow | null {
  return (ocRO.query(sessionSelect("WHERE s.id = ?")).get(id) as SessionRow | undefined) ?? null;
}

export function getAllSessions(): SessionRow[] {
  return ocRO.query(sessionSelect()).all() as SessionRow[];
}

export function getMetaMap(): Map<string, SessionMeta> {
  const rows = mgr.query("SELECT * FROM session_meta").all() as SessionMeta[];
  return new Map(rows.map((r) => [r.session_id, r]));
}

export function listFolders(): Folder[] {
  return mgr
    .query("SELECT * FROM folders ORDER BY position ASC, name ASC")
    .all() as Folder[];
}

export function createFolder(
  name: string,
  color: string | null,
  parentId: string | null = null,
): Folder {
  const id = "fld_" + crypto.randomUUID();
  const now = Date.now();
  const pos = ((mgr.query("SELECT MAX(position) AS p FROM folders").get() as any)?.p ?? 0) + 1;
  mgr
    .query(
      "INSERT INTO folders(id, name, color, position, created_at, parent_id) VALUES(?,?,?,?,?,?)",
    )
    .run(id, name, color, pos, now, parentId);
  return { id, name, color, position: pos, created_at: now, parent_id: parentId };
}

export function updateFolder(
  id: string,
  patch: {
    name?: string;
    color?: string | null;
    position?: number;
    parent_id?: string | null;
  },
): boolean {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    vals.push(patch.color);
  }
  if (patch.position !== undefined) {
    sets.push("position = ?");
    vals.push(patch.position);
  }
  if (patch.parent_id !== undefined) {
    sets.push("parent_id = ?");
    vals.push(patch.parent_id);
  }
  if (!sets.length) return false;
  vals.push(id);
  mgr.query(`UPDATE folders SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return true;
}

/** Delete a folder and all of its descendants; their sessions become unfiled. */
export function deleteFolder(id: string): void {
  const all = mgr.query("SELECT id, parent_id FROM folders").all() as {
    id: string;
    parent_id: string | null;
  }[];
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of all) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  mgr
    .query(`UPDATE session_meta SET folder_id = NULL WHERE folder_id IN (${placeholders})`)
    .run(...list);
  mgr.query(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...list);
}

/** All folder ids in a subtree, including the root id. */
export function folderSubtreeIds(id: string): Set<string> {
  const all = mgr.query("SELECT id, parent_id FROM folders").all() as {
    id: string;
    parent_id: string | null;
  }[];
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of all) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function setSessionFolder(sessionId: string, folderId: string | null): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, folder_id) VALUES(?, ?)
       ON CONFLICT(session_id) DO UPDATE SET folder_id = excluded.folder_id`,
    )
    .run(sessionId, folderId);
}

export function markSessionAutoOrganized(sessionId: string): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, auto_organized_at) VALUES(?, ?)
       ON CONFLICT(session_id) DO UPDATE SET auto_organized_at = excluded.auto_organized_at`,
    )
    .run(sessionId, Date.now());
}

export function setSessionPinned(sessionId: string, pinned: boolean): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, pinned) VALUES(?, ?)
       ON CONFLICT(session_id) DO UPDATE SET pinned = excluded.pinned`,
    )
    .run(sessionId, pinned ? 1 : 0);
}

export function setSessionOwner(
  sessionId: string,
  userId: string | null,
  profileId: string | null,
): void {
  mgr
    .query(
      `INSERT INTO session_meta(session_id, user_id, profile_id) VALUES(?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, session_meta.user_id),
         profile_id = COALESCE(excluded.profile_id, session_meta.profile_id)`,
    )
    .run(sessionId, userId, profileId);
}

export function getSessionMeta(sessionId: string): SessionMeta | null {
  return (
    (mgr.query("SELECT * FROM session_meta WHERE session_id = ?").get(sessionId) as
      | SessionMeta
      | undefined) ?? null
  );
}

/** Session ids matching an optional user and/or profile filter. */
export function sessionIdsByMeta(filter: { userId?: string; profileId?: string } = {}): string[] {
  const sets: string[] = [];
  const vals: any[] = [];
  if (filter.userId) {
    sets.push("user_id = ?");
    vals.push(filter.userId);
  }
  if (filter.profileId) {
    sets.push("profile_id = ?");
    vals.push(filter.profileId);
  }
  const where = sets.length ? " WHERE " + sets.join(" AND ") : "";
  const rows = mgr
    .query(`SELECT session_id FROM session_meta${where}`)
    .all(...vals) as { session_id: string }[];
  return rows.map((r) => r.session_id);
}

export function setArchived(sessionId: string, archived: boolean): void {
  const table = isV2() ? "session_v2" : "session";
  ocRW
    .query(`UPDATE ${table} SET time_archived = ? WHERE id = ?`)
    .run(archived ? Date.now() : null, sessionId);
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  if (isV2()) {
    // Prefer the API so opencode emits session.renamed and every client agrees.
    try {
      await ocData(`/api/session/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      return;
    } catch {}
    ocRW.query("UPDATE session_v2 SET title = ? WHERE id = ?").run(title, sessionId);
    return;
  }
  ocRW.query("UPDATE session SET title = ? WHERE id = ?").run(title, sessionId);
}

export function getSessionsByIds(ids: string[]): Map<string, { title: string; directory: string }> {
  const out = new Map<string, { title: string; directory: string }>();
  if (!ids.length) return out;
  const placeholders = ids.map(() => "?").join(",");
  const table = isV2() ? "session_v2" : "session";
  const rows = ocRO
    .query(
      `SELECT id, COALESCE(title, '') AS title, directory FROM ${table} WHERE id IN (${placeholders})`,
    )
    .all(...ids) as { id: string; title: string; directory: string }[];
  for (const r of rows) out.set(r.id, { title: r.title, directory: r.directory });
  return out;
}

export function distinctDirectories(): string[] {
  const table = isV2() ? "session_v2" : "session";
  const rows = ocRO
    .query(`SELECT DISTINCT directory FROM ${table} ORDER BY directory`)
    .all() as { directory: string }[];
  return rows.map((r) => r.directory).filter(Boolean);
}

export function sessionDirectory(id: string): string | null {
  const table = isV2() ? "session_v2" : "session";
  const r = ocRO.query(`SELECT directory FROM ${table} WHERE id = ?`).get(id) as
    | { directory: string }
    | undefined;
  return r?.directory ?? null;
}
