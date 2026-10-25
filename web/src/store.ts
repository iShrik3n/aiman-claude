import { useSyncExternalStore } from "react";
import {
  api,
  type Folder,
  type MessageEntry,
  type Part,
  type Permission,
  type Profile,
  type QuestionRequest,
  type Session,
  type Status,
  type Todo,
} from "./api";
import { applyTheme, DEFAULT_THEME } from "./themes";
import {
  DEFAULT_MAX_IMAGE_MB,
  DEFAULT_MAX_PDF_MB,
  DEFAULT_MAX_TEXT_KB,
} from "./filePreview";

export type View =
  | "chat"
  | "search"
  | "terminal"
  | "users"
  | "stats"
  | "profiles"
  | "settings"
  | "extensions";

export type ChatMode = "web" | "terminal";

export type Filters = {
  archived: "0" | "1" | "all";
  folder: string | null; // folder id | "none" | null (all)
  directory: string | null;
  q: string;
  sort: string;
};

type Auth = {
  loading: boolean;
  authenticated: boolean;
  needsSetup: boolean;
  user: { id: string; username: string; is_admin: number } | null;
};

export type ModelOpt = {
  key: string;
  label: string;
  providerID: string;
  modelID: string;
  /** Reasoning-effort variants supported by this model (empty for most). */
  variants: string[];
  /** Context window in tokens (0 when the provider does not expose one). */
  context: number;
};
export type MenuKind = "leader" | "models" | "agents" | "help" | null;

type State = {
  auth: Auth;
  ready: boolean;
  routeReady: boolean;
  connected: boolean;
  sessions: Session[];
  folders: Folder[];
  directories: string[];
  view: View;
  activeSessionId: string | null;
  entries: Record<string, MessageEntry[]>;
  statuses: Record<string, Status>;
  permissions: Record<string, Permission[]>;
  questions: Record<string, QuestionRequest[]>;
  todos: Record<string, Todo[]>;
  filters: Filters;
  toast: string | null;
  models: ModelOpt[];
  agents: string[];
  model: string;
  /** Selected reasoning-effort variant for `model` ("" = provider default). */
  variant: string;
  agent: string;
  menu: MenuKind;
  profiles: Profile[];
  activeProfile: string | null;
  chatMode: ChatMode;
  theme: string;
  onboarded: boolean | null;
  opencodeV2: boolean;
  thinkingOpen: boolean;
  shellOutputOpen: boolean;
  /** Do not prefetch file contents for the split code map. */
  fileMapSkipContent: boolean;
  /** In lightweight mode, still show images, PDFs and small text files. */
  fileMapSafePreviews: boolean;
  /** Size caps for lightweight previews (KB for text, MB for media). */
  fileMapMaxTextKb: number;
  fileMapMaxImageMb: number;
  fileMapMaxPdfMb: number;
  /** Deferred-message queue settings. */
  queueEnabled: boolean;
  queueEnter: boolean;
  queueQuietSeconds: number;
  queueBlockQuestions: boolean;
  queueBlockPermissions: boolean;
  queueBlockShells: boolean;
  queueBlockSubagents: boolean;
  /** Merge the app toolbar into the desktop title bar. */
  compactToolbar: boolean;
};

/** Read a positive numeric setting from localStorage, clamped to a range. */
function readLimit(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    const value = raw == null ? fallback : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  } catch {
    return fallback;
  }
}

/** Per-model variant memory, e.g. { "deepseek/deepseek-flash": "high" }. */
function readVariantMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem("oc_model_variants") ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const initialModel =
  (typeof localStorage !== "undefined" && localStorage.getItem("oc_model")) ||
  "deepseek/deepseek-flash";
const initialVariant = readVariantMap()[initialModel] ?? "";

