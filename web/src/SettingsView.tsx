import { useEffect, useState } from "react";
import { api, type ServiceStatus, type UpdateInfo } from "./api";
import {
  setChatMode,
  setCompactToolbar,
  setFileMapMaxImageMb,
  setFileMapMaxPdfMb,
  setFileMapMaxTextKb,
  setFileMapSafePreviews,
  setFileMapSkipContent,
  setFontFamily,
  setFontSize,
  setLanguage,
  setMonoFontFamily,
  setQueueBlockPermissions,
  setQueueBlockQuestions,
  setQueueBlockShells,
  setQueueBlockSubagents,
  setQueueEnabled,
  setQueueEnter,
  setQueueQuietSeconds,
  setShellOutputOpen,
  setTheme,
  setThinkingOpen,
  store,
  toast,
  useStore,
} from "./store";
import { THEMES } from "./themes";
import { LANGUAGES, type Language } from "./i18n";
import Icon from "./Icon";
import LogsView from "./LogsView";
import ServerSettings from "./ServerSettings";
import desotaLogo from "./assets/desota-logo.png";

type SettingsTab = "appearance" | "chat" | "servers" | "system" | "about";

const SETTINGS_TABS: { id: SettingsTab; label: string; admin?: boolean }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "chat", label: "Chat" },
  { id: "servers", label: "Servers" },
  { id: "system", label: "System" },
  { id: "about", label: "About" },
];

