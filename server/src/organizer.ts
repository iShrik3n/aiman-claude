import { getSetting, isV2, ocRO, setSetting } from "./db";
import { oneShot } from "./oneshot";
import {
  createFolder,
  getAllSessions,
  getMetaMap,
  listFolders,
  markSessionAutoOrganized,
  setSessionFolder,
  type Folder,
  type SessionRow,
} from "./manager";

/**
 * AI-assisted session filing.
 *
 * The organizer asks Claude (oneshot.ts) for a JSON folder plan, applies it to aiman's
 * session_meta table, and stores directory rules so a session that reaches its
 * 10th user message can be filed without another model round-trip.
 *
 * Sends session titles, directories and short snippets of the first prompt and
 * last answer to Claude on the user's own account, so it only runs when asked
 * (the button) or when AIMAN_AUTO_FILE=1 is set.
 */

const AUTO_RULES_KEY = "auto_folder_rules";
const AUTO_SINCE_KEY = "auto_organize_since";
const PLAN_TIMEOUT_MS = 180_000;

type Plan = {
  folders?: { path: unknown[]; color?: string }[];
  assignments?: { sessionID?: unknown; folder?: unknown[] }[];
  rules?: { directoryPrefix?: unknown; folder?: unknown[] }[];
};

type AutoRule = { prefix: string; folderId: string };
type AutoRules = { updatedAt: number; rules: AutoRule[] };