let state: State = {
  auth: { loading: true, authenticated: false, needsSetup: false, user: null },
  ready: false,
  routeReady: false,
  connected: false,
  sessions: [],
  folders: [],
  directories: [],
  view: "chat",
  activeSessionId: null,
  entries: {},
  statuses: {},
  permissions: {},
  questions: {},
  todos: {},
  filters: { archived: "0", folder: null, directory: null, q: "", sort: "updated" },
  toast: null,
  models: [],
  agents: [],
  model: initialModel,
  variant: initialVariant,
  agent: localStorage.getItem("oc_agent") ?? "build",
  menu: null,
  profiles: [],
  activeProfile: null,
  chatMode: ((typeof localStorage !== "undefined" && localStorage.getItem("oc_chat_mode")) ||
    "terminal") as ChatMode,
  theme:
    (typeof localStorage !== "undefined" && localStorage.getItem("oc_theme")) || DEFAULT_THEME,
  onboarded: null,
  opencodeV2: false,
  thinkingOpen: (typeof localStorage !== "undefined" ? localStorage.getItem("oc_thinking_open") : "1") !== "0",
  shellOutputOpen:
    (typeof localStorage !== "undefined" ? localStorage.getItem("oc_shell_output_open") : "1") !== "0",
  fileMapSkipContent:
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("oc_file_map_skip_content")
      : "1") !== "0",
  fileMapSafePreviews:
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("oc_file_map_safe_previews")
      : "1") !== "0",
  fileMapMaxTextKb: readLimit("oc_file_map_max_text_kb", DEFAULT_MAX_TEXT_KB, 1, 4096),
  fileMapMaxImageMb: readLimit("oc_file_map_max_image_mb", DEFAULT_MAX_IMAGE_MB, 0.1, 100),
  fileMapMaxPdfMb: readLimit("oc_file_map_max_pdf_mb", DEFAULT_MAX_PDF_MB, 0.1, 500),
  queueEnabled:
    (typeof localStorage !== "undefined" ? localStorage.getItem("oc_queue_enabled") : "1") !== "0",
  queueEnter:
    typeof localStorage !== "undefined" && localStorage.getItem("oc_queue_enter") === "1",
  queueQuietSeconds: readLimit("oc_queue_quiet_seconds", 10, 0, 120),
  queueBlockQuestions:
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("oc_queue_block_questions")
      : "1") !== "0",
  queueBlockPermissions:
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("oc_queue_block_permissions")
      : "1") !== "0",
  queueBlockShells:
    (typeof localStorage !== "undefined" ? localStorage.getItem("oc_queue_block_shells") : "1") !== "0",
  queueBlockSubagents:
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("oc_queue_block_subagents")
      : "1") !== "0",
  compactToolbar:
    typeof localStorage !== "undefined" && localStorage.getItem("oc_compact_toolbar") === "1",
};

applyTheme(state.theme);

const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}
export const store = { get: () => state, set };

export function toast(msg: string) {
  set({ toast: msg });
  setTimeout(() => set({ toast: null }), 6000);
}

// ---------------- model / agent / menus ----------------

export function setModel(key: string) {
  localStorage.setItem("oc_model", key);
  set({ model: key, variant: readVariantMap()[key] ?? "" });
}

/** Pick the reasoning-effort variant for the current model ("" = default). */
export function setVariant(variant: string) {
  const map = readVariantMap();
  if (variant) map[state.model] = variant;
  else delete map[state.model];
  try {
    localStorage.setItem("oc_model_variants", JSON.stringify(map));
  } catch {}
  set({ variant });
}

export function setAgent(name: string) {
  localStorage.setItem("oc_agent", name);
  set({ agent: name });
}

export function setTheme(id: string) {
  applyTheme(id);
  try {
    localStorage.setItem("oc_theme", id);
  } catch {}
  set({ theme: id });
}

/** Whether "Thinking" cards start expanded. */
export function setThinkingOpen(open: boolean) {
  try {
    localStorage.setItem("oc_thinking_open", open ? "1" : "0");
  } catch {}
  set({ thinkingOpen: open });
}

/** Whether completed shell/bash tool cards start expanded. */
export function setShellOutputOpen(open: boolean) {
  try {
    localStorage.setItem("oc_shell_output_open", open ? "1" : "0");
  } catch {}
  set({ shellOutputOpen: open });
}

/**
 * Keep the split file map lightweight: do not prefetch text contents or image
 * thumbnails. Double-click editing still reads a single file on demand.
 */
export function setFileMapSkipContent(skip: boolean) {
  try {
    localStorage.setItem("oc_file_map_skip_content", skip ? "1" : "0");
  } catch {}
  set({ fileMapSkipContent: skip });
}

/**
 * In lightweight mode, keep rendering the cheap/visual file kinds: images,
 * PDFs and small text files. Turn this off for a metadata-only map.
 */
export function setFileMapSafePreviews(allow: boolean) {
  try {
    localStorage.setItem("oc_file_map_safe_previews", allow ? "1" : "0");
  } catch {}
  set({ fileMapSafePreviews: allow });
}

