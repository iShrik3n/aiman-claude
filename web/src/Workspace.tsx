import { useEffect, useState } from "react";
import { api, type WorkspaceSummary } from "./api";
import Icon from "./Icon";
import LogsView from "./LogsView";
import { store, t, toast, useStore } from "./store";
import WorkspaceConfig from "./WorkspaceConfig";
import WorkspaceOps from "./WorkspaceOps";
import WorkspaceResources from "./WorkspaceResources";

type Tab =
  | "overview"
  | "config"
  | "providers"
  | "permissions"
  | "prompt"
  | "code"
  | "skills"
  | "commands"
  | "agents"
  | "plugins"
  | "presets"
  | "profiles"
  | "backup"
  | "auth"
  | "logs";

const TABS: { id: Tab; key: string; label: string; group: string }[] = [
  { id: "overview", key: "ws.overview", label: "Overview", group: "Workspace" },
  { id: "config", key: "ws.raw", label: "Raw config", group: "OpenCode" },
  { id: "providers", key: "ws.providers", label: "Providers & models", group: "OpenCode" },
  { id: "permissions", key: "ws.permissions", label: "Permissions", group: "OpenCode" },
  { id: "prompt", key: "ws.prompt", label: "Prompt & rules", group: "OpenCode" },
  { id: "code", key: "ws.code", label: "LSP & CLI", group: "OpenCode" },
  { id: "skills", key: "ws.skills", label: "Skills", group: "Resources" },
  { id: "commands", key: "ws.commands", label: "Commands", group: "Resources" },
  { id: "agents", key: "ws.agents", label: "Agents", group: "Resources" },
  { id: "plugins", key: "ws.plugins", label: "Plugin files", group: "Resources" },
  { id: "presets", key: "ws.presets", label: "Presets", group: "Workspace" },
  { id: "profiles", key: "ws.profiles", label: "Config profiles", group: "Workspace" },
  { id: "backup", key: "ws.backup", label: "Backup & sync", group: "Workspace" },
  { id: "auth", key: "ws.auth", label: "Provider auth", group: "Workspace" },
  { id: "logs", key: "ws.logs", label: "Live logs", group: "Workspace" },
];

