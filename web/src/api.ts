export type Usage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  messages: number;
};

export type ModelUsage = Usage & { providerID: string; modelID: string };
export type DayUsage = Usage & { day: string };

export type Session = {
  id: string;
  parentId: string | null;
  slug: string;
  directory: string;
  title: string;
  timeCreated: number;
  timeUpdated: number;
  timeArchived: number | null;
  messageCount: number;
  pinned: number;
  folderId: string | null;
  tags: string | null;
  notes: string | null;
  userId: string | null;
  profileId: string | null;
  usage: Usage | null;
};

export type QueueFile = {
  uri?: string;
  url?: string;
  name?: string;
  filename?: string;
  mime?: string;
};

export type QueueItem = {
  id: string;
  sessionId: string;
  text: string;
  files: QueueFile[];
  createdAt: number;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  quietMs: number;
  blockQuestions: boolean;
  blockPermissions: boolean;
  blockShells: boolean;
  blockSubagents: boolean;
  nextSendAt: number | null;
  blockedReason: string | null;
  error: string | null;
  attempts: number;
  sentAt: number | null;
};

export type QueueResponse = {
  items: QueueItem[];
  serverNow: number;
};

export type BtwModel = {
  providerID: string;
  id: string;
  variant?: string;
};

export type BtwItem = {
  id: string;
  sessionId: string;
  sideSessionId: string | null;
  question: string;
  answer: string | null;
  status: "pending" | "done" | "failed";
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  model: BtwModel | null;
};

export type ServiceStatus = {
  platform: string;
  manager: "systemd" | "launchd" | "schtasks" | null;
  installed: boolean;
  path: string | null;
  detail?: string;
};

export type UpdateInfo = {
  current: string;
  latest: string | null;
  available: boolean;
  url?: string | null;
  notes?: string;
  publishedAt?: string | null;
  error?: string;
};

export type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  ext?: string;
  children?: TreeNode[];
};

// ---- opencode extensions (MCP servers + plugins) ----

export type ExtensionConfigDoc = {
  path: string;
  label: string;
  mcpCount: number;
  pluginCount: number;
};

export type McpServer = {
  name: string;
  status: { status: "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "not_loaded" | string; error?: string };
  integrationID?: string;
  /** Raw opencode config for this server (null for runtime-only servers). */
  config: any | null;
  configPath: string | null;
  enabled: boolean;
  type: "local" | "remote" | "unknown";
};

export type McpResource = {
  server: string;
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
};

export type McpResourceTemplate = {
  server: string;
  name: string;
  uriTemplate: string;
  description?: string;
  mimeType?: string;
};

export type McpResources = {
  resources: McpResource[];
  templates: McpResourceTemplate[];
};

export type PluginInfo = {
  id?: string;
  source: {
    type: "builtin" | "package" | "local" | "sdk" | string;
    target?: string;
    version?: string;
    outdated?: boolean;
    updating?: boolean;
    path?: string;
  };
  features?: Record<string, boolean>;
  state?: { status: "active" | "failed" | string; error?: string; ref?: string };
};

export type ConfiguredPlugin = {
  target: string;
  array: "plugins" | "plugin";
  configPath: string;
  entry: any;
};

export type ExtensionsData = {
  v2: boolean;
  directory: string | null;
  configs: ExtensionConfigDoc[];
  configPath: string | null;
  mcp: McpServer[];
  mcpResources: McpResources;
  plugins: PluginInfo[];
  configuredPlugins: ConfiguredPlugin[];
  error?: string;
};

export type WorkspaceConfigDoc = {
  path: string;
  label: string;
  scope: "global" | "project" | "other";
  exists: boolean;
  revision: string;
  error?: string;
};

export type WorkspaceConfig = {
  docs: WorkspaceConfigDoc[];
  selected: WorkspaceConfigDoc & {
    text: string;
    data: any;
  };
};

export type WorkspaceResource = {
  kind: "skills" | "commands" | "agents" | "plugins";
  name: string;
  scope: "global" | "project" | "config";
  path: string;
  enabled: boolean;
  editable: boolean;
  description: string;
  content: string;
  source: string;
};

export type WorkspacePreset = {
  id: string;
  name: string;
  skills: string[];
  commands: string[];
  agents: string[];
  plugins: string[];
  mcp: string[];
  updatedAt: number;
};

export type WorkspaceBackup = {
  version: 1;
  createdAt: number;
  configs: { path: string; text: string }[];
  cli: { path: string; exists: boolean; content: string };
  prompt: { path: string; exists: boolean; content: string };
  rules: { path: string; source: string; exists?: boolean; content: string } | null;
  resources: {
    kind: WorkspaceResource["kind"];
    name: string;
    scope: "global" | "project";
    enabled: boolean;
    content: string;
  }[];
  presets: WorkspacePreset[];
};

export type WorkspaceSummary = {
  v2: boolean;
  paths: {
    globalConfig: string;
    configDir: string;
    cli: string;
    prompt: string;
    auth: string;
    home: string;
  };
  configs: WorkspaceConfigDoc[];
  counts: Record<string, number>;
  github: GithubStatus;
};

export type GithubStatus = {
  installed: boolean;
  authenticated: boolean;
  user: string | null;
  detail: string;
  error?: string;
  config: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    autoSync: boolean;
  };
};