function setLimit(
  key: string,
  stateKey: "fileMapMaxTextKb" | "fileMapMaxImageMb" | "fileMapMaxPdfMb",
  value: number,
  min: number,
  max: number,
) {
  const next = Math.min(max, Math.max(min, value));
  try {
    localStorage.setItem(key, String(next));
  } catch {}
  set({ [stateKey]: next } as Partial<State>);
}

export function setFileMapMaxTextKb(value: number) {
  setLimit("oc_file_map_max_text_kb", "fileMapMaxTextKb", value, 1, 4096);
}

export function setFileMapMaxImageMb(value: number) {
  setLimit("oc_file_map_max_image_mb", "fileMapMaxImageMb", value, 0.1, 100);
}

export function setFileMapMaxPdfMb(value: number) {
  setLimit("oc_file_map_max_pdf_mb", "fileMapMaxPdfMb", value, 0.1, 500);
}

function setBoolean(key: string, stateKey: keyof State, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {}
  set({ [stateKey]: value } as Partial<State>);
}

export function setQueueEnabled(value: boolean) {
  setBoolean("oc_queue_enabled", "queueEnabled", value);
}
export function setQueueEnter(value: boolean) {
  setBoolean("oc_queue_enter", "queueEnter", value);
}
export function setQueueQuietSeconds(value: number) {
  const next = Math.min(120, Math.max(0, Math.round(value)));
  try {
    localStorage.setItem("oc_queue_quiet_seconds", String(next));
  } catch {}
  set({ queueQuietSeconds: next });
}
export function setQueueBlockQuestions(value: boolean) {
  setBoolean("oc_queue_block_questions", "queueBlockQuestions", value);
}
export function setQueueBlockPermissions(value: boolean) {
  setBoolean("oc_queue_block_permissions", "queueBlockPermissions", value);
}
export function setQueueBlockShells(value: boolean) {
  setBoolean("oc_queue_block_shells", "queueBlockShells", value);
}
export function setQueueBlockSubagents(value: boolean) {
  setBoolean("oc_queue_block_subagents", "queueBlockSubagents", value);
}

/** Merge navigation into the desktop title bar (the standalone pop-out keeps it compact). */
export function setCompactToolbar(compact: boolean) {
  try {
    localStorage.setItem("oc_compact_toolbar", compact ? "1" : "0");
  } catch {}
  set({ compactToolbar: compact });
}

/** Open a session in its own pop-out browser window. */
export function openSessionWindow(sessionId: string) {
  const url = `/sessions/${sessionId}?popout=1`;
  window.open(url, `aiman_${sessionId}`, "width=1100,height=820,menubar=no,toolbar=no");
}

export function setChatMode(mode: ChatMode) {
  localStorage.setItem("oc_chat_mode", mode);
  set({ chatMode: mode });
  toast(mode === "terminal" ? "chat: terminal (opencode TUI)" : "chat: web");
}

export async function completeOnboarding() {
  try {
    await api.setOnboarded(true);
  } catch {}
  set({ onboarded: true });
}

export function cycleAgent(dir = 1) {
  const list = state.agents;
  if (!list.length) return;
  const i = list.indexOf(state.agent);
  const next = list[(i + dir + list.length) % list.length]!;
  setAgent(next);
  toast(`agent: ${next}`);
}

export function cycleModel(dir = 1) {
  const list = state.models;
  if (!list.length) return;
  const i = list.findIndex((m) => m.key === state.model);
  const next = list[(i + dir + list.length) % list.length]!;
  setModel(next.key);
  toast(`model: ${next.label}`);
}

export function openMenu(menu: MenuKind) {
  set({ menu });
}
export function closeMenu() {
  set({ menu: null });
}

export async function newSession() {
  closeMenu();
  set({ activeSessionId: "__new__", view: "chat" });
}

export async function loadProfiles() {
  try {
    const [profiles, active] = await Promise.all([api.profiles(), api.activeProfile()]);
    set({ profiles, activeProfile: active.profileId });
  } catch {}
}

export async function activateProfile(id: string) {
  try {
    const r = await api.activateProfile(id);
    set({ activeProfile: id });
    const p = state.profiles.find((x) => x.id === id);
    toast(`profile: ${p?.name ?? id}${r.applied?.length ? " · applied " + r.applied.join(", ") : ""}`);
  } catch (e) {
    toast(`profile switch failed: ${e}`);
  }
}