export default function Workspace() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [directory, setDirectory] = useState(() => {
    const active = s.sessions.find((session) => session.id === s.activeSessionId);
    return active?.directory ?? s.directories[0] ?? "";
  });
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api.workspace(directory || null));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory]);

  const groups = [...new Set(TABS.map((item) => item.group))];

  return (
    <div className="workspace-page">
      <div className="ws-head">
        <div>
          <h2>{t("ws.title")}</h2>
          <p className="muted small">{t("ws.subtitle")}</p>
        </div>
        <div className="ws-head-actions">
          <label className="ws-dir">
            <span className="muted small">{t("ws.project")}</span>
            <select
              className="input"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
            >
              <option value="">{t("ws.globalOnly")}</option>
              {s.directories.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
            </select>
          </label>
          <button className="btn sm ghost" onClick={() => void load()} title="Refresh summary">
            <Icon name="refresh" />
          </button>
        </div>
      </div>

      <div className="ws-tabs">
        {groups.map((group) => (
          <div className="ws-tab-group" key={group}>
            <span className="ws-tab-group-label">{group}</span>
            {TABS.filter((item) => item.group === group).map((item) => (
              <button
                key={item.id}
                className={"tab" + (tab === item.id ? " active" : "")}
                onClick={() => setTab(item.id)}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
        ))}
      </div>

      {error && <div className="ws-error">{error}</div>}

      {tab === "overview" && (
        <Overview
          summary={summary}
          busy={busy}
          directory={directory}
          onNavigate={setTab}
          onRefresh={load}
        />
      )}
      {tab === "config" && (
        <WorkspaceConfig directory={directory} mode="raw" onChanged={load} />
      )}
      {tab === "providers" && (
        <WorkspaceConfig directory={directory} mode="providers" onChanged={load} />
      )}
      {tab === "permissions" && (
        <WorkspaceConfig directory={directory} mode="permissions" onChanged={load} />
      )}
      {tab === "prompt" && (
        <WorkspaceConfig directory={directory} mode="prompt" onChanged={load} />
      )}
      {tab === "code" && <WorkspaceConfig directory={directory} mode="code" onChanged={load} />}
      {tab === "skills" && <WorkspaceResources kind="skills" directory={directory} />}
      {tab === "commands" && <WorkspaceResources kind="commands" directory={directory} />}
      {tab === "agents" && <WorkspaceResources kind="agents" directory={directory} />}
      {tab === "plugins" && <WorkspaceResources kind="plugins" directory={directory} />}
      {tab === "presets" && (
        <WorkspaceOps mode="presets" directory={directory} onChanged={load} />
      )}
      {tab === "profiles" && (
        <WorkspaceOps mode="profiles" directory={directory} onChanged={load} />
      )}
      {tab === "backup" && <WorkspaceOps mode="backup" directory={directory} onChanged={load} />}
      {tab === "auth" && (
        <WorkspaceOps mode="auth" directory={directory} onChanged={load} />
      )}
      {tab === "logs" && <LogsView />}
    </div>
  );
}

function Overview({
  summary,
  busy,
  directory,
  onNavigate,
  onRefresh,
}: {
  summary: WorkspaceSummary | null;
  busy: boolean;
  directory: string;
  onNavigate: (tab: Tab) => void;
  onRefresh: () => Promise<void>;
}) {
  const checks = [
    {
      label: "OpenCode config",
      detail: summary?.paths.globalConfig ?? "detecting…",
      ok: !!summary?.configs.some((doc) => doc.exists && !doc.error),
    },
    {
      label: "Project selected",
      detail: directory || "global resources only",
      ok: !!directory,
    },
    {
      label: "Provider credentials",
      detail: summary?.paths.auth ?? "",
      ok: true,
    },
    {
      label: "Skills",
      detail: `${summary?.counts.skills ?? 0} found`,
      ok: (summary?.counts.skills ?? 0) > 0,
    },
    {
      label: "Commands",
      detail: `${summary?.counts.commands ?? 0} found`,
      ok: (summary?.counts.commands ?? 0) > 0,
    },
    {
      label: "Agents",
      detail: `${summary?.counts.agents ?? 0} found`,
      ok: (summary?.counts.agents ?? 0) > 0,
    },
    {
      label: "Plugins",
      detail: `${summary?.counts.plugins ?? 0} found`,
      ok: (summary?.counts.plugins ?? 0) > 0,
    },
  ];

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Workspace overview</h3>
          <p className="muted small">
            {summary?.v2 ? "opencode v2" : "opencode v1"} · {summary?.configs.length ?? 0} config
            documents · {summary?.github.authenticated ? "GitHub connected" : "GitHub not connected"}
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void onRefresh()} disabled={busy}>
          <Icon name="refresh" /> {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="ws-quick-grid">
        {checks.map((check) => (
          <div className={"ws-quick-card" + (check.ok ? " ok" : "")} key={check.label}>
            <div className="ws-quick-top">
              <Icon name={check.ok ? "checked" : "circle"} />
              <b>{check.label}</b>
            </div>
            <div className="ws-mono">{check.detail}</div>
          </div>
        ))}
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <b>Get started</b>
        </div>
        <div className="ws-quick-actions">
          <button className="btn sm" onClick={() => onNavigate("providers")}>
            Configure providers & models
          </button>
          <button className="btn sm" onClick={() => onNavigate("skills")}>
            Manage skills
          </button>
          <button className="btn sm" onClick={() => onNavigate("agents")}>
            Build an agent
          </button>
          <button className="btn sm" onClick={() => onNavigate("prompt")}>
            Edit global instructions
          </button>
          <button className="btn sm" onClick={() => onNavigate("backup")}>
            Back up or sync
          </button>
          <button className="btn sm" onClick={() => onNavigate("logs")}>
            Open live logs
          </button>
          <button
            className="btn sm"
            onClick={() => store.set({ view: "extensions" })}
            title="MCP servers and package plugins"
          >
            Open MCP & package extensions
          </button>
        </div>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <b>Active paths</b>
        </div>
        <div className="ws-path-list">
          {summary
            ? Object.entries(summary.paths).map(([key, value]) => (
                <div className="ws-path-row" key={key}>
                  <span className="muted small">{key}</span>
                  <code>{value}</code>
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