export type OpenCodeServer = {
  id: string;
  name: string;
  url: string;
  db: string;
  auth: string;
  hasPassword: boolean;
  active: boolean;
};

export type OpenCodeServers = {
  activeId: string;
  servers: OpenCodeServer[];
  envOverrides: string[];
  file: string;
};

export type WorkspaceAuthProvider = {
  id: string;
  name: string;
  type: string;
  hasAuth: boolean;
  hint: string;
};

export type LogEntry = {
  id: number;
  at: number;
  level: "info" | "warn" | "error" | "debug";
  line: string;
};

export type Stats = {
  totals: Usage & { sessions: number; archived: number; userMessages: number };
  models: ModelUsage[];
  days: DayUsage[];
};

export type SessionStats = {
  sessionId: string;
  totals: Usage;
  userMessages: number;
  models: ModelUsage[];
};

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  parent_id: string | null;
};

export type Meta = { folders: Folder[]; directories: string[] };

export type Part = {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  callID?: string;
  tool?: string;
  state?: any;
  filename?: string;
  url?: string;
  [k: string]: any;
};

export type MessageEntry = { info: any; parts: Part[] };

export type Status =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type Permission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: any;
  always: string[];
  tool?: { messageID: string; callID: string };
};

export type QuestionOption = { label: string; description: string };
export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};
export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};

export type Todo = { id: string; content: string; status: string; priority: string };

export type SearchHit = {
  part_id: string;
  session_id: string;
  message_id: string;
  type: string;
  snippet: string;
  title: string;
  directory: string;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export type AuthUser = { id: string; username: string; is_admin: number };

export type ProfileProvider = { providerID: string; hint: string };
export type Profile = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  providers: ProfileProvider[];
};