let agentsRetry: ReturnType<typeof setTimeout> | null = null;

/**
 * The launcher starts aiman before `opencode serve` has finished loading, so
 * the first catalogue request can legitimately come back empty. Keep retrying
 * for a while instead of freezing the selector on the fallback agent.
 */
export async function loadModelsAgents(attempt = 0) {
  try {
    const [prov, ag] = await Promise.all([api.providers(), api.agents()]);
    const opts: ModelOpt[] = [];
    for (const p of prov.providers ?? [])
      for (const m of Object.values(p.models ?? []))
        opts.push({
          key: `${p.id}/${m.id}`,
          label: `${p.name} · ${m.name}`,
          providerID: p.id,
          modelID: m.id,
          variants: Array.isArray(m.variants)
            ? m.variants.filter((v): v is string => typeof v === "string" && v.length > 0)
            : [],
          context: Number(m.context ?? m.limit?.context ?? 0) || 0,
        });
    const hidden = ["compaction", "summary", "title"];
    const primaries = (ag ?? [])
      .filter((a) => a.mode !== "subagent" && !hidden.includes(a.name))
      .map((a) => a.name);
    set({ models: opts, agents: primaries.length ? primaries : ["build"] });

    // Drop a remembered variant that the (re)loaded model doesn't support or
    // that no longer exists (e.g. after an opencode upgrade).
    const active = opts.find((m) => m.key === state.model);
    if (opts.length && state.variant && !(active?.variants ?? []).includes(state.variant)) {
      set({ variant: "" });
    }

    const incomplete = !primaries.length || !opts.length;
    if (incomplete && attempt < 12) {
      if (agentsRetry) clearTimeout(agentsRetry);
      agentsRetry = setTimeout(() => loadModelsAgents(attempt + 1), 2500);
    }
  } catch {
    if (attempt < 12) {
      if (agentsRetry) clearTimeout(agentsRetry);
      agentsRetry = setTimeout(() => loadModelsAgents(attempt + 1), 2500);
    }
  }
}

// ---------------- data loading ----------------

let refreshTimer: any = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshSessions().catch(() => {}), 800);
}

export function filterSessions(
  sessions: Session[],
  f: Filters,
  folders: Folder[] = state.folders,
): Session[] {
  const q = f.q.toLowerCase().trim();
  let rows = sessions;
  if (q)
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.directory.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  if (f.archived !== "all")
    rows = rows.filter((s) => (f.archived === "1" ? s.timeArchived != null : s.timeArchived == null));
  if (f.directory) rows = rows.filter((s) => s.directory === f.directory);
  if (f.folder) {
    if (f.folder === "none") {
      rows = rows.filter((s) => !s.folderId);
    } else {
      // A folder shows its own sessions plus everything in its subtree.
      const ids = new Set<string>([f.folder]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const folder of folders) {
          if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
            ids.add(folder.id);
            changed = true;
          }
        }
      }
      rows = rows.filter((s) => !!s.folderId && ids.has(s.folderId));
    }
  }
  rows = rows.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (f.sort === "created") return b.timeCreated - a.timeCreated;
    if (f.sort === "title") return a.title.localeCompare(b.title);
    if (f.sort === "messages") return b.messageCount - a.messageCount;
    if (f.sort === "tokens") return (b.usage?.total ?? 0) - (a.usage?.total ?? 0);
    if (f.sort === "cost") return (b.usage?.cost ?? 0) - (a.usage?.cost ?? 0);
    return b.timeUpdated - a.timeUpdated;
  });
  return rows;
}