function jsonParse(text: string | null | undefined): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanPath(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function pathKey(parts: string[]): string {
  return parts.map((part) => part.toLowerCase()).join("\u0000");
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function pathMatches(directory: string, prefix: string): boolean {
  const dir = normalizePrefix(directory);
  if (dir === prefix) return true;
  return dir.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

function folderPaths(folders: Folder[]): Map<string, string[]> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const out = new Map<string, string[]>();
  for (const folder of folders) {
    const parts: string[] = [];
    let current: Folder | undefined = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    out.set(folder.id, parts);
  }
  return out;
}

function textSnippet(sessionId: string, role: "user" | "assistant", newest: boolean): string {
  try {
    const row = ocRO
      .query(
        `SELECT p.data FROM part p JOIN message m ON m.id = p.message_id
          WHERE m.session_id = ? AND json_extract(m.data, '$.role') = ?
            AND json_extract(p.data, '$.type') = 'text'
          ORDER BY m.time_created ${newest ? "DESC" : "ASC"} LIMIT 1`,
      )
      .get(sessionId, role) as { data: string } | undefined;
    return String(jsonParse(row?.data)?.text ?? "").trim();
  } catch {
    return "";
  }
}

function sessionSnippet(session: SessionRow): { firstUser: string; lastAssistant: string } {
  return {
    firstUser: textSnippet(session.id, "user", false).slice(0, 260),
    lastAssistant: textSnippet(session.id, "assistant", true).slice(0, 260),
  };
}

export function sessionsForOrganizing(): SessionRow[] {
  return getAllSessions()
    .filter((session) => session.time_archived == null && !session.parent_id)
    .slice(0, 500);
}

export function promptFor(sessions: SessionRow[], only?: string): string {
  const folders = listFolders();
  const paths = folderPaths(folders);
  const meta = getMetaMap();
  const dirCounts = new Map<string, number>();
  for (const session of sessions) {
    dirCounts.set(session.directory, (dirCounts.get(session.directory) ?? 0) + 1);
  }

  const folderLines = folders.length
    ? folders
        .map((folder) => {
          const path = paths.get(folder.id) ?? [folder.name];
          return `- ${path.join(" / ")}`;
        })
        .join("\n")
    : "(none yet)";

  const directoryLines = [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([dir, count]) => `- ${dir} (${count} session${count === 1 ? "" : "s"})`)
    .join("\n");

  const sessionLines = sessions
    .map((session) => {
      const metaRow = meta.get(session.id);
      const current = metaRow?.folder_id ? (paths.get(metaRow.folder_id) ?? []).join(" / ") : "";
      const snippet = sessionSnippet(session);
      const bits = [
        `- id=${session.id}`,
        `title=${JSON.stringify(session.title || "(untitled)")}`,
        `directory=${JSON.stringify(session.directory)}`,
        `messages=${session.message_count}`,
        `currentFolder=${JSON.stringify(current || null)}`,
      ];
      if (snippet.firstUser) bits.push(`firstUser=${JSON.stringify(snippet.firstUser)}`);
      if (snippet.lastAssistant) bits.push(`lastAssistant=${JSON.stringify(snippet.lastAssistant)}`);
      return bits.join(" | ");
    })
    .join("\n");

  return `You are the automatic folder organizer for aiman, a manager for Claude Code sessions.
Analyze the session titles, working directories, and short conversation snippets.
Filesystem directories are strong signals: sessions in the same project or nearby folders usually belong together.

Existing aiman folder tree:
${folderLines}

Filesystem directories used by sessions:
${directoryLines}

Sessions${only ? " to organize" : " to organize"}:
${sessionLines}

Return ONLY one JSON object, with no Markdown fences and no explanation:
{
  "folders": [{"path": ["Parent", "Child"], "color": "#5b9dff"}],
  "assignments": [{"sessionID": "ses_...", "folder": ["Parent", "Child"]}],
  "rules": [{"directoryPrefix": "C:/path/to/project", "folder": ["Parent", "Child"]}]
}

Rules:
- Build a concise, useful tree, at most 3 levels deep. Reuse existing folders when they fit.
- Assign every listed session that has no current folder. Do not reassign sessions that already have a currentFolder.
- Folder paths must be arrays of short names. Use the same path in folders, assignments, and rules.
- Rules are for future sessions. Use the longest stable directory prefix, not a session-specific file path.
- Prefer grouping by project/client/topic, not by individual session title.
- It is valid to omit empty folders or rules.
${only ? "- Organize only the single listed session; you may create a folder for it." : "- Cover all listed sessions."}`;
}

export function extractPlan(text: string): Plan {
  const withoutFences = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The organizer did not return a JSON object.");
  const parsed = jsonParse(withoutFences.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object") throw new Error("The organizer returned invalid JSON.");
  return parsed as Plan;
}

/** Planning across hundreds of sessions needs more than the cheapest model. */
const ORGANIZER_MODEL = "claude-sonnet-5-5";

async function runOrganizer(prompt: string, options: OrganizerOptions = {}): Promise<{ sessionId: null; text: string }> {
  const text = await oneShot(prompt, {
    model: options.model?.modelID ?? ORGANIZER_MODEL,
    timeoutMs: PLAN_TIMEOUT_MS,
  });
  return { sessionId: null, text };
}

type OrganizerOptions = {
  model?: { providerID: string; modelID: string; variant?: string };
  agent?: string;
};

type ApplyStats = { assigned: number; foldersCreated: number; rules: number };

export function applyPlan(plan: Plan, options: { onlySessionId?: string; markAll: boolean }): ApplyStats {
  const folders = listFolders();
  const paths = folderPaths(folders);
  const byKey = new Map<string, string>();
  for (const folder of folders) byKey.set(pathKey(paths.get(folder.id) ?? [folder.name]), folder.id);
  let foldersCreated = 0;

  const ensurePath = (parts: string[], color?: string): string | null => {
    let parentId: string | null = null;
    const prefix: string[] = [];
    for (const part of parts) {
      prefix.push(part);
      const key = pathKey(prefix);
      let id = byKey.get(key);
      if (!id) {
        const created = createFolder(part, color ?? null, parentId);
        id = created.id;
        byKey.set(key, id);
        foldersCreated++;
      }
      parentId = id;
    }
    return parentId;
  };

  for (const folder of plan.folders ?? []) {
    const parts = cleanPath(folder?.path);
    if (parts.length) ensurePath(parts, folder?.color);
  }

  const knownSessions = new Set(getAllSessions().map((session) => session.id));
  const meta = getMetaMap();
  let assigned = 0;
  for (const assignment of plan.assignments ?? []) {
    const sessionId = typeof assignment?.sessionID === "string" ? assignment.sessionID : "";
    const parts = cleanPath(assignment?.folder);
    if (!sessionId || !knownSessions.has(sessionId) || !parts.length) continue;
    if (options.onlySessionId && sessionId !== options.onlySessionId) continue;
    // Preserve folders the user already chose manually.
    if (meta.get(sessionId)?.folder_id) continue;
    const folderId = ensurePath(parts);
    if (!folderId) continue;
    setSessionFolder(sessionId, folderId);
    assigned++;
  }

  const rules: AutoRule[] = [];
  const seenRules = new Set<string>();
  const addRule = (prefix: string, folderId: string) => {
    const normalized = normalizePrefix(prefix);
    if (!normalized) return;
    const key = `${normalized}\u0000${folderId}`;
    if (seenRules.has(key)) return;
    seenRules.add(key);
    rules.push({ prefix: normalized, folderId });
  };
  for (const rule of plan.rules ?? []) {
    const prefix = typeof rule?.directoryPrefix === "string" ? rule.directoryPrefix : "";
    const parts = cleanPath(rule?.folder);
    if (!prefix || !parts.length) continue;
    const folderId = ensurePath(parts);
    if (folderId) addRule(prefix, folderId);
  }
  // Add a fallback rule for each assigned session's own directory. This makes
  // future sessions from the same project file immediately at message ten.
  for (const assignment of plan.assignments ?? []) {
    const sessionId = typeof assignment?.sessionID === "string" ? assignment.sessionID : "";
    const parts = cleanPath(assignment?.folder);
    if (!sessionId || !parts.length) continue;
    const session = getAllSessions().find((row) => row.id === sessionId);
    const folderId = byKey.get(pathKey(parts));
    if (session && folderId) addRule(session.directory, folderId);
  }

  // Conflicting catch-all rules are dangerous: a home-directory rule would
  // beat every future project rule that does not exist yet. Keep the most
  // specific rule whenever a broader prefix points somewhere else.
  const deduped = new Map<string, AutoRule>();
  for (const rule of rules) if (!deduped.has(rule.prefix)) deduped.set(rule.prefix, rule);
  const usefulRules = [...deduped.values()].filter(
    (rule) =>
      !rules.some(
        (other) =>
          other.prefix.length > rule.prefix.length &&
          other.folderId !== rule.folderId &&
          other.prefix.startsWith(rule.prefix.endsWith("/") ? rule.prefix : rule.prefix + "/"),
      ),
  );
  if (usefulRules.length) {
    const payload: AutoRules = { updatedAt: Date.now(), rules: usefulRules };
    setSetting(AUTO_RULES_KEY, JSON.stringify(payload));
  }

  // Child/subagent sessions follow their parent folder rather than appearing
  // as unfiled strays in the tree.
  inheritChildFolders();

  if (options.markAll) {
    for (const session of getAllSessions()) {
      try {
        markSessionAutoOrganized(session.id);
      } catch {}
    }
  } else if (options.onlySessionId) {
    markSessionAutoOrganized(options.onlySessionId);
  }

  setSetting(AUTO_SINCE_KEY, String(Date.now()));
  return { assigned, foldersCreated, rules: usefulRules.length };
}

/** Give unassigned child sessions the same folder as their parent. */
function inheritChildFolders(): void {
  const all = getAllSessions();
  const meta = getMetaMap();
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of all) {
      if (!child.parent_id) continue;
      if (meta.get(child.id)?.folder_id) continue;
      const parentFolder = meta.get(child.parent_id)?.folder_id;
      if (!parentFolder) continue;
      setSessionFolder(child.id, parentFolder);
      const row = meta.get(child.id) ?? {
        session_id: child.id,
        folder_id: parentFolder,
        tags: null,
        notes: null,
        pinned: 0,
        user_id: null,
        profile_id: null,
      };
      row.folder_id = parentFolder;
      meta.set(child.id, row);
      changed = true;
    }
  }
}

export async function autoOrganizeAll(options: OrganizerOptions = {}) {
  const sessions = sessionsForOrganizing();
  if (!sessions.length) return { sessionId: null, assigned: 0, foldersCreated: 0, rules: 0 };
  const { sessionId, text } = await runOrganizer(promptFor(sessions), options);
  const plan = extractPlan(text);
  const stats = applyPlan(plan, { markAll: true });
  return { sessionId, ...stats };
}

export function getAutoRules(): AutoRules | null {
  const parsed = jsonParse(getSetting(AUTO_RULES_KEY));
  if (!parsed || !Array.isArray(parsed.rules)) return null;
  return {
    updatedAt: Number(parsed.updatedAt ?? 0),
    rules: parsed.rules
      .filter((rule: any) => typeof rule?.prefix === "string" && typeof rule?.folderId === "string")
      .map((rule: any) => ({ prefix: rule.prefix, folderId: rule.folderId })),
  };
}

function matchingRule(directory: string): AutoRule | null {
  const rules = getAutoRules();
  if (!rules) return null;
  const folderIds = new Set(listFolders().map((folder) => folder.id));
  return (
    rules.rules
      .filter((rule) => folderIds.has(rule.folderId) && pathMatches(directory, rule.prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null
  );
}

function userMessageCounts(): Map<string, number> {
  const rows = (isV2()
    ? ocRO
        .query(
          `SELECT session_id, COUNT(*) AS n FROM session_message
            WHERE type = 'user' GROUP BY session_id HAVING n >= 10`,
        )
        .all()
    : ocRO
        .query(
          `SELECT session_id, COUNT(*) AS n FROM message
            WHERE json_extract(data,'$.role') = 'user'
            GROUP BY session_id HAVING n >= 10`,
        )
        .all()) as { session_id: string; n: number }[];
  return new Map(rows.map((row) => [row.session_id, row.n]));
}

function sessionModel(sessionId: string): OrganizerOptions["model"] | undefined {
  if (!isV2()) return undefined;
  try {
    const row = ocRO
      .query("SELECT model FROM session_v2 WHERE id = ?")
      .get(sessionId) as { model: string | null } | undefined;
    const model = jsonParse(row?.model);
    if (!model?.providerID || !(model?.id ?? model?.modelID)) return undefined;
    return {
      providerID: String(model.providerID),
      modelID: String(model.id ?? model.modelID),
      ...(typeof model.variant === "string" && model.variant ? { variant: model.variant } : {}),
    };
  } catch {
    return undefined;
  }
}

export function ensureAutoOrganizeBaseline(): void {
  if (!getSetting(AUTO_SINCE_KEY)) setSetting(AUTO_SINCE_KEY, String(Date.now()));
}

let scanInFlight = false;
let lastScan = 0;
const retryAfter = new Map<string, number>();

/**
 * Find sessions created after the baseline that have reached ten user messages
 * and are not filed yet. Runs in the background; never blocks the UI.
 */
export async function scanForAutoOrganize(): Promise<void> {
  if (scanInFlight || Date.now() - lastScan < 10_000) return;
  scanInFlight = true;
  lastScan = Date.now();
  try {
    ensureAutoOrganizeBaseline();
    const since = Number(getSetting(AUTO_SINCE_KEY) ?? Date.now());
    const counts = userMessageCounts();
    if (!counts.size) return;
    const meta = getMetaMap();
    const sessions = getAllSessions();
    const candidates = sessions.filter(
      (session) =>
        !session.parent_id &&
        session.time_archived == null &&
        session.time_created >= since &&
        (counts.get(session.id) ?? 0) >= 10 &&
        !meta.get(session.id)?.auto_organized_at &&
        !meta.get(session.id)?.folder_id,
    );
    for (const session of sessions) {
      if ((counts.get(session.id) ?? 0) < 10) continue;
      if (meta.get(session.id)?.folder_id && !meta.get(session.id)?.auto_organized_at) {
        try {
          markSessionAutoOrganized(session.id);
        } catch {}
      }
    }

    for (const session of candidates.slice(0, 3)) {
      if ((retryAfter.get(session.id) ?? 0) > Date.now()) continue;
      const rule = matchingRule(session.directory);
      if (rule) {
        setSessionFolder(session.id, rule.folderId);
        inheritChildFolders();
        markSessionAutoOrganized(session.id);
        continue;
      }
      try {
        const plan = await runOrganizer(promptFor([session], session.id), {
          model: sessionModel(session.id),
        });
        const parsed = extractPlan(plan.text);
        applyPlan(parsed, { onlySessionId: session.id, markAll: false });
      } catch (error) {
        console.warn(`[organizer] could not file ${session.id}:`, String(error));
        retryAfter.set(session.id, Date.now() + 5 * 60_000);
      }
    }
  } catch (error) {
    console.warn("[organizer] scan failed:", String(error));
  } finally {
    scanInFlight = false;
  }
}