export const api = {
  authMe: () =>
    fetch("/api/auth/me").then(
      j<{ authenticated: boolean; needsSetup: boolean; user: AuthUser | null }>,
    ),
  setup: (username: string, password: string) =>
    fetch("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "setup failed");
      return r.json();
    }),
  login: (username: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "login failed");
      return r.json();
    }),
  logout: () => fetch("/api/auth/logout", { method: "POST" }).then(j),
  users: () => fetch("/api/users").then(j<AuthUser[]>),
  createUser: (username: string, password: string, isAdmin: boolean) =>
    fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, isAdmin }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),
  updateUser: (id: string, patch: any) =>
    fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),
  deleteUser: (id: string) =>
    fetch(`/api/users/${id}`, { method: "DELETE" }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed");
      return r.json();
    }),

  profiles: () => fetch("/api/profiles").then(j<Profile[]>),
  activeProfile: () => fetch("/api/profiles/active").then(j<{ profileId: string | null }>),
  createProfile: (name: string) =>
    fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<Profile>),
  renameProfile: (id: string, name: string) =>
    fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j),
  deleteProfile: (id: string) => fetch(`/api/profiles/${id}`, { method: "DELETE" }).then(j),
  setProfileAuth: (id: string, providers: { providerID: string; key: string }[]) =>
    fetch(`/api/profiles/${id}/auth`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providers }),
    }).then(j),
  removeProfileAuth: (id: string, providerID: string) =>
    fetch(`/api/profiles/${id}/auth/${encodeURIComponent(providerID)}`, { method: "DELETE" }).then(j),
  captureProfileAuth: (id: string) =>
    fetch(`/api/profiles/${id}/capture`, { method: "POST" }).then(
      j<{ ok: boolean; captured: string[] }>,
    ),
  activateProfile: (id: string) =>
    fetch(`/api/profiles/${id}/activate`, { method: "POST" }).then(
      j<{ ok: boolean; applied: string[]; removed: string[] }>,
    ),

  meta: () => fetch("/api/meta").then(j<Meta>),
  sessions: (params: Record<string, string> = {}) =>
    fetch("/api/sessions?" + new URLSearchParams(params).toString()).then(j<Session[]>),
  folders: () => fetch("/api/folders").then(j<Folder[]>),
  autoOrganize: (body: { model?: string; variant?: string; agent?: string }) =>
    fetch("/api/folders/auto-organize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(
      j<{
        sessionId: string | null;
        assigned: number;
        foldersCreated: number;
        rules: number;
      }>,
    ),
  createFolder: (name: string, color?: string, parentId?: string | null) =>
    fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color, parentId }),
    }).then(j<Folder>),
  updateFolder: (id: string, patch: any) =>
    fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j),
  deleteFolder: (id: string) =>
    fetch(`/api/folders/${id}`, { method: "DELETE" }).then(j),
  archive: (id: string) => fetch(`/api/sessions/${id}/archive`, { method: "POST" }).then(j),
  unarchive: (id: string) => fetch(`/api/sessions/${id}/unarchive`, { method: "POST" }).then(j),
  setFolder: (id: string, folderId: string | null) =>
    fetch(`/api/sessions/${id}/folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId }),
    }).then(j),
  pin: (id: string, pinned: boolean) =>
    fetch(`/api/sessions/${id}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned }),
    }).then(j),
  rename: (id: string, title: string) =>
    fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(j),
  search: (q: string) =>
    fetch("/api/search?" + new URLSearchParams({ q }).toString()).then(
      j<{ query: string; count: number; results: SearchHit[] }>,
    ),

  // ---- opencode proxied ----
  messages: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/message`).then(j<MessageEntry[]>),
  promptAsync: (sessionId: string, body: any) =>
    fetch(`/oc/session/${sessionId}/prompt_async`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return true;
    }),
  queue: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}/queue`).then(j<QueueResponse>),
  enqueue: (
    sessionId: string,
    body: {
      text: string;
      files?: QueueFile[];
      quietMs: number;
      blockQuestions: boolean;
      blockPermissions: boolean;
      blockShells: boolean;
      blockSubagents: boolean;
    },
  ) =>
    fetch(`/api/sessions/${sessionId}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<QueueResponse & { ok: boolean; item: QueueItem }>),
  cancelQueued: (id: string) =>
    fetch(`/api/queue/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  btwHistory: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}/btw`).then(j<{ items: BtwItem[] }>),
  btwAsk: (
    sessionId: string,
    question: string,
    model?: { key: string; variant?: string },
  ) =>
    fetch(`/api/sessions/${sessionId}/btw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        ...(model?.key ? { model: model.key } : {}),
        ...(model?.variant ? { variant: model.variant } : {}),
      }),
    }).then(j<{ ok: boolean; item: BtwItem }>),
  btwDelete: (id: string) =>
    fetch(`/api/btw/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  abort: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/abort`, { method: "POST" }).then(j),
  createSession: (directory: string, title?: string) =>
    fetch(`/oc/session?directory=${encodeURIComponent(directory)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).then(j<{ id: string }>),
  providers: () =>
    fetch("/oc/config/providers").then(
      j<{
        providers: {
          id: string;
          name: string;
          models: Record<
            string,
            {
              id: string;
              name: string;
              reasoning?: boolean;
              tool_call?: boolean;
              /** Reasoning-effort levels exposed by opencode v2 (high, max, …). */
              variants?: string[];
              /** Normalised context window (v2) or opencode's `limit` object (v1). */
              context?: number;
              limit?: { context?: number; output?: number };
            }
          >;
        }[];
      }>,
    ),
  agents: () =>
    fetch("/oc/agent").then(j<{ name: string; description: string; mode?: string }[]>),
  commands: () =>
    fetch("/oc/command").then(
      j<{ name: string; description?: string; agent?: string; model?: string }[]>,
    ),
  commandRun: (
    sessionId: string,
    body: { command: string; arguments?: string; agent?: string; model?: string; variant?: string },
  ) =>
    fetch(`/oc/session/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j),
  share: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/share`, { method: "POST" }).then(j<{ share?: { url: string } }>),
  unshare: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/unshare`, { method: "POST" }).then(j),
  unrevert: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/unrevert`, { method: "POST" }).then(j),
  listPermissions: () => fetch("/oc/permission").then(j<Permission[]>),
  replyPermission: (requestID: string, reply: "once" | "always" | "reject") =>
    fetch(`/oc/permission/${requestID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    }).then(j),

  listQuestions: () => fetch("/oc/question").then(j<QuestionRequest[]>),
  replyQuestion: (requestID: string, answers: string[][]) =>
    fetch(`/oc/question/${requestID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }).then(j),
  rejectQuestion: (requestID: string) =>
    fetch(`/oc/question/${requestID}/reject`, { method: "POST" }).then(j),
  revert: (sessionId: string, messageID: string) =>
    fetch(`/oc/session/${sessionId}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageID }),
    }).then(j),
  summarize: (sessionId: string) =>
    fetch(`/oc/session/${sessionId}/summarize`, { method: "POST" }).then(j),
  diff: (sessionId: string, directory?: string) =>
    fetch(
      `/oc/session/${sessionId}/diff` +
        (directory ? "?directory=" + encodeURIComponent(directory) : ""),
    ).then(j<unknown>),
  stats: (params: {
    user?: string;
    profile?: string;
    project?: string;
    from?: string;
    to?: string;
  } = {}) => {
    const clean: Record<string, string> = {};
    if (params.user) clean.user = params.user;
    if (params.profile) clean.profile = params.profile;
    if (params.project) clean.project = params.project;
    if (params.from) clean.from = params.from;
    if (params.to) clean.to = params.to;
    return fetch("/api/stats?" + new URLSearchParams(clean).toString()).then(j<Stats>);
  },
  sessionStats: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}/stats`).then(j<SessionStats>),

  config: () =>
    fetch("/api/config").then(
      j<{
        opencodeUrl: string;
        opencodeBin: string;
        opencodeV2?: boolean;
        /** True when the server cannot drive a live agent (no prompting). */
        readOnly?: boolean;
        /** Optional features this backend implements. */
        features?: { queue?: boolean; btw?: boolean; terminal?: boolean; workspace?: boolean };
        terminal: boolean;
        platform: string;
        onboarded: boolean;
        version: string;
      }>,
    ),
  update: (force = false) =>
    fetch("/api/update" + (force ? "?check=1" : "")).then(j<UpdateInfo>),
  applyUpdate: () =>
    fetch("/api/update/apply", { method: "POST" }).then(
      j<{ ok: boolean; latest: string; restartRequired: boolean; restarting?: boolean }>,
    ),
  restart: () =>
    fetch("/api/restart", { method: "POST" }).then(j<{ ok: boolean; restarting: boolean }>),
  service: () => fetch("/api/service").then(j<ServiceStatus>),
  serviceInstall: () =>
    fetch("/api/service/install", { method: "POST" }).then(j<{ ok: boolean; detail: string }>),
  serviceUninstall: () =>
    fetch("/api/service/uninstall", { method: "POST" }).then(j<{ ok: boolean; detail: string }>),
  setOnboarded: (onboarded: boolean) =>
    fetch("/api/me/onboarded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onboarded }),
    }).then(j<{ ok: boolean; onboarded: boolean }>),
  changePassword: (password: string) =>
    fetch("/api/me/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(j<{ ok: boolean }>),
  claimSession: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}/claim`, { method: "POST" }).then(j),

  // ---- codebase explorer ----
  tree: (directory: string, opts: { depth?: number; max?: number } = {}) =>
    fetch(
      "/api/tree?" +
        new URLSearchParams({
          directory,
          ...(opts.depth ? { depth: String(opts.depth) } : {}),
          ...(opts.max ? { max: String(opts.max) } : {}),
        }).toString(),
    ).then(j<TreeNode & { root: string }>),
  fileGet: (directory: string, path: string) =>
    fetch("/api/file?" + new URLSearchParams({ directory, path }).toString()).then(
      j<{
        type: "text" | "binary";
        ext?: string;
        mime?: string;
        size?: number;
        content?: string;
        truncated?: boolean;
      }>,
    ),
  filePut: (directory: string, path: string, content: string) =>
    fetch("/api/file", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory, path, content }),
    }).then(j),
  deleteFile: (directory: string, path: string) =>
    fetch("/api/file?" + new URLSearchParams({ directory, path }).toString(), {
      method: "DELETE",
    }).then(j<{ ok: boolean }>),
  upload: (directory: string | undefined, blob: Blob, name?: string) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    if (name) q.set("name", name);
    return fetch("/api/upload?" + q.toString(), {
      method: "POST",
      headers: { "content-type": blob.type || "application/octet-stream" },
      body: blob,
    }).then(j<{ ok: boolean; path: string; name: string; size: number }>);
  },
  rawUrl: (directory: string, path: string) =>
    "/api/raw?" + new URLSearchParams({ directory, path }).toString(),

  forkSession: (sessionId: string, messageID: string) =>
    fetch(`/oc/session/${sessionId}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageID }),
    }).then(j<{ id: string; title: string }>),
  statsFilters: () =>
    fetch("/api/stats/filters").then(
      j<{
        users: { id: string; username: string }[];
        profiles: { id: string; name: string }[];
        projects: string[];
      }>,
    ),

  // ---- opencode native PTY (terminal) ----
  createPty: (body: {
    command?: string;
    args?: string[];
    cwd?: string;
    title?: string;
    env?: Record<string, string>;
  }) =>
    fetch("/oc/pty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ id: string; title: string; command: string; args: string[]; cwd: string }>),
  updatePty: (id: string, body: { title?: string; size?: { rows: number; cols: number } }) =>
    fetch(`/oc/pty/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j),
  deletePty: (id: string) => fetch(`/oc/pty/${id}`, { method: "DELETE" }).then(j),

  // ---- extensions (opencode v2 MCP servers + plugins) ----
  extensions: (directory?: string | null, config?: string | null) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    if (config) q.set("config", config);
    return fetch("/api/extensions?" + q.toString()).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      return body as ExtensionsData;
    });
  },
  saveMcp: (body: {
    name: string;
    config: any;
    directory?: string | null;
    configPath?: string | null;
  }) =>
    fetch("/api/extensions/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; paths: string[]; runtimeError?: string }>),
  deleteMcp: (name: string, directory?: string | null) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    return fetch(`/api/extensions/mcp/${encodeURIComponent(name)}?${q.toString()}`, {
      method: "DELETE",
    }).then(j<{ ok: boolean; paths: string[]; runtimeError?: string }>);
  },
  mcpAction: (name: string, action: "connect" | "disconnect", directory?: string | null) =>
    fetch(`/api/extensions/mcp/${encodeURIComponent(name)}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    }).then(j),
  addPlugin: (body: {
    target: string;
    options?: string;
    directory?: string | null;
    configPath?: string | null;
  }) =>
    fetch("/api/extensions/plugins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; path: string; updated?: boolean }>),
  removePlugin: (target: string, directory?: string | null) =>
    fetch("/api/extensions/plugins/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target, directory }),
    }).then(j<{ ok: boolean; paths: string[]; removed: boolean }>),
  checkPlugins: (directory?: string | null, target?: string | null) =>
    fetch("/api/extensions/plugins/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory, target }),
    }).then(j<{ ok: boolean; plugins: PluginInfo[] }>),
  updatePlugins: (targets: string[], directory?: string | null) =>
    fetch("/api/extensions/plugins/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets, directory }),
    }).then(j<{ ok: boolean }>),

  // ---- workspace (config, resources, backup, auth) ----
  servers: () => fetch("/api/servers").then(j<OpenCodeServers>),
  createServer: (body: {
    name: string;
    url: string;
    password?: string;
    db?: string;
    auth?: string;
  }) =>
    fetch("/api/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; server: OpenCodeServer }>),
  updateServer: (
    id: string,
    body: { name?: string; url?: string; password?: string; db?: string; auth?: string },
  ) =>
    fetch(`/api/servers/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; server: OpenCodeServer }>),
  deleteServer: (id: string) =>
    fetch(`/api/servers/${encodeURIComponent(id)}`, { method: "DELETE" }).then(j),
  testServer: (body: { id?: string; url?: string; password?: string; db?: string }) =>
    fetch("/api/servers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(
      j<{ ok: boolean; url: string; status: number; db: string | null; dbExists: boolean | null }>,
    ),
  activateServer: (id: string) =>
    fetch(`/api/servers/${encodeURIComponent(id)}/activate`, { method: "POST" }).then(
      j<{ ok: boolean; server: OpenCodeServer; restarting: boolean }>,
    ),

  workspace: (directory?: string | null) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    return fetch("/api/workspace?" + q.toString()).then(j<WorkspaceSummary>);
  },
  workspaceConfig: (directory?: string | null, path?: string | null) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    if (path) q.set("path", path);
    return fetch("/api/workspace/config?" + q.toString()).then(j<WorkspaceConfig>);
  },
  saveWorkspaceConfig: (body: {
    path: string;
    content: string;
    revision?: string;
    directory?: string | null;
  }) =>
    fetch("/api/workspace/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; revision: string; path: string }>),
  saveWorkspaceSections: (body: {
    path: string;
    sections: Record<string, unknown>;
    revision?: string;
    directory?: string | null;
  }) =>
    fetch("/api/workspace/config/sections", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; revision: string; path: string; config: any }>),
  workspaceCli: () =>
    fetch("/api/workspace/cli").then(
      j<{ path: string; exists: boolean; content: string; revision: string }>,
    ),
  saveWorkspaceCli: (content: string, revision?: string) =>
    fetch("/api/workspace/cli", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, revision }),
    }).then(j<{ ok: boolean; revision: string }>),
  workspacePrompt: () =>
    fetch("/api/workspace/prompt").then(
      j<{ path: string; exists: boolean; content: string }>,
    ),
  saveWorkspacePrompt: (content: string) =>
    fetch("/api/workspace/prompt", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    }).then(j<{ ok: boolean; path: string }>),
  workspaceRules: (directory: string) =>
    fetch("/api/workspace/rules?" + new URLSearchParams({ directory }).toString()).then(
      j<{ path: string; source: string; exists: boolean; content: string }>,
    ),
  saveWorkspaceRules: (directory: string, content: string, source?: string) =>
    fetch("/api/workspace/rules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory, content, source }),
    }).then(j<{ ok: boolean; path: string }>),
  workspaceResources: (directory?: string | null, kind?: string) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    if (kind) q.set("kind", kind);
    return fetch("/api/workspace/resources?" + q.toString()).then(
      j<{ resources: Record<string, WorkspaceResource[]> }>,
    );
  },
  saveWorkspaceResource: (body: {
    kind: WorkspaceResource["kind"];
    name: string;
    content: string;
    scope?: "global" | "project" | "config";
    path?: string | null;
    directory?: string | null;
  }) =>
    fetch("/api/workspace/resource", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; item: WorkspaceResource }>),
  deleteWorkspaceResource: (body: {
    kind: string;
    name: string;
    scope?: string;
    path?: string;
    directory?: string | null;
  }) =>
    fetch("/api/workspace/resource", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; path: string }>),
  toggleWorkspaceResource: (body: {
    kind: string;
    name: string;
    scope?: string;
    path?: string;
    enabled?: boolean;
    directory?: string | null;
  }) =>
    fetch("/api/workspace/resource/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; enabled: boolean; path: string }>),
  importWorkspaceResources: (body: {
    kind: "skills" | "plugins";
    urls: string[];
    scope?: "global" | "project";
    directory?: string | null;
  }) =>
    fetch("/api/workspace/resources/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; imported: WorkspaceResource[]; errors: string[] }>),
  workspacePresets: () =>
    fetch("/api/workspace/presets").then(j<{ presets: WorkspacePreset[] }>),
  createWorkspacePreset: (body: Partial<WorkspacePreset> & { name: string }) =>
    fetch("/api/workspace/presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; preset: WorkspacePreset }>),
  updateWorkspacePreset: (id: string, body: Partial<WorkspacePreset>) =>
    fetch(`/api/workspace/presets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; preset: WorkspacePreset }>),
  deleteWorkspacePreset: (id: string) =>
    fetch(`/api/workspace/presets/${encodeURIComponent(id)}`, { method: "DELETE" }).then(j),
  applyWorkspacePreset: (id: string, mode: "additive" | "exclusive", directory?: string | null) =>
    fetch(`/api/workspace/presets/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, directory }),
    }).then(j<{ ok: boolean; changed: number; errors: string[] }>),
  workspaceProfiles: () =>
    fetch("/api/workspace/profiles").then(
      j<{
        profiles: {
          id: string;
          name: string;
          createdAt: number;
          counts: { configs: number; resources: number };
        }[];
      }>,
    ),
  createWorkspaceProfile: (name: string, directory?: string | null) =>
    fetch("/api/workspace/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, directory }),
    }).then(j<{ ok: boolean; profile: { id: string; name: string; createdAt: number } }>),
  applyWorkspaceProfile: (id: string, directory?: string | null) =>
    fetch(`/api/workspace/profiles/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    }).then(j<{ ok: boolean; restored: number; skipped: string[] }>),
  deleteWorkspaceProfile: (id: string) =>
    fetch(`/api/workspace/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }).then(j),
  workspaceBackup: (directory?: string | null) => {
    const q = new URLSearchParams();
    if (directory) q.set("directory", directory);
    return fetch("/api/workspace/backup?" + q.toString()).then(j<WorkspaceBackup>);
  },
  restoreWorkspace: (backup: WorkspaceBackup, directory?: string | null) =>
    fetch("/api/workspace/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backup, directory }),
    }).then(j<{ ok: boolean; restored: number; skipped: string[] }>),
  githubStatus: () => fetch("/api/workspace/github").then(j<GithubStatus>),
  setGithubConfig: (patch: Partial<GithubStatus["config"]>) =>
    fetch("/api/workspace/github", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ ok: boolean; config: GithubStatus["config"] }>),
  githubPush: (directory?: string | null) =>
    fetch("/api/workspace/github/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    }).then(j<{ ok: boolean; url?: string | null }>),
  githubPull: (directory?: string | null) =>
    fetch("/api/workspace/github/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    }).then(j<{ ok: boolean; restored: number; skipped: string[] }>),
  workspaceAuth: () =>
    fetch("/api/workspace/auth").then(
      j<{ providers: WorkspaceAuthProvider[]; authPath: string }>,
    ),
  saveWorkspaceAuth: (body: {
    provider: string;
    key?: string;
    type?: "api" | "oauth";
    auth?: Record<string, unknown>;
  }) =>
    fetch("/api/workspace/auth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ ok: boolean; providers: WorkspaceAuthProvider[] }>),
  deleteWorkspaceAuth: (provider: string) =>
    fetch("/api/workspace/auth?" + new URLSearchParams({ provider }).toString(), {
      method: "DELETE",
    }).then(j<{ ok: boolean; providers: WorkspaceAuthProvider[] }>),
};