let refreshInFlight: Promise<void> | null = null;
export async function refreshSessions() {
  // Several events can request a refresh at once; never stack slow requests.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const sessions = await api.sessions({ archived: "all" });
      set({ sessions, ready: true });
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function refreshMeta() {
  const meta = await api.meta();
  set({ folders: meta.folders, directories: meta.directories });
}

export async function bootstrapAuth() {
  try {
    const me = await api.authMe();
    set({
      auth: {
        loading: false,
        authenticated: me.authenticated,
        needsSetup: me.needsSetup,
        user: me.user,
      },
    });
    if (me.authenticated) await bootstrap();
  } catch {
    set({ auth: { loading: false, authenticated: false, needsSetup: false, user: null } });
  }
}

export async function login(username: string, password: string) {
  await api.login(username, password);
  const me = await api.authMe();
  set({ auth: { loading: false, authenticated: true, needsSetup: false, user: me.user } });
  await bootstrap();
}

export async function setupAdmin(username: string, password: string) {
  await api.setup(username, password);
  const me = await api.authMe();
  set({ auth: { loading: false, authenticated: true, needsSetup: false, user: me.user } });
  await bootstrap();
}

export async function logout() {
  try {
    await api.logout();
  } catch {}
  try {
    es?.close();
  } catch {}
  es = null;
  set({
    auth: { loading: false, authenticated: false, needsSetup: false, user: null },
    sessions: [],
    folders: [],
    directories: [],
    activeSessionId: null,
    entries: {},
    routeReady: false,
    onboarded: null,
  });
}

export async function bootstrap() {
  await Promise.all([refreshSessions(), refreshMeta(), loadModelsAgents(), loadProfiles()]);
  try {
    const cfg = await api.config();
    set({ onboarded: cfg.onboarded, opencodeV2: !!cfg.opencodeV2 });
    // opencode v2 removed `opencode attach` and its TUI does not attach through
    // the PTY bridge, so v2 sessions always use the structured web chat.
    if (cfg.opencodeV2 && !localStorage.getItem("oc_chat_mode")) {
      localStorage.setItem("oc_chat_mode", "web");
      set({ chatMode: "web" });
    }
  } catch {
    set({ onboarded: true });
  }
  // Check GitHub releases for an update (non-blocking, cached server-side).
  api
    .update()
    .then((u) => {
      if (u.available && u.latest) toast(`Update available: v${u.latest} — see Settings`);
    })
    .catch(() => {});
  await applyLocation();
  set({ routeReady: true });
  connectEvents();
}

// ---------------- URL routing (handles) ----------------

const VIEW_PATHS: Record<View, string> = {
  chat: "/sessions",
  search: "/search",
  stats: "/stats",
  terminal: "/terminal",
  users: "/users",
  profiles: "/profiles",
  settings: "/settings",
  extensions: "/extensions",
};

/** Canonical URL path for a given view + active session. */
export function pathFor(view: View, activeSessionId: string | null): string {
  if (view === "chat") {
    if (activeSessionId === "__new__") return "/sessions/new";
    if (activeSessionId) return `/sessions/${activeSessionId}`;
    return "/sessions";
  }
  return VIEW_PATHS[view] ?? "/sessions";
}

/** Read the current location and apply it to the store. Safe to call on popstate. */
export async function applyLocation() {
  if (typeof location === "undefined") return;
  const segments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const sid = new URLSearchParams(location.search).get("session"); // legacy ?session=

  if (first === "" || first === "sessions") {
    const seg = segments[1];
    if (seg === "new") return set({ view: "chat", activeSessionId: "__new__" });
    if (seg) return openSession(seg);
    if (sid) return openSession(sid);
    return set({ view: "chat", activeSessionId: null });
  }

  const views: View[] = ["search", "stats", "terminal", "users", "profiles", "settings", "extensions"];
  const view = views.find((v) => v === first);
  if (view) return set({ view });
  return set({ view: "chat" });
}

// ---------------- session actions ----------------

export async function openSession(id: string) {
  set({ activeSessionId: id, view: "chat" });
  if (!state.entries[id]) {
    try {
      const entries = await api.messages(id);
      set({ entries: { ...state.entries, [id]: entries } });
    } catch (e) {
      toast(`Failed to load messages: ${e}`);
    }
  }
  try {
    const todos = await fetch(`/oc/session/${id}/todo`).then((r) => r.json());
    set({ todos: { ...state.todos, [id]: todos } });
  } catch {}
  // attribute unowned sessions to the current user (for per-user stats)
  const meta = state.sessions.find((x) => x.id === id);
  if (meta && !meta.userId) {
    api
      .claimSession(id)
      .then(() => refreshSessions())
      .catch(() => {});
  }
  // pick up any pending prompts that may have arrived before we opened
  try {
    const [perms, qs] = await Promise.all([api.listPermissions(), api.listQuestions()]);
    set({
      permissions: {
        ...state.permissions,
        [id]: perms.filter((p) => p.sessionID === id),
      },
      questions: {
        ...state.questions,
        [id]: qs.filter((q) => q.sessionID === id),
      },
    });
  } catch {}
}

export async function reloadMessages(id: string) {
  try {
    const entries = await api.messages(id);
    set({ entries: { ...state.entries, [id]: entries } });
  } catch {}
}

/** Revert the last user turn. opencode stages the undo, so it can be redone. */
export async function undoLastMessage(sessionId?: string | null) {
  const id = sessionId ?? state.activeSessionId;
  if (!id || id === "__new__") {
    toast("no active session");
    return;
  }
  const entries = state.entries[id] ?? [];
  const lastUser = [...entries].reverse().find((e) => e.info?.role === "user");
  if (!lastUser) {
    toast("nothing to undo");
    return;
  }
  try {
    await api.revert(id, lastUser.info.id);
    await reloadMessages(id);
    toast("reverted");
  } catch (e) {
    toast(`Undo failed: ${e}`);
  }
}

/** Clear the staged revert and bring the hidden turns back. */
export async function redoSession(sessionId?: string | null) {
  const id = sessionId ?? state.activeSessionId;
  if (!id || id === "__new__") {
    toast("no active session");
    return;
  }
  try {
    await api.unrevert(id);
    await reloadMessages(id);
    toast("restored");
  } catch (e) {
    toast(`Redo failed: ${e}`);
  }
}

export async function createSession(directory: string, title?: string) {
  const s = await api.createSession(directory, title);
  await refreshSessions();
  await refreshMeta();
  if (s?.id) await openSession(s.id);
  return s;
}

export async function sendPrompt(
  sessionId: string,
  text: string,
  opts: {
    model?: { providerID: string; modelID: string };
    /** Reasoning-effort variant for `model` (""/undefined = model default). */
    variant?: string;
    agent?: string;
    files?: { url: string; filename: string; mime?: string }[];
  },
) {
  const parts: any[] = [];
  if (text) parts.push({ type: "text", text });
  for (const f of opts.files ?? []) parts.push({ type: "file", ...f });

  // Show the message immediately; the DB-backed copy replaces it on idle.
  const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const optimistic: MessageEntry = {
    info: {
      id: tmpId,
      sessionID: sessionId,
      role: "user",
      time: { created: Date.now() },
    },
    parts: [
      ...(text
        ? [
            {
              id: `${tmpId}:text`,
              sessionID: sessionId,
              messageID: tmpId,
              type: "text",
              text,
            },
          ]
        : []),
      ...(opts.files ?? []).map((f, i) => ({
        id: `${tmpId}:file:${i}`,
        sessionID: sessionId,
        messageID: tmpId,
        type: "file",
        filename: f.filename,
        url: f.url,
        mime: f.mime,
      })),
    ],
  };
  const current = state.entries[sessionId] ?? [];
  set({ entries: { ...state.entries, [sessionId]: [...current, optimistic] } });

  try {
    await api.promptAsync(sessionId, {
      parts,
      model: opts.model
        ? { ...opts.model, ...(opts.variant ? { variant: opts.variant } : {}) }
        : undefined,
      agent: opts.agent,
    });
  } catch (e) {
    // Roll the optimistic row back if the prompt never reached opencode.
    set({
      entries: {
        ...state.entries,
        [sessionId]: (state.entries[sessionId] ?? []).filter((x) => x.info?.id !== tmpId),
      },
    });
    throw e;
  }
}

export async function abortSession(id: string) {
  try {
    await api.abort(id);
  } catch (e) {
    toast(`Abort failed: ${e}`);
  }
}

export async function archiveSession(id: string, archived: boolean) {
  if (archived) await api.archive(id);
  else await api.unarchive(id);
  await refreshSessions();
  if (archived && state.activeSessionId === id) set({ activeSessionId: null });
}

export async function moveToFolder(id: string, folderId: string | null) {
  await api.setFolder(id, folderId);
  await refreshSessions();
}

export async function togglePin(s: Session) {
  await api.pin(s.id, !s.pinned);
  await refreshSessions();
}

export async function renameSession(id: string, title: string) {
  await api.rename(id, title);
  await refreshSessions();
}

export async function createFolder(
  name: string,
  color: string | null,
  parentId: string | null = null,
) {
  await api.createFolder(name, color ?? undefined, parentId);
  await refreshMeta();
}

/** Ask opencode to build/refresh the folder tree and file unfiled sessions. */
export async function autoOrganizeSessions(opts: {
  model?: string;
  variant?: string;
  agent?: string;
} = {}) {
  const result = await api.autoOrganize(opts);
  await Promise.all([refreshMeta(), refreshSessions()]);
  return result;
}

export async function replyPermissionSafe(perm: Permission, reply: "once" | "always" | "reject") {
  try {
    await api.replyPermission(perm.id, reply);
  } catch (e) {
    toast(`Permission reply failed: ${e}`);
  }
  const list = state.permissions[perm.sessionID] ?? [];
  set({
    permissions: {
      ...state.permissions,
      [perm.sessionID]: list.filter((x) => x.id !== perm.id),
    },
  });
}

export async function answerQuestion(req: QuestionRequest, answers: string[][]) {
  try {
    await api.replyQuestion(req.id, answers);
  } catch (e) {
    toast(`Question reply failed: ${e}`);
  }
  const list = state.questions[req.sessionID] ?? [];
  set({
    questions: { ...state.questions, [req.sessionID]: list.filter((x) => x.id !== req.id) },
  });
}

export async function rejectQuestionSafe(req: QuestionRequest) {
  try {
    await api.rejectQuestion(req.id);
  } catch (e) {
    toast(`Question reject failed: ${e}`);
  }
  const list = state.questions[req.sessionID] ?? [];
  set({
    questions: { ...state.questions, [req.sessionID]: list.filter((x) => x.id !== req.id) },
  });
}

export async function deleteFolder(id: string) {
  await api.deleteFolder(id);
  if (state.filters.folder === id) set({ filters: { ...state.filters, folder: null } });
  await Promise.all([refreshMeta(), refreshSessions()]);
}

// ---------------- live event stream ----------------

let es: EventSource | null = null;

export function connectEvents() {
  if (es) return;
  if (typeof location !== "undefined" && location.search.includes("nosse")) return;
  const src = new EventSource("/oc/global/event");
  es = src;
  src.onopen = () => {
    set({ connected: true });
    // Recover the agent/model catalogues if they were fetched before opencode
    // finished booting.
    if (state.agents.length < 2 || state.models.length === 0) loadModelsAgents();
  };
  src.onerror = () => {
    set({ connected: false });
    // EventSource retries on its own unless the connection failed fatally
    // (non-200 response). Recreate it in that case so the badge recovers after
    // opencode comes online.
    if (es === src && src.readyState === EventSource.CLOSED) {
      try {
        src.close();
      } catch {}
      es = null;
      setTimeout(() => {
        if (!es) connectEvents();
      }, 2500);
    }
  };
  src.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data).payload;
      if (payload) handleEvent(payload);
    } catch {}
  };
}

