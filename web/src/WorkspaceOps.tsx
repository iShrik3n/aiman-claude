import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ExtensionsData,
  type GithubStatus,
  type WorkspaceAuthProvider,
  type WorkspacePreset,
  type WorkspaceResource,
} from "./api";
import Icon from "./Icon";
import { toast } from "./store";

type Mode = "presets" | "backup" | "auth" | "profiles";

const RESOURCE_KINDS: WorkspaceResource["kind"][] = ["skills", "commands", "agents", "plugins"];
const TerminalPane = lazy(() => import("./TerminalPane"));

export default function WorkspaceOps({
  mode,
  directory,
  onChanged,
}: {
  mode: Mode;
  directory: string;
  onChanged?: () => void;
}) {
  if (mode === "presets") return <Presets directory={directory} onChanged={onChanged} />;
  if (mode === "backup") return <Backup directory={directory} onChanged={onChanged} />;
  if (mode === "profiles") {
    return <WorkspaceProfiles directory={directory} onChanged={onChanged} />;
  }
  return <ProviderAuth onChanged={onChanged} />;
}

function Presets({ directory, onChanged }: { directory: string; onChanged?: () => void }) {
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [resources, setResources] = useState<Record<string, WorkspaceResource[]>>({});
  const [mcp, setMcp] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, Set<string>>>({
    skills: new Set(),
    commands: new Set(),
    agents: new Set(),
    plugins: new Set(),
    mcp: new Set(),
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [p, r] = await Promise.all([
        api.workspacePresets(),
        api.workspaceResources(directory || null),
      ]);
      setPresets(p.presets);
      setResources(r.resources);
      try {
        const ext: ExtensionsData = await api.extensions(directory || null);
        setMcp(ext.mcp.map((server) => server.name));
      } catch {
        setMcp([]);
      }
    } catch (e) {
      toast(`Failed to load presets: ${e}`);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory]);

  function toggle(kind: string, value: string) {
    setSelected((prev) => {
      const next = new Set(prev[kind] ?? []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [kind]: next };
    });
  }

  async function create() {
    if (!name.trim()) return toast("preset name is required");
    setBusy(true);
    try {
      await api.createWorkspacePreset({
        name: name.trim(),
        skills: [...(selected.skills ?? [])],
        commands: [...(selected.commands ?? [])],
        agents: [...(selected.agents ?? [])],
        plugins: [...(selected.plugins ?? [])],
        mcp: [...(selected.mcp ?? [])],
      });
      setName("");
      setSelected({
        skills: new Set(),
        commands: new Set(),
        agents: new Set(),
        plugins: new Set(),
        mcp: new Set(),
      });
      toast("preset created");
      await load();
    } catch (e) {
      toast(`Create failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function apply(preset: WorkspacePreset, mode: "additive" | "exclusive") {
    if (
      mode === "exclusive" &&
      !confirm(`Apply "${preset.name}" and disable everything not in the preset?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await api.applyWorkspacePreset(preset.id, mode, directory || null);
      toast(`Applied preset · ${result.changed} changes${result.errors.length ? ` · ${result.errors.length} errors` : ""}`);
      if (result.errors.length) console.warn(result.errors);
      onChanged?.();
      await load();
    } catch (e) {
      toast(`Apply failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(preset: WorkspacePreset) {
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    try {
      await api.deleteWorkspacePreset(preset.id);
      await load();
    } catch (e) {
      toast(String(e));
    }
  }

  const resourceRows = useMemo(() => {
    return RESOURCE_KINDS.map((kind) => ({
      kind,
      items: (resources[kind] ?? []).filter((item) => item.editable),
    }));
  }, [resources]);

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Presets</h3>
          <p className="muted small">
            Save groups of skills, commands, agents, plugins and MCP servers, then apply them in
            additive or exclusive mode.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void load()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <b>New preset</b>
          <div className="ws-actions">
            <input
              className="input"
              placeholder="Preset name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn sm primary" onClick={create} disabled={busy}>
              Save current selection
            </button>
          </div>
        </div>
        <div className="ws-preset-groups">
          {resourceRows.map(({ kind, items }) => (
            <div className="ws-preset-group" key={kind}>
              <div className="ws-preset-group-title">{kind}</div>
              {items.length === 0 && <span className="muted small">none</span>}
              {items.map((item) => (
                <label className="ws-check" key={kind + item.name + item.scope}>
                  <input
                    type="checkbox"
                    checked={selected[kind]?.has(item.name) ?? false}
                    onChange={() => toggle(kind, item.name)}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          ))}
          <div className="ws-preset-group">
            <div className="ws-preset-group-title">mcp</div>
            {mcp.length === 0 && <span className="muted small">none</span>}
            {mcp.map((server) => (
              <label className="ws-check" key={server}>
                <input
                  type="checkbox"
                  checked={selected.mcp?.has(server) ?? false}
                  onChange={() => toggle("mcp", server)}
                />
                {server}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="ws-preset-list">
        {presets.length === 0 && <div className="ext-empty">No presets saved yet.</div>}
        {presets.map((preset) => (
          <div className="ws-card" key={preset.id}>
            <div className="ws-card-head">
              <div>
                <b>{preset.name}</b>
                <div className="ws-mono">
                  {[
                    preset.skills.length && `${preset.skills.length} skills`,
                    preset.commands.length && `${preset.commands.length} commands`,
                    preset.agents.length && `${preset.agents.length} agents`,
                    preset.plugins.length && `${preset.plugins.length} plugins`,
                    preset.mcp.length && `${preset.mcp.length} MCP`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "empty"}
                </div>
              </div>
              <div className="ws-actions">
                <button className="btn sm" onClick={() => apply(preset, "additive")} disabled={busy}>
                  Apply additive
                </button>
                <button className="btn sm" onClick={() => apply(preset, "exclusive")} disabled={busy}>
                  Apply exclusive
                </button>
                <button className="btn sm danger" onClick={() => remove(preset)}>
                  Delete
                </button>
              </div>
            </div>
            <div className="ws-chips">
              {[
                ...preset.skills,
                ...preset.commands,
                ...preset.agents,
                ...preset.plugins,
                ...preset.mcp.map((x) => `mcp:${x}`),
              ].map((item) => (
                <span className="badge" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Backup({ directory, onChanged }: { directory: string; onChanged?: () => void }) {
  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("opencode-backup");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("aiman-workspace-backup.json");
  const [autoSync, setAutoSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadGithub() {
    try {
      const status = await api.githubStatus();
      setGithub(status);
      setOwner(status.config.owner);
      setRepo(status.config.repo || "opencode-backup");
      setBranch(status.config.branch || "main");
      setPath(status.config.path || "aiman-workspace-backup.json");
      setAutoSync(status.config.autoSync);
    } catch (e) {
      toast(`GitHub status failed: ${e}`);
    }
  }

  useEffect(() => {
    void loadGithub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download() {
    setBusy(true);
    try {
      const backup = await api.workspaceBackup(directory || null);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aiman-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Backup downloaded");
    } catch (e) {
      toast(`Backup failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    if (
      !confirm(
        "Restore this backup? It will overwrite matching config documents and workspace resources.",
      )
    )
      return;
    setBusy(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const result = await api.restoreWorkspace(backup, directory || null);
      toast(`Restored ${result.restored}${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`);
      if (result.skipped.length) console.warn(result.skipped);
      onChanged?.();
      await loadGithub();
    } catch (e) {
      toast(`Restore failed: ${e}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveGithub() {
    setBusy(true);
    try {
      await api.setGithubConfig({ owner, repo, branch, path, autoSync });
      toast("GitHub sync settings saved");
      await loadGithub();
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    try {
      const result = await api.githubPush(directory || null);
      toast(result.url ? `Pushed to GitHub` : "Pushed to GitHub");
    } catch (e) {
      toast(`Push failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    if (!confirm("Pull the backup from GitHub and restore it over the current workspace?")) return;
    setBusy(true);
    try {
      const result = await api.githubPull(directory || null);
      toast(`Pulled and restored ${result.restored} items`);
      onChanged?.();
    } catch (e) {
      toast(`Pull failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Backup, restore & sync</h3>
          <p className="muted small">
            Backups include opencode config documents, CLI settings, global instructions, project
            rules, skills, commands, agents, plugins and presets.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void loadGithub()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="ws-two-col">
        <div className="ws-card">
          <div className="ws-card-head">
            <b>Local backup</b>
            <div className="ws-actions">
              <button className="btn sm primary" onClick={download} disabled={busy}>
                <Icon name="download" /> Download JSON
              </button>
              <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="upload" /> Restore file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => void restore(e.target.files?.[0])}
              />
            </div>
          </div>
          <p className="muted small">
            The backup may contain provider API keys from your opencode config. Store it securely.
          </p>
        </div>

        <div className="ws-card">
          <div className="ws-card-head">
            <b>GitHub sync</b>
            <span className={"badge " + (github?.authenticated ? "completed" : "")}>
              {github?.installed
                ? github.authenticated
                  ? `gh: ${github.user ?? "authenticated"}`
                  : "gh not authenticated"
                : "gh not installed"}
            </span>
          </div>
          {!github?.authenticated && (
            <p className="muted small">
              Run <code>gh auth login</code> on the host, then refresh. Sync uses the official GitHub
              CLI token.
            </p>
          )}
          <div className="ws-form-grid">
            <label>
              Owner
              <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
            </label>
            <label>
              Repository
              <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} />
            </label>
            <label>
              Branch
              <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </label>
            <label>
              File path
              <input className="input" value={path} onChange={(e) => setPath(e.target.value)} />
            </label>
          </div>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            Push automatically after workspace changes
          </label>
          <div className="ws-form-actions">
            <button className="btn sm" onClick={saveGithub} disabled={busy}>
              Save settings
            </button>
            <button className="btn sm" onClick={push} disabled={busy || !github?.authenticated}>
              Push to GitHub
            </button>
            <button className="btn sm" onClick={pull} disabled={busy || !github?.authenticated}>
              Pull from GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceProfiles({
  directory,
  onChanged,
}: {
  directory: string;
  onChanged?: () => void;
}) {
  const [profiles, setProfiles] = useState<
    { id: string; name: string; createdAt: number; counts: { configs: number; resources: number } }[]
  >([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.workspaceProfiles();
      setProfiles(data.profiles);
    } catch (e) {
      toast(`Failed to load profiles: ${e}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!name.trim()) return toast("profile name is required");
    setBusy(true);
    try {
      await api.createWorkspaceProfile(name.trim(), directory || null);
      setName("");
      toast("profile snapshot created");
      await load();
    } catch (e) {
      toast(`Create failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function apply(id: string, profileName: string) {
    if (
      !confirm(
        `Apply "${profileName}"? This restores its config documents, resources and presets over the current workspace.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api.applyWorkspaceProfile(id, directory || null);
      toast(`Applied profile · ${result.restored} items restored`);
      if (result.skipped.length) console.warn(result.skipped);
      onChanged?.();
    } catch (e) {
      toast(`Apply failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, profileName: string) {
    if (!confirm(`Delete profile snapshot "${profileName}"?`)) return;
    try {
      await api.deleteWorkspaceProfile(id);
      await load();
    } catch (e) {
      toast(String(e));
    }
  }

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Config profiles</h3>
          <p className="muted small">
            Named snapshots of config documents, skills, commands, agents, plugins and presets.
            Sessions and chat history are shared by the server and are not duplicated per profile.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void load()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>
      <div className="ws-card">
        <div className="ws-card-head">
          <b>Save current workspace</b>
          <div className="ws-actions">
            <input
              className="input"
              placeholder="Profile name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn sm primary" onClick={create} disabled={busy}>
              Create snapshot
            </button>
          </div>
        </div>
        <p className="muted small">
          Applying a profile restores configuration and resources. Provider credentials are not
          included in this snapshot.
        </p>
      </div>
      <div className="ws-provider-list">
        {profiles.map((profile) => (
          <div className="ws-card" key={profile.id}>
            <div className="ws-card-head">
              <div>
                <b>{profile.name}</b>
                <div className="ws-mono">
                  {new Date(profile.createdAt).toLocaleString()} · {profile.counts.configs} configs ·{" "}
                  {profile.counts.resources} resources
                </div>
              </div>
              <div className="ws-actions">
                <button className="btn sm" onClick={() => apply(profile.id, profile.name)} disabled={busy}>
                  Apply
                </button>
                <button className="btn sm danger" onClick={() => remove(profile.id, profile.name)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!profiles.length && <div className="ext-empty">No profile snapshots saved yet.</div>}
      </div>
    </div>
  );
}

function ProviderAuth({ onChanged }: { onChanged?: () => void }) {
  const [providers, setProviders] = useState<WorkspaceAuthProvider[]>([]);
  const [authPath, setAuthPath] = useState("");
  const [provider, setProvider] = useState("");
  const [key, setKey] = useState("");
  const [loginProvider, setLoginProvider] = useState("");
  const [loginSession, setLoginSession] = useState<{
    provider: string;
    command: string;
    args: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.workspaceAuth();
      setProviders(data.providers);
      setAuthPath(data.authPath);
    } catch (e) {
      toast(`Failed to load auth: ${e}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!provider.trim() || !key.trim()) return toast("provider and key are required");
    setBusy(true);
    try {
      const data = await api.saveWorkspaceAuth({
        provider: provider.trim(),
        key: key.trim(),
        type: "api",
      });
      setProviders(data.providers);
      setProvider("");
      setKey("");
      toast("provider key saved");
      onChanged?.();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyLogin(providerID: string) {
    const command = `opencode auth login ${providerID}`;
    try {
      await navigator.clipboard.writeText(command);
      toast(`Copied: ${command}`);
    } catch {
      toast(command);
    }
  }

  function startLogin(providerID: string) {
    const clean = providerID.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(clean)) {
      toast("enter a valid provider id first");
      return;
    }
    if (/Windows/i.test(navigator.userAgent)) {
      setLoginSession({
        provider: clean,
        command: "powershell.exe",
        args: ["-NoProfile", "-Command", `& opencode auth login ${clean}`],
      });
    } else {
      setLoginSession({
        provider: clean,
        command: "/bin/bash",
        args: ["-lc", `opencode auth login ${clean}`],
      });
    }
  }

  async function remove(id: string) {
    if (!confirm(`Remove ${id} credentials from opencode auth.json?`)) return;
    setBusy(true);
    try {
      const data = await api.deleteWorkspaceAuth(id);
      setProviders(data.providers);
      toast("removed");
      onChanged?.();
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Provider credentials</h3>
          <p className="muted small">
            Direct access to the active opencode auth store. For OAuth providers, run{" "}
            <code>opencode auth login &lt;provider&gt;</code> on the host or use the Terminal tab.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void load()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="ws-card">
        <div className="ws-card-head">
          <b>Add or update API key</b>
        </div>
        <div className="ws-form-row">
          <label>
            Provider id
            <input
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="deepseek, openai, anthropic…"
            />
          </label>
          <label>
            API key
            <input
              className="input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <button className="btn sm primary ws-end" onClick={save} disabled={busy}>
            Save key
          </button>
        </div>
        <div className="ws-form-row">
          <label>
            OAuth login
            <input
              className="input"
              value={loginProvider}
              onChange={(e) => setLoginProvider(e.target.value)}
              placeholder="github, google, anthropic…"
            />
          </label>
          <button className="btn sm ws-end" onClick={() => startLogin(loginProvider)} disabled={busy}>
            Open login terminal
          </button>
        </div>
      </div>

      <div className="ws-provider-list">
        {providers.map((item) => (
          <div className="ws-card" key={item.id}>
            <div className="ws-card-head">
              <div>
                <b>{item.id}</b>
                <div className="ws-mono">
                  {item.type} · {item.hint}
                </div>
              </div>
              <div className="ws-actions">
                {item.type === "oauth" && (
                  <button className="btn sm" onClick={() => startLogin(item.id)}>
                    Re-login
                  </button>
                )}
                <button className="btn sm" onClick={() => copyLogin(item.id)}>
                  Copy login command
                </button>
                <button className="btn sm danger" onClick={() => remove(item.id)} disabled={busy}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!providers.length && <div className="ext-empty">No provider credentials found.</div>}
      </div>
      <div className="ws-mono">{authPath}</div>

      {loginSession && (
        <div className="overlay" onClick={() => setLoginSession(null)}>
          <div className="overlay-box ws-modal ws-login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">
              Login · {loginSession.provider}
              <div className="spacer" />
              <button className="btn sm ghost" onClick={() => setLoginSession(null)}>
                Close
              </button>
            </div>
            <p className="muted small">
              Complete the provider login in this terminal. The auth file is updated by opencode; refresh
              the provider list when it finishes.
            </p>
            <Suspense fallback={<div className="ext-empty">starting terminal…</div>}>
              <TerminalPane
                command={loginSession.command}
                args={loginSession.args}
                title={`opencode auth login ${loginSession.provider}`}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