export default function SettingsView() {
  const s = useStore();
  const me = s.auth.user;
  const [cfg, setCfg] = useState<{ opencodeUrl: string; terminal: boolean; version?: string } | null>(
    null,
  );
  const [upd, setUpd] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [svc, setSvc] = useState<ServiceStatus | null>(null);
  const [svcBusy, setSvcBusy] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("appearance");

  useEffect(() => {
    api
      .config()
      .then(setCfg)
      .catch(() => {});
    api
      .update()
      .then(setUpd)
      .catch(() => {});
    api
      .service()
      .then(setSvc)
      .catch(() => {});
  }, []);

  function waitForRestart() {
    // Poll until the manager answers again, then reload.
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        await fetch("/api/health");
        clearInterval(t);
        location.reload();
      } catch {
        if (tries > 60) clearInterval(t);
      }
    }, 1000);
  }

  async function installService() {
    setSvcBusy(true);
    try {
      const r = await api.serviceInstall();
      toast(r.detail);
      setSvc(await api.service());
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setSvcBusy(false);
    }
  }

  async function uninstallService() {
    setSvcBusy(true);
    try {
      const r = await api.serviceUninstall();
      toast(r.detail);
      setSvc(await api.service());
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setSvcBusy(false);
    }
  }

  async function restartNow() {
    try {
      await api.restart();
      toast("restarting aiman…");
      waitForRestart();
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  }

  async function checkUpdate(force: boolean) {
    setChecking(true);
    try {
      setUpd(await api.update(force));
    } catch (e) {
      toast(String(e));
    } finally {
      setChecking(false);
    }
  }

  async function doUpdate() {
    setApplying(true);
    try {
      const r = await api.applyUpdate();
      toast(`Updated to v${r.latest} — restarting…`);
      waitForRestart();
    } catch (e) {
      toast(`Update failed: ${e}`);
      setApplying(false);
    }
  }

  const mode = s.chatMode;

  return (
    <div className="search-wrap settings-page">
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div className="settings-tabs">
        {SETTINGS_TABS.filter((item) => item.id !== "servers" || s.hasWorkspace).map((item) => (
          <button
            key={item.id}
            className={"tab" + (tab === item.id ? " active" : "")}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={tab === "appearance" ? "settings-section" : "hidden"}>
      <h3>Appearance</h3>
      <p className="muted small">
        Pick a theme — it applies to the whole app (sessions, chat, terminal and
        the code map). Windows XP and 98 use the authentic xp.css / 98.css skins.
      </p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={"theme-card" + (s.theme === t.id ? " active" : "")}
            onClick={() => setTheme(t.id)}
          >
            <div className="theme-preview" style={{ background: t.vars["--bg"] }}>
              <div className="tp-side" style={{ background: t.vars["--bg-2"] }} />
              <div className="tp-main">
                <div className="tp-bar" style={{ background: t.vars["--accent"] }} />
                <div className="tp-body" style={{ background: t.vars["--bg"] }}>
                  <span className="tp-dot" style={{ background: t.vars["--accent"] }} />
                  <span className="tp-dot" style={{ background: t.vars["--green"] }} />
                  <span className="tp-dot" style={{ background: t.vars["--red"] }} />
                </div>
              </div>
            </div>
            <div className="theme-name">
              {t.name}
              {s.theme === t.id && <span className="badge completed">active</span>}
            </div>
            <div className="theme-desc">{t.description}</div>
          </button>
        ))}
      </div>

      <div className="ws-form-row" style={{ marginTop: 14, maxWidth: 720 }}>
        <label>
          Language
          <select
            className="input"
            value={s.language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          UI font
          <input
            className="input"
            list="aiman-ui-fonts"
            value={s.fontFamily ?? ""}
            onChange={(e) => setFontFamily(e.target.value.trim() || null)}
            placeholder="Theme default"
          />
        </label>
        <label>
          Code / terminal font
          <input
            className="input"
            list="aiman-mono-fonts"
            value={s.monoFontFamily ?? ""}
            onChange={(e) => setMonoFontFamily(e.target.value.trim() || null)}
            placeholder="Theme default"
          />
        </label>
        <label>
          Base font size
          <input
            className="input"
            type="number"
            min={10}
            max={24}
            value={s.fontSize ?? ""}
            onChange={(e) =>
              setFontSize(e.target.value ? Math.min(24, Math.max(10, Number(e.target.value))) : null)
            }
            placeholder="Theme default"
          />
        </label>
        <datalist id="aiman-ui-fonts">
          <option value="system-ui, sans-serif" />
          <option value='"Commissioner", sans-serif' />
          <option value='"Segoe UI", sans-serif' />
          <option value='"Inter", sans-serif' />
          <option value='"Georgia", serif' />
          <option value='"Arial", sans-serif' />
        </datalist>
        <datalist id="aiman-mono-fonts">
          <option value='ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' />
          <option value='"Cascadia Code", monospace' />
          <option value='"Fira Code", monospace' />
          <option value='"JetBrains Mono", monospace' />
          <option value='"Consolas", monospace' />
        </datalist>
      </div>
      <button
        className="btn sm ghost"
        onClick={() => {
          setFontFamily(null);
          setMonoFontFamily(null);
          setFontSize(null);
        }}
      >
        Reset typography to theme
      </button>

      <label
        className="small"
        style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}
      >
        <input
          type="checkbox"
          checked={s.compactToolbar}
          onChange={(e) => setCompactToolbar(e.target.checked)}
        />
        <span>
          <b>Compact toolbar</b>
          <span className="muted">
            {" "}
            - put Sessions, Search, Stats, Terminal, Settings, Users, Integrations,
            OpenCode and the live status inside the title bar. Pop-out session
            windows drop the app toolbar and keep only the window controls in
            their header.
          </span>
        </span>
      </label>

      <label
        className="small"
        style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10 }}
      >
        <input
          type="checkbox"
          checked={s.fileMapSkipContent}
          onChange={(e) => setFileMapSkipContent(e.target.checked)}
        />
        <span>
          <b>Lightweight split file map</b>
          <span className="muted">
            {" "}
            — don’t load arbitrary file contents for previews in the right-side
            file map. Names, sizes and the treemap stay exactly the same, and
            double-click still opens a file for editing. On by default.
          </span>
        </span>
      </label>

      <label
        className="small"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 10,
          marginLeft: 24,
          opacity: s.fileMapSkipContent ? 1 : 0.55,
        }}
      >
        <input
          type="checkbox"
          checked={s.fileMapSafePreviews}
          disabled={!s.fileMapSkipContent}
          onChange={(e) => setFileMapSafePreviews(e.target.checked)}
        />
        <span>
          <b>Safe previews</b>
          <span className="muted">
            {" "}
            — in lightweight mode, still render images and PDFs, plus text files
            below the limit. Previews are lazy: only cells currently on screen
            are read. PDFs open in the browser on double-click.
          </span>
        </span>
      </label>

      <div
        className="small"
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 8,
          marginLeft: 49,
          opacity: s.fileMapSkipContent && s.fileMapSafePreviews ? 1 : 0.55,
        }}
      >
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
          Text ≤
          <LimitInput
            value={s.fileMapMaxTextKb}
            min={1}
            max={4096}
            step={1}
            disabled={!s.fileMapSkipContent || !s.fileMapSafePreviews}
            onCommit={setFileMapMaxTextKb}
          />
          KB
        </label>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
          Images ≤
          <LimitInput
            value={s.fileMapMaxImageMb}
            min={0.1}
            max={100}
            step={0.1}
            disabled={!s.fileMapSkipContent || !s.fileMapSafePreviews}
            onCommit={setFileMapMaxImageMb}
          />
          MB
        </label>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
          PDFs ≤
          <LimitInput
            value={s.fileMapMaxPdfMb}
            min={0.1}
            max={500}
            step={0.5}
            disabled={!s.fileMapSkipContent || !s.fileMapSafePreviews}
            onCommit={setFileMapMaxPdfMb}
          />
          MB
        </label>
      </div>

      </div>

      <div className={tab === "chat" ? "settings-section" : "hidden"}>
      <h3 style={{ marginTop: 24 }}>Chat mode</h3>
      <p className="muted small">
        How sessions open. <b>Terminal chat</b> embeds the opencode TUI using
        opencode's native PTY — it works on Linux, macOS and Windows and needs no
        extra backend. <b>Web chat</b> is the classic structured message view.
      </p>

      <div className="mode-grid">
        <label
          className={
            "mode-card" + (mode === "terminal" && !s.opencodeV2 ? " active" : "")
          }
          style={s.opencodeV2 ? { opacity: 0.55 } : undefined}
        >
          <input
            type="radio"
            name="chatmode"
            disabled={s.opencodeV2}
            checked={mode === "terminal" && !s.opencodeV2}
            onChange={() => setChatMode("terminal")}
          />
          <div>
            <div className="mode-title">
              Terminal chat{" "}
              {s.opencodeV2 ? (
                <span className="badge">opencode v1 only</span>
              ) : (
                <span className="badge completed">default</span>
              )}
            </div>
            <div className="small muted">
              {s.opencodeV2
                ? "Not available with opencode v2 — it removed the attach command used by the embedded TUI."
                : "Full opencode TUI attached to the session (streaming, tools and slash commands in one view). Opening a session launches opencode attach … --session <id>."}
            </div>
          </div>
        </label>

        <label className={"mode-card" + (mode === "web" || s.opencodeV2 ? " active" : "")}>
          <input
            type="radio"
            name="chatmode"
            checked={mode === "web" || s.opencodeV2}
            onChange={() => setChatMode("web")}
          />
          <div>
            <div className="mode-title">Web chat</div>
            <div className="small muted">
              Structured messages with permission prompts, todos and the composer.
            </div>
          </div>
        </label>
      </div>

      <label
        className="small"
        style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}
      >
        <input
          type="checkbox"
          checked={s.thinkingOpen}
          onChange={(e) => setThinkingOpen(e.target.checked)}
        />
        <span>
          Open <b>Thinking</b> boxes by default
          <span className="muted"> — expanded while the model is reasoning</span>
        </span>
      </label>

      <label
        className="small"
        style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}
      >
        <input
          type="checkbox"
          checked={s.shellOutputOpen}
          onChange={(e) => setShellOutputOpen(e.target.checked)}
        />
        <span>
          Show <b>shell output</b> in messages by default
          <span className="muted"> — running and failed tools always expand</span>
        </span>
      </label>

      <h3 style={{ marginTop: 24 }}>Message queue</h3>
      <p className="muted small">
        Queue a message while the agent is busy and Aiman will deliver it only
        after the current task is fully quiescent. Queued messages are sent one
        at a time, in order, using whatever model and agent the session has at
        delivery time.
      </p>

      <label
        className="small"
        style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10 }}
      >
        <input
          type="checkbox"
          checked={s.queueEnabled}
          onChange={(e) => setQueueEnabled(e.target.checked)}
        />
        <span>
          <b>Enable deferred messages</b>
          <span className="muted">
            {" "}
            — show the Queue button and allow AltGr+Enter to queue.
          </span>
        </span>
      </label>

      <label
        className="small"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 10,
          opacity: s.queueEnabled ? 1 : 0.55,
        }}
      >
        <input
          type="checkbox"
          checked={s.queueEnter}
          disabled={!s.queueEnabled}
          onChange={(e) => setQueueEnter(e.target.checked)}
        />
        <span>
          <b>Enter queues while the agent is busy</b>
          <span className="muted">
            {" "}
            — off by default, so Enter always sends immediately. The Queue
            button and AltGr+Enter still queue regardless of this setting.
          </span>
        </span>
      </label>

      <div
        className="small"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 10,
          opacity: s.queueEnabled ? 1 : 0.55,
        }}
      >
        <span>
          <b>Quiet window</b>
          <span className="muted"> — wait this long after the session is clear</span>
        </span>
        <LimitInput
          value={s.queueQuietSeconds}
          min={0}
          max={120}
          step={1}
          disabled={!s.queueEnabled}
          onCommit={setQueueQuietSeconds}
        />
        <span>seconds</span>
      </div>

      <div
        className="small"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          marginTop: 10,
          marginLeft: 24,
          opacity: s.queueEnabled ? 1 : 0.55,
        }}
      >
        <span className="muted">Hold delivery while:</span>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={s.queueBlockQuestions}
            disabled={!s.queueEnabled}
            onChange={(e) => setQueueBlockQuestions(e.target.checked)}
          />
          a question is waiting for an answer
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={s.queueBlockPermissions}
            disabled={!s.queueEnabled}
            onChange={(e) => setQueueBlockPermissions(e.target.checked)}
          />
          a permission request is pending
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={s.queueBlockShells}
            disabled={!s.queueEnabled}
            onChange={(e) => setQueueBlockShells(e.target.checked)}
          />
          a shell command or tool is still running
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={s.queueBlockSubagents}
            disabled={!s.queueEnabled}
            onChange={(e) => setQueueBlockSubagents(e.target.checked)}
          />
          a subagent is still working
        </label>
      </div>

      </div>

      <div className={tab === "servers" ? "settings-section" : "hidden"}>
      <h3 style={{ marginTop: 24 }}>Servers</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>opencode server</td>
            <td>
              <code>{cfg?.opencodeUrl ?? "…"}</code>
            </td>
          </tr>
          <tr>
            <td>native PTY</td>
            <td>
              {cfg ? (
                cfg.terminal ? (
                  <span className="badge completed">available</span>
                ) : (
                  <span className="badge">unavailable</span>
                )
              ) : (
                "…"
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {me?.is_admin ? (
        <ServerSettings />
      ) : (
        <p className="muted small">Server profiles are managed by administrators.</p>
      )}
      </div>

      <div className={tab === "system" ? "settings-section" : "hidden"}>
      <h3 style={{ marginTop: 24 }}>Updates</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>Installed</td>
            <td>
              <code>v{cfg?.version ?? "…"}</code>
            </td>
          </tr>
          <tr>
            <td>Latest release</td>
            <td>
              {upd?.error ? (
                <span className="muted">couldn't reach GitHub</span>
              ) : (
                <code>v{upd?.latest ?? "…"}</code>
              )}{" "}
              {upd?.available && <span className="badge running">update available</span>}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn sm" disabled={checking} onClick={() => checkUpdate(true)}>
          {checking ? "checking…" : "Check for updates"}
        </button>
        {upd?.available && !!me?.is_admin && (
          <button className="btn sm primary" disabled={applying} onClick={doUpdate}>
            {applying ? "updating…" : "Update now"}
          </button>
        )}
        {upd?.url && (
          <a className="btn sm ghost" href={upd.url} target="_blank" rel="noreferrer">
            Release notes
          </a>
        )}
      </div>
      {upd?.available && !me?.is_admin && (
        <p className="muted small">An administrator can apply this update.</p>
      )}
      {upd && !upd.available && !upd.error && (
        <p className="muted small">You're on the latest version.</p>
      )}

      <h3 style={{ marginTop: 24 }}>Background service</h3>
      <p className="muted small">
        Run aiman automatically in the background and at start-up. Uses systemd
        (Linux), launchd (macOS) or Task Scheduler (Windows).
      </p>
      <table className="markdown" style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>Manager</td>
            <td>{svc?.manager ?? "…"}</td>
          </tr>
          <tr>
            <td>Status</td>
            <td>
              {svc ? (
                svc.installed ? (
                  <span className="badge completed">installed</span>
                ) : (
                  <span className="badge">not installed</span>
                )
              ) : (
                "…"
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {svc?.installed ? (
          <button className="btn sm danger" disabled={svcBusy} onClick={uninstallService}>
            {svcBusy ? "working…" : "Uninstall service"}
          </button>
        ) : (
          <button className="btn sm primary" disabled={svcBusy} onClick={installService}>
            {svcBusy ? "working…" : "Install as background service"}
          </button>
        )}
        <button className="btn sm" onClick={restartNow}>
          Restart aiman
        </button>
      </div>

      <h3 style={{ marginTop: 24 }}>Logs</h3>
      {me?.is_admin ? (
        tab === "system" ? (
          <LogsView />
        ) : null
      ) : (
        <p className="muted small">Live logs are available to administrators.</p>
      )}
      </div>

      <div className={tab === "about" ? "settings-section" : "hidden"}>
      <h3 style={{ marginTop: 24 }}>About</h3>
      <div className="about-card">
        <a
          className="about-logo"
          href="https://desota.net/"
          target="_blank"
          rel="noreferrer"
          title="DeSOTA — State Of The Art"
        >
          <img src={desotaLogo} alt="DeSOTA — State Of The Art" />
        </a>
        <div className="about-body">
          <div className="about-product">AiMAN</div>
          <div className="about-by commissioner-brand">by DeSOTA</div>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Self-hosted session manager for opencode — folders, search, usage,
            deferred messages, BTW side questions and session tools.
          </p>
          <div className="about-meta">Version v{cfg?.version ?? "…"}</div>
          <div className="about-dev">
            Developed by <b>Kristian Atanasov</b>
            <br />
            <a href="mailto:kristian@uber-dick.net">kristian@uber-dick.net</a>
          </div>
          <div className="about-links">
            <a
              className="btn sm ghost"
              href="https://desota.net/"
              target="_blank"
              rel="noreferrer"
            >
              desota.net
            </a>
            <a
              className="btn sm ghost"
              href="https://github.com/spacewalkingninja/aiman"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <button className="btn sm ghost" onClick={() => location.reload()}>
              Reload UI
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => store.set({ view: "chat" })}>
          <Icon name="back" /> Back
        </button>
      </div>
      </div>
    </div>
  );
}

function LimitInput({
  value,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const next = Number(text);
    if (Number.isFinite(next) && next >= min) onCommit(next);
    else setText(String(value));
  }

  return (
    <input
      className="input"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{ width: 74, padding: "2px 6px" }}
    />
  );
}