function upsertMessage(info: any) {
  const sid = info.sessionID;
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  const idx = entries.findIndex((e) => e.info.id === info.id);
  if (idx >= 0) {
    const prev = entries[idx]!;
    const merged = { ...prev.info, ...info };
    // Streaming updates carry only `time.completed`; keep the original created.
    if (prev.info?.time || info?.time) {
      merged.time = { ...(prev.info?.time ?? {}), ...(info?.time ?? {}) };
    }
    entries[idx] = { ...prev, info: merged };
  } else entries.push({ info, parts: [] });
  entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  set({ entries: { ...state.entries, [sid]: entries } });
}

function upsertPart(part: Part, delta?: string) {
  const sid = part.sessionID;
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  let entry = entries.find((e) => e.info.id === part.messageID);
  if (!entry) {
    entry = {
      info: { id: part.messageID, sessionID: sid, role: "assistant", time: { created: Date.now() } },
      parts: [],
    };
    entries.push(entry);
    entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  } else {
    entry = { ...entry, parts: entry.parts.slice() };
    const i = entries.indexOf(entries.find((e) => e.info?.id === part.messageID)!);
    entries[i] = entry;
  }
  const pIdx = entry.parts.findIndex((p) => p.id === part.id);
  if (pIdx >= 0) {
    const existing = entry.parts[pIdx];
    const merged = { ...existing, ...part };
    // opencode v2 sends tool lifecycles separately (called → success), each with
    // a partial `state`; keep what earlier events contributed (input, output…).
    if (existing.state && part.state) {
      merged.state = { ...existing.state, ...part.state };
      if (existing.state.metadata || part.state.metadata) {
        merged.state.metadata = { ...(existing.state.metadata ?? {}), ...(part.state.metadata ?? {}) };
      }
    }
    if ((merged.text == null || merged.text === "") && delta) merged.text = (existing.text ?? "") + delta;
    else if (delta && part.text != null && part.text === existing.text) merged.text = existing.text + delta;
    entry.parts[pIdx] = merged;
  } else {
    entry.parts.push(part);
  }
  set({ entries: { ...state.entries, [sid]: entries } });
}

