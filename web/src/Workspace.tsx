import { useEffect, useState } from "react";
import { api, type WorkspaceSummary } from "./api";
import Icon from "./Icon";
import { store, t, toast, useStore } from "./store";
import {
  confirmDiscardWorkspace,
  isWorkspaceDirty,
  subscribeWorkspaceDirty,
} from "./workspaceDirty";
import WorkspaceConfig from "./WorkspaceConfig";
import WorkspaceOps from "./WorkspaceOps";
import WorkspaceProviders from "./WorkspaceProviders";
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
  | "presets"
  | "snapshots";

const TABS: { id: Tab; key: string; label: string; group: string }[] = [
  { id: "overview", key: "ws.overview", label: "Overview", group: "OpenCode" },
  { id: "config", key: "ws.raw", label: "Raw config", group: "Configuration" },
  { id: "providers", key: "ws.providers", label: "Providers", group: "Configuration" },
  { id: "permissions", key: "ws.permissions", label: "Permissions", group: "Configuration" },
  { id: "prompt", key: "ws.prompt", label: "Prompt & rules", group: "Configuration" },
  { id: "code", key: "ws.code", label: "LSP & CLI", group: "Configuration" },
  { id: "skills", key: "ws.skills", label: "Skills", group: "Resources" },
  { id: "commands", key: "ws.commands", label: "Commands", group: "Resources" },
  { id: "agents", key: "ws.agents", label: "Agents", group: "Resources" },
  { id: "presets", key: "ws.presets", label: "Presets", group: "Automation" },
  { id: "snapshots", key: "ws.snapshots", label: "Snapshots & backups", group: "Automation" },
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
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeWorkspaceDirty(setDirty), []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isWorkspaceDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function switchTab(next: Tab) {
    if (next === tab) return;
    if (!confirmDiscardWorkspace()) return;
    setTab(next);
  }

  function changeScope(next: string) {
    if (next === directory) return;
    if (!confirmDiscardWorkspace("Discard unsaved changes before changing scope?")) return;
    setDirectory(next);
  }

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
          <h2>
            {t("ws.opencode")}
            {dirty && (
              <span className="badge ran" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                unsaved
              </span>
            )}
          </h2>
          <p className="muted small">{t("ws.subtitle")}</p>
        </div>
        <div className="ws-head-actions">
          <label className="ws-dir">
            <span className="muted small">{t("ws.scope")}</span>
            <select
              className="input"
              value={directory}
              onChange={(e) => changeScope(e.target.value)}
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

      {error && <div className="ws-error">{error}</div>}

      <div className="ws-shell">
        <nav className="ws-sidebar">
          {groups.map((group) => (
            <div className="ws-nav-group" key={group}>
              <span className="ws-nav-group-title">{group}</span>
              {TABS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  className={"tab" + (tab === item.id ? " active" : "")}
                  onClick={() => switchTab(item.id)}
                  title={t(item.key)}
                >
                  <span>{t(item.key)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="ws-content">
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
            <WorkspaceProviders directory={directory} onChanged={load} />
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
          {tab === "presets" && (
            <WorkspaceOps mode="presets" directory={directory} onChanged={load} />
          )}
          {tab === "snapshots" && (
            <WorkspaceOps mode="snapshots" directory={directory} onChanged={load} />
          )}
        </div>
      </div>
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
          <h3>OpenCode overview</h3>
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
          <button className="btn sm" onClick={() => onNavigate("snapshots")}>
            Back up or restore
          </button>
          <button className="btn sm" onClick={() => onNavigate("providers")}>
            Manage credentials
          </button>
          <button
            className="btn sm"
            onClick={() => store.set({ view: "extensions" })}
            title="MCP servers and all plugins"
          >
            Open Integrations
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
