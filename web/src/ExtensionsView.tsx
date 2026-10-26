import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ConfiguredPlugin,
  type ExtensionsData,
  type McpServer,
  type PluginInfo,
} from "./api";
import { toast, useStore } from "./store";

type McpForm = {
  mode: "add" | "edit";
  originalName?: string;
  name: string;
  type: "local" | "remote";
  command: string;
  args: string;
  cwd: string;
  env: string;
  url: string;
  headers: string;
  enabled: boolean;
  timeout: string;
  configPath: string | null;
};

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseKeyValues(text: string, separator: "=" | ":"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(separator);
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function kvText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");
}

function headerText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
}

function statusClass(status: string): string {
  if (status === "connected") return "completed";
  if (status === "failed" || status === "needs_auth") return "error";
  if (status === "pending") return "running";
  return "";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function pluginTarget(p: PluginInfo): string {
  return p.source.type === "local"
    ? p.source.path ?? p.id ?? "(local)"
    : p.source.target ?? p.id ?? p.source.type;
}

function pluginName(spec: string): string {
  const s = spec.trim();
  if (!s) return s;
  if (
    /^[A-Za-z]:[\\/]/.test(s) ||
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.startsWith("~/") ||
    s.startsWith("\\\\")
  ) {
    return s;
  }
  if (s.startsWith("@")) {
    const slash = s.indexOf("/");
    if (slash < 0) return s;
    const at = s.indexOf("@", slash);
    return at > 0 ? s.slice(0, at) : s;
  }
  const at = s.lastIndexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

function samePlugin(a: string, b: string): boolean {
  return a === b || pluginName(a) === pluginName(b);
}

function isConfigured(target: string, rows: ConfiguredPlugin[]): boolean {
  return rows.some((r) => samePlugin(r.target, target));
}

function pluginSort(a: PluginInfo, b: PluginInfo): number {
  const rank = (p: PluginInfo) => {
    if (p.state?.status === "failed") return 0;
    if (p.source.outdated) return 1;
    if (p.source.type === "package" || p.source.type === "local") return 2;
    return 3;
  };
  return rank(a) - rank(b) || pluginTarget(a).localeCompare(pluginTarget(b));
}

function emptyMcpForm(configPath: string | null): McpForm {
  return {
    mode: "add",
    name: "",
    type: "local",
    command: "",
    args: "",
    cwd: "",
    env: "",
    url: "",
    headers: "",
    enabled: true,
    timeout: "",
    configPath,
  };
}

function formForServer(server: McpServer): McpForm {
  const cfg = server.config ?? {};
  const command = Array.isArray(cfg.command) ? cfg.command.map(String) : [];
  const env = cfg.environment ?? cfg.env;
  return {
    mode: "edit",
    originalName: server.name,
    name: server.name,
    type: cfg.type === "remote" ? "remote" : "local",
    command: command[0] ?? "",
    args: command.slice(1).join("\n"),
    cwd: typeof cfg.cwd === "string" ? cfg.cwd : "",
    env: kvText(env),
    url: typeof cfg.url === "string" ? cfg.url : "",
    headers: headerText(cfg.headers),
    enabled: cfg.enabled !== false && cfg.disabled !== true,
    timeout:
      typeof cfg.timeout === "number"
        ? String(cfg.timeout)
        : typeof cfg.timeout === "object" && cfg.timeout
          ? String(cfg.timeout.startup ?? cfg.timeout.execution ?? "")
          : "",
    configPath: server.configPath,
  };
}

export default function ExtensionsView() {
  const s = useStore();
  const [dir, setDir] = useState(() => {
    const saved = localStorage.getItem("oc_ext_dir");
    if (saved) return saved;
    const active = s.sessions.find((x) => x.id === s.activeSessionId);
    return active?.directory ?? s.directories[0] ?? "";
  });
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [data, setData] = useState<ExtensionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mcp" | "plugins">("mcp");
  const [form, setForm] = useState<McpForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pluginForm, setPluginForm] = useState<{ target: string; options: string } | null>(null);
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showBuiltins, setShowBuiltins] = useState(false);
  const [search, setSearch] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const next = await api.extensions(dir || null);
      setData(next);
      if (!configPath && next.configPath) setConfigPath(next.configPath);
      if (configPath && !next.configs.some((c) => c.path === configPath)) {
        setConfigPath(next.configPath);
      }
    } catch (e) {
      const message = String(e);
      setError(
        /(^|\D)404(\D|$)|not found/i.test(message)
          ? "The Extensions API is not available yet. Restart aiman to load the new server routes."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  useEffect(() => {
    if (!form && !pluginForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!saving) setForm(null);
      if (!pluginBusy) setPluginForm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, pluginForm, saving, pluginBusy]);

  function changeDir(next: string) {
    setDir(next);
    try {
      localStorage.setItem("oc_ext_dir", next);
    } catch {}
  }

  async function refresh(delay = 0) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await load(false);
  }

  async function saveMcp() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return toast("server name is required");
    if (/[\\/\u0000-\u001f]/.test(name)) {
      return toast("name may not contain slashes or control characters");
    }
    const command = [form.command.trim(), ...lines(form.args)].filter(Boolean);
    if (form.type === "local" && !command.length) return toast("command is required");
    if (form.type === "remote" && !form.url.trim()) return toast("URL is required");
    const env = parseKeyValues(form.env, "=");
    const headers = parseKeyValues(form.headers, ":");
    const timeout = Number(form.timeout);
    const config: any = {
      type: form.type,
      enabled: form.enabled,
      ...(timeout > 0 ? { timeout } : {}),
    };
    if (form.type === "local") {
      config.command = command;
      if (form.cwd.trim()) config.cwd = form.cwd.trim();
      if (Object.keys(env).length) config.environment = env;
    } else {
      config.url = form.url.trim();
      if (Object.keys(headers).length) config.headers = headers;
    }
    setSaving(true);
    try {
      const r = await api.saveMcp({
        name,
        config,
        directory: dir || null,
        configPath: form.configPath ?? configPath,
      });
      setForm(null);
      toast(
        r.runtimeError
          ? `Saved to config; runtime apply failed: ${r.runtimeError}`
          : form.mode === "add"
            ? `Added ${name}`
            : `Updated ${name}`,
      );
      await refresh(500);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleMcp(server: McpServer) {
    if (!server.config) return;
    setBusy(`toggle:${server.name}`);
    try {
      const result = await api.saveMcp({
        name: server.name,
        config: { ...server.config, enabled: !server.enabled },
        directory: dir || null,
        configPath: server.configPath ?? configPath,
      });
      toast(
        result.runtimeError
          ? `${server.enabled ? "Disabled" : "Enabled"} ${server.name}; runtime: ${result.runtimeError}`
          : `${server.enabled ? "Disabled" : "Enabled"} ${server.name}`,
      );
      await load(false);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function removeMcp(server: McpServer) {
    if (!confirm(`Remove MCP server "${server.name}"?`)) return;
    setBusy(`remove:${server.name}`);
    try {
      const r = await api.deleteMcp(server.name, dir || null);
      toast(r.runtimeError ? `Removed from config; runtime: ${r.runtimeError}` : `Removed ${server.name}`);
      await refresh(400);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function mcpAction(server: McpServer, action: "connect" | "disconnect") {
    setBusy(`${action}:${server.name}`);
    try {
      await api.mcpAction(server.name, action, dir || null);
      toast(`${action === "connect" ? "Connecting" : "Disconnecting"} ${server.name}…`);
      await refresh(500);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function checkPlugins() {
    setChecking(true);
    try {
      const r = await api.checkPlugins(dir || null);
      setData((d) => (d ? { ...d, plugins: r.plugins } : d));
      const outdated = r.plugins.filter((p) => p.source.outdated).length;
      toast(outdated ? `${outdated} plugin update${outdated === 1 ? "" : "s"} available` : "Plugins are up to date");
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setChecking(false);
    }
  }

  async function updatePlugins(targets: string[]) {
    if (!targets.length) return;
    setPluginBusy(`update:${targets.join(",")}`);
    try {
      await api.updatePlugins(targets, dir || null);
      toast(`Updating ${targets.length} plugin${targets.length === 1 ? "" : "s"}…`);
      await refresh(1600);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setPluginBusy(null);
    }
  }

  async function addPlugin() {
    if (!pluginForm) return;
    const target = pluginForm.target.trim();
    if (!target) return toast("plugin package or path is required");
    setPluginBusy("add");
    try {
      const r = await api.addPlugin({
        target,
        options: pluginForm.options,
        directory: dir || null,
        configPath,
      });
      setPluginForm(null);
      toast(r.updated ? "Plugin options updated — opencode is reloading" : "Plugin added — opencode is reloading");
      await refresh(1600);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setPluginBusy(null);
    }
  }

  async function removePlugin(p: PluginInfo) {
    const target = pluginTarget(p);
    if (!confirm(`Remove plugin "${target}" from the config?`)) return;
    setPluginBusy(`remove:${target}`);
    try {
      const r = await api.removePlugin(target, dir || null);
      toast(
        r.removed
          ? "Plugin removed — opencode is reloading"
          : "Plugin was not found in the config documents",
      );
      await refresh(1600);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setPluginBusy(null);
    }
  }

  const resourcesByServer = useMemo(() => {
    const out = new Map<string, { resources: any[]; templates: any[] }>();
    for (const r of data?.mcpResources?.resources ?? []) {
      const item = out.get(r.server) ?? { resources: [], templates: [] };
      item.resources.push(r);
      out.set(r.server, item);
    }
    for (const t of data?.mcpResources?.templates ?? []) {
      const item = out.get(t.server) ?? { resources: [], templates: [] };
      item.templates.push(t);
      out.set(t.server, item);
    }
    return out;
  }, [data?.mcpResources]);

  const sortedPlugins = useMemo(
    () => [...(data?.plugins ?? [])].sort(pluginSort),
    [data?.plugins],
  );
  const configuredOnly = useMemo(() => {
    const configured = data?.configuredPlugins ?? [];
    const loaded = data?.plugins ?? [];
    return configured.filter(
      (c) => !loaded.some((p) => samePlugin(pluginTarget(p), c.target)),
    );
  }, [data?.plugins, data?.configuredPlugins]);
  const configuredOnlyInfo = useMemo<PluginInfo[]>(
    () =>
      configuredOnly.map((c) => ({
        id: `configured:${c.target}`,
        source: /^[A-Za-z]:[\\/]|^\//.test(c.target)
          ? { type: "local", path: c.target }
          : { type: "package", target: c.target },
        features: {},
        state: {
          status: "configured",
          error: "Configured but not loaded by the server (TUI-only, disabled, or failed to load).",
        },
      })),
    [configuredOnly],
  );
  const externalPlugins = useMemo(
    () =>
      [...sortedPlugins.filter((p) => p.source.type !== "builtin"), ...configuredOnlyInfo].sort(
        pluginSort,
      ),
    [sortedPlugins, configuredOnlyInfo],
  );
  const builtinPlugins = useMemo(
    () => sortedPlugins.filter((p) => p.source.type === "builtin"),
    [sortedPlugins],
  );
  const rawVisiblePlugins = showBuiltins ? [...externalPlugins, ...builtinPlugins] : externalPlugins;
  const searchText = search.trim().toLowerCase();
  const visibleMcp = (data?.mcp ?? []).filter((server) => {
    if (!searchText) return true;
    return (
      server.name.toLowerCase().includes(searchText) ||
      String(server.type ?? "").toLowerCase().includes(searchText) ||
      JSON.stringify(server.config ?? {}).toLowerCase().includes(searchText)
    );
  });
  const visiblePlugins = rawVisiblePlugins.filter((plugin) => {
    if (!searchText) return true;
    return (
      pluginTarget(plugin).toLowerCase().includes(searchText) ||
      String(plugin.state?.status ?? "").toLowerCase().includes(searchText)
    );
  });
  const outdated = sortedPlugins.filter((p) => p.source.outdated && p.source.target);
  const externalCount = externalPlugins.length;

  return (
    <div className="extensions">
      <div className="ext-head">
        <h2 style={{ margin: 0 }}>Extensions</h2>
        <span className="muted small">
          MCP servers and plugins for opencode. Changes are written to the opencode config file;
          formatting inside the edited MCP/plugins block may be normalized.
        </span>
        <div className="spacer" />
        <button className="btn sm" disabled={loading} onClick={() => load()}>
          {loading ? "loading…" : "Refresh"}
        </button>
      </div>

      <div className="ext-toolbar">
        <label className="ext-field-inline">
          <span className="muted small">Directory</span>
          <select
            className="input"
            value={dir}
            onChange={(e) => changeDir(e.target.value)}
            title="opencode location whose config layers are shown"
          >
            <option value="">default</option>
            {dir && !s.directories.includes(dir) && <option value={dir}>{dir}</option>}
            {s.directories.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="ext-field-inline">
          <span className="muted small">Config file</span>
          <select
            className="input"
            value={configPath ?? data?.configPath ?? ""}
            onChange={(e) => setConfigPath(e.target.value || null)}
            title={configPath ?? data?.configPath ?? undefined}
          >
            {(data?.configs ?? []).map((c) => (
              <option key={c.path} value={c.path}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {configPath && (
          <span className="ext-config-path" title={configPath}>
            {configPath}
          </span>
        )}
        <label className="ext-field-inline" style={{ marginLeft: "auto" }}>
          <span className="muted small">Filter</span>
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="name, command, status…"
          />
        </label>
      </div>

      <div className="ext-subtabs">
        <button className={"tab" + (tab === "mcp" ? " active" : "")} onClick={() => setTab("mcp")}>
          MCP servers <span className="count">{data?.mcp.length ?? 0}</span>
        </button>
        <button className={"tab" + (tab === "plugins" ? " active" : "")} onClick={() => setTab("plugins")}>
          Plugins <span className="count">{externalCount}</span>
        </button>
      </div>

      {error && (
        <div className="ext-error-box">
          {error}
          {!s.opencodeV2 && <div className="small">Extension management requires opencode v2.</div>}
        </div>
      )}

      {tab === "mcp" && (
        <>
          <div className="ext-section-head">
            <div>
              <h3>MCP servers</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Local (stdio) or remote (HTTP) servers. Add or remove entries here; opencode reloads
                the config automatically. Connect/disconnect only affects the running process.
              </p>
            </div>
            <button
              className="btn primary"
              disabled={!configPath}
              onClick={() => setForm(emptyMcpForm(configPath))}
            >
              + Add MCP server
            </button>
          </div>

          {loading && !data ? (
            <div className="ext-empty">loading…</div>
          ) : visibleMcp.length === 0 ? (
            <div className="ext-empty">
              {(data?.mcp.length ?? 0) === 0 ? "No MCP servers configured." : "No MCP servers match the filter."}
            </div>
          ) : (
            <div className="ext-grid">
              {visibleMcp.map((server) => {
                const st = server.status?.status ?? "unknown";
                const res = resourcesByServer.get(server.name);
                const rCount = res?.resources.length ?? 0;
                const tCount = res?.templates.length ?? 0;
                const cfg = server.config ?? {};
                const target =
                  server.type === "remote"
                    ? String(cfg.url ?? "")
                    : Array.isArray(cfg.command)
                      ? cfg.command.join(" ")
                      : "";
                return (
                  <div className="ext-card" key={server.name}>
                    <div className="ext-card-head">
                      <span className="ext-name">{server.name}</span>
                      <span className={"badge " + statusClass(st)}>{statusLabel(st)}</span>
                      {server.type !== "unknown" && <span className="badge">{server.type}</span>}
                      {!server.enabled && <span className="badge">startup off</span>}
                    </div>
                    {target && (
                      <div className="ext-meta" title={target}>
                        {target}
                      </div>
                    )}
                    {server.integrationID && (
                      <div className="ext-meta">integration: {server.integrationID}</div>
                    )}
                    {server.configPath && (
                      <div className="ext-meta" title={server.configPath}>
                        config: {fileName(server.configPath)}
                      </div>
                    )}
                    {server.status?.error && (
                      <div className="ext-error">{server.status.error}</div>
                    )}
                    {!server.config && (
                      <div className="muted small">Runtime-only server (not present in a config document).</div>
                    )}
                    <div className="ext-actions">
                      {st === "connected" || st === "pending" ? (
                        <button
                          className="btn sm"
                          disabled={busy === `disconnect:${server.name}`}
                          onClick={() => mcpAction(server, "disconnect")}
                        >
                          {busy === `disconnect:${server.name}` ? "working…" : "Disconnect"}
                        </button>
                      ) : (
                        <button
                          className="btn sm"
                          disabled={busy === `connect:${server.name}`}
                          onClick={() => mcpAction(server, "connect")}
                        >
                          {busy === `connect:${server.name}` ? "working…" : "Connect"}
                        </button>
                      )}
                      {server.config && (
                        <button
                          className="btn sm"
                          disabled={busy === `toggle:${server.name}`}
                          onClick={() => toggleMcp(server)}
                        >
                          {busy === `toggle:${server.name}`
                            ? "working…"
                            : server.enabled
                              ? "Disable"
                              : "Enable"}
                        </button>
                      )}
                      <button className="btn sm" onClick={() => setForm(formForServer(server))}>
                        Edit
                      </button>
                      <button
                        className="btn sm danger"
                        disabled={busy === `remove:${server.name}`}
                        onClick={() => removeMcp(server)}
                      >
                        {busy === `remove:${server.name}` ? "removing…" : "Remove"}
                      </button>
                    </div>
                    {(rCount > 0 || tCount > 0) && (
                      <details className="ext-resources">
                        <summary>
                          Resources ({rCount}){tCount > 0 ? ` · templates (${tCount})` : ""}
                        </summary>
                        {res?.resources.map((r) => (
                          <div className="ext-resource" key={r.uri} title={r.uri}>
                            <span>{r.name}</span>
                            <span className="ext-mono">{r.uri}</span>
                            {r.description && <span className="muted small">{r.description}</span>}
                          </div>
                        ))}
                        {res?.templates.map((t) => (
                          <div className="ext-resource" key={t.uriTemplate} title={t.uriTemplate}>
                            <span>{t.name}</span>
                            <span className="ext-mono">{t.uriTemplate}</span>
                            {t.description && <span className="muted small">{t.description}</span>}
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "plugins" && (
        <>
          <div className="ext-section-head">
            <div>
              <h3>Plugins</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Packages and local plugin files loaded by opencode. Package plugins can be checked
                for updates here; adding or removing an entry updates the config and triggers a reload.
              </p>
            </div>
            <div className="ext-actions">
              <button className="btn sm" disabled={checking} onClick={checkPlugins}>
                {checking ? "checking…" : "Check for updates"}
              </button>
              <button
                className="btn sm primary"
                disabled={!outdated.length || !!pluginBusy}
                onClick={() => updatePlugins(outdated.map((p) => p.source.target!))}
              >
                {pluginBusy?.startsWith("update:") ? "updating…" : `Update all (${outdated.length})`}
              </button>
              <button className="btn sm" disabled={!configPath} onClick={() => setPluginForm({ target: "", options: "" })}>
                + Add plugin
              </button>
              <button className="btn sm ghost" onClick={() => setShowBuiltins((v) => !v)}>
                {showBuiltins ? `Hide ${builtinPlugins.length} built-in` : `Show ${builtinPlugins.length} built-in`}
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div className="ext-empty">loading…</div>
          ) : visiblePlugins.length === 0 ? (
            <div className="ext-empty">
              No external plugins loaded.
              {builtinPlugins.length > 0 && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  {builtinPlugins.length} built-in plugins are hidden.
                </div>
              )}
            </div>
          ) : (
            <div className="ext-grid">
              {visiblePlugins.map((p, i) => {
                const target = pluginTarget(p);
                const st = p.state?.status ?? "active";
                const configRow = data?.configuredPlugins.find((c) =>
                  samePlugin(c.target, target),
                );
                const removable =
                  p.source.type !== "builtin" &&
                  p.source.type !== "sdk" &&
                  isConfigured(target, data?.configuredPlugins ?? []);
                return (
                  <div className="ext-card" key={`${target}:${i}`}>
                    <div className="ext-card-head">
                      <span className="ext-name">{target}</span>
                      <span
                        className={
                          "badge " +
                          (st === "failed" ? "error" : st === "configured" ? "" : "completed")
                        }
                      >
                        {st}
                      </span>
                      <span className="badge">{p.source.type}</span>
                      {p.source.version && <span className="badge">v{p.source.version}</span>}
                      {p.source.outdated && <span className="badge running">update available</span>}
                      {p.source.updating && <span className="badge running">updating</span>}
                    </div>
                    <div className="ext-chips">
                      {Object.entries(p.features ?? {})
                        .filter(([, enabled]) => enabled)
                        .map(([name]) => (
                          <span className="ext-chip" key={name}>
                            {name}
                          </span>
                        ))}
                    </div>
                    {p.state?.error && (
                      <div className={st === "configured" ? "muted small" : "ext-error"}>
                        {p.state.error}
                      </div>
                    )}
                    {p.state?.ref && <div className="ext-meta">{p.state.ref}</div>}
                    {configRow && (
                      <div className="ext-meta" title={configRow.configPath}>
                        config: {fileName(configRow.configPath)}
                      </div>
                    )}
                    {!removable && p.source.type !== "builtin" && p.source.type !== "sdk" && (
                      <div className="muted small">Not listed in the selected config document.</div>
                    )}
                    <div className="ext-actions">
                      {p.source.type === "package" && p.source.outdated && p.source.target && (
                        <button
                          className="btn sm"
                          disabled={!!pluginBusy}
                          onClick={() => updatePlugins([p.source.target!])}
                        >
                          Update
                        </button>
                      )}
                      {removable && (
                        <button
                          className="btn sm danger"
                          disabled={pluginBusy === `remove:${target}`}
                          onClick={() => removePlugin(p)}
                        >
                          {pluginBusy === `remove:${target}` ? "removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {form && (
        <div className="overlay" onClick={() => !saving && setForm(null)}>
          <div className="overlay-box ext-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">
              {form.mode === "add" ? "Add MCP server" : `Edit ${form.originalName}`}
            </div>
            <div className="ext-form-grid">
              <label>
                <span>Name</span>
                <input
                  className="input"
                  value={form.name}
                  disabled={form.mode === "edit"}
                  placeholder="my-server"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as "local" | "remote" })}
                >
                  <option value="local">local (stdio)</option>
                  <option value="remote">remote (HTTP)</option>
                </select>
              </label>

              {form.type === "local" ? (
                <>
                  <label className="full">
                    <span>Command</span>
                    <input
                      className="input"
                      value={form.command}
                      placeholder="C:\path\to\server.exe"
                      onChange={(e) => setForm({ ...form, command: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    <span>Arguments — one per line</span>
                    <textarea
                      className="input"
                      value={form.args}
                      placeholder={"--port\n8080"}
                      onChange={(e) => setForm({ ...form, args: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    <span>Working directory (optional)</span>
                    <input
                      className="input"
                      value={form.cwd}
                      onChange={(e) => setForm({ ...form, cwd: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    <span>Environment — KEY=value per line</span>
                    <textarea
                      className="input"
                      value={form.env}
                      placeholder={"API_KEY=secret\nDEBUG=1"}
                      onChange={(e) => setForm({ ...form, env: e.target.value })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="full">
                    <span>URL</span>
                    <input
                      className="input"
                      value={form.url}
                      placeholder="https://example.com/mcp"
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    <span>Headers — Name: value per line</span>
                    <textarea
                      className="input"
                      value={form.headers}
                      placeholder={"Authorization: Bearer …"}
                      onChange={(e) => setForm({ ...form, headers: e.target.value })}
                    />
                  </label>
                </>
              )}

              <label>
                <span>Timeout (ms, optional)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.timeout}
                  onChange={(e) => setForm({ ...form, timeout: e.target.value })}
                />
              </label>
              <label className="ext-check">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                <span>Enabled on opencode startup</span>
              </label>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Saving to <code>{form.configPath ?? configPath ?? "the selected config file"}</code>
            </p>
            <div className="ext-form-actions">
              <button className="btn" disabled={saving} onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={saving} onClick={saveMcp}>
                {saving ? "saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pluginForm && (
        <div className="overlay" onClick={() => !pluginBusy && setPluginForm(null)}>
          <div className="overlay-box ext-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">Add plugin</div>
            <div className="ext-form-grid">
              <label className="full">
                <span>Package name or local path</span>
                <input
                  className="input"
                  value={pluginForm.target}
                  placeholder="opencode-my-plugin or C:\path\to\plugin.mjs"
                  onChange={(e) => setPluginForm({ ...pluginForm, target: e.target.value })}
                />
              </label>
              <label className="full">
                <span>Options JSON (optional)</span>
                <textarea
                  className="input"
                  value={pluginForm.options}
                  placeholder={'{ "option": "value" }'}
                  onChange={(e) => setPluginForm({ ...pluginForm, options: e.target.value })}
                />
              </label>
            </div>
            <p className="muted small">
              Written to <code>{configPath ?? "the selected config file"}</code>. opencode reloads
              the config automatically and installs package plugins on demand.
            </p>
            <div className="ext-form-actions">
              <button className="btn" disabled={!!pluginBusy} onClick={() => setPluginForm(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={!!pluginBusy} onClick={addPlugin}>
                {pluginBusy === "add" ? "adding…" : "Add plugin"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