function applyDelta(
  sid: string,
  messageID: string,
  partID: string,
  field: string,
  delta: string,
) {
  const loaded = state.entries[sid];
  if (!loaded) return;
  const entries = loaded.slice();
  let entry = entries.find((e) => e.info.id === messageID);
  if (!entry) {
    entry = {
      info: { id: messageID, sessionID: sid, role: "assistant", time: { created: Date.now() } },
      parts: [],
    };
    entries.push(entry);
    entries.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));
  } else {
    const i = entries.indexOf(entry);
    entry = { ...entry, parts: entry.parts.slice() };
    entries[i] = entry;
  }
  let p = entry.parts.find((x) => x.id === partID);
  if (!p) {
    p = {
      id: partID,
      messageID,
      sessionID: sid,
      type: field === "reasoning" ? "reasoning" : "text",
      text: "",
    } as Part;
    entry.parts.push(p);
  } else {
    const pi = entry.parts.indexOf(p);
    p = { ...p };
    (p as any)[field] = ((p as any)[field] ?? "") + delta;
    entry.parts[pi] = p;
  }
  set({ entries: { ...state.entries, [sid]: entries } });
}

function removePart(sessionID: string, messageID: string, partID: string) {
  const loaded = state.entries[sessionID];
  if (!loaded) return;
  const entries = loaded.map((e) =>
    e.info.id === messageID ? { ...e, parts: e.parts.filter((p) => p.id !== partID) } : e,
  );
  set({ entries: { ...state.entries, [sessionID]: entries } });
}

function handleEvent(payload: any) {
  const p = payload.properties ?? {};
  switch (payload.type) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
      scheduleRefresh();
      break;
    case "message.updated":
      upsertMessage(p.info);
      break;
    case "message.part.updated":
      upsertPart(p.part, p.delta);
      break;
    case "message.part.delta":
      applyDelta(p.sessionID, p.messageID, p.partID, p.field, p.delta);
      break;
    case "message.part.removed":
      removePart(p.sessionID, p.messageID, p.partID);
      break;
    case "session.status":
      set({ statuses: { ...state.statuses, [p.sessionID]: p.status } });
      break;
    case "session.idle": {
      set({ statuses: { ...state.statuses, [p.sessionID]: { type: "idle" } } });
      scheduleRefresh();
      // Resync any session whose transcript is loaded (active session and the
      // floating subagent panels).
      if (state.entries[p.sessionID]) reloadMessages(p.sessionID);
      break;
    }
    case "todo.updated":
      set({ todos: { ...state.todos, [p.sessionID]: p.todos } });
      break;
    case "permission.asked":
    case "permission.updated": {
      const perm = (p.permission ? p : (p as any).properties ?? p) as Permission;
      if (!perm?.sessionID) break;
      const list = state.permissions[perm.sessionID] ?? [];
      set({
        permissions: {
          ...state.permissions,
          [perm.sessionID]: [...list.filter((x) => x.id !== perm.id), perm],
        },
      });
      break;
    }
    case "permission.replied": {
      const sid = p.sessionID;
      const rid = p.requestID ?? p.permissionID;
      const list = state.permissions[sid] ?? [];
      set({ permissions: { ...state.permissions, [sid]: list.filter((x) => x.id !== rid) } });
      break;
    }
    case "question.asked": {
      const q = p as QuestionRequest;
      if (!q?.sessionID) break;
      const list = state.questions[q.sessionID] ?? [];
      set({
        questions: {
          ...state.questions,
          [q.sessionID]: [...list.filter((x) => x.id !== q.id), q],
        },
      });
      break;
    }
    case "question.replied":
    case "question.rejected": {
      const sid = p.sessionID;
      const rid = p.requestID;
      const list = state.questions[sid] ?? [];
      set({ questions: { ...state.questions, [sid]: list.filter((x) => x.id !== rid) } });
      break;
    }
    case "session.error":
      toast(`Session error: ${p.error?.data?.message ?? p.error?.name ?? "unknown"}`);
      break;
    default:
      break;
  }
}
