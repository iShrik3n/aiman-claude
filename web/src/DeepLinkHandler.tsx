import { useEffect, useState } from "react";
import { api } from "./api";
import { store, toast, useStore } from "./store";

type Action =
  | { kind: "launch"; url: string }
  | { kind: "open"; url: string; path: string | null }
  | { kind: "install-mcp"; url: string; name: string; command: string[]; env: Record<string, string> }
  | { kind: "import-skill"; url: string; source: string }
  | { kind: "import-plugin"; url: string; source: string }
  | { kind: "unknown"; url: string };

function parseLink(raw: string): Action | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "aiman:") return null;
  const action = url.hostname || url.pathname.replace(/^\/+/, "");
  if (action === "launch") return { kind: "launch", url: raw };
  if (action === "open") return { kind: "open", url: raw, path: url.searchParams.get("path") };
  if (action === "install-mcp") {
    const name = (url.searchParams.get("name") ?? "").trim();
    const cmd = (url.searchParams.get("cmd") ?? "").trim();
    if (!name || !cmd) return { kind: "unknown", url: raw };
    let env: Record<string, string> = {};
    const rawEnv = url.searchParams.get("env");
    if (rawEnv) {
      try {
        const parsed = JSON.parse(rawEnv);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          env = Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [String(key), String(value)]),
          );
        }
      } catch {}
    }
    return {
      kind: "install-mcp",
      url: raw,
      name,
      command: cmd.split(/\s+/).filter(Boolean),
      env,
    };
  }
  if (action === "import-skill" || action === "import-plugin") {
    const source = (url.searchParams.get("url") ?? "").trim();
    if (!/^https?:\/\//i.test(source)) return { kind: "unknown", url: raw };
    return { kind: action, url: raw, source };
  }
  return { kind: "unknown", url: raw };
}

export default function DeepLinkHandler() {
  const s = useStore();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const desktop = window.aimanDesktop;
    if (!desktop) return;
    const receive = (url: string) => {
      const parsed = parseLink(url);
      if (parsed) setAction(parsed);
    };
    const off = desktop.onDeepLink?.(receive);
    desktop
      .getPendingDeepLink?.()
      .then((url) => {
        if (url) receive(url);
      })
      .catch(() => {});
    return () => off?.();
  }, []);

  useEffect(() => {
    if (action?.kind === "launch" || action?.kind === "open") {
      if (action.kind === "open" && action.path) {
        const path = action.path;
        if (path === "/workspace") store.set({ view: "workspace" });
        else if (path === "/extensions" || path === "/integrations") {
          store.set({ view: "extensions" });
        } else if (path === "/stats") store.set({ view: "stats" });
        else if (path === "/settings") store.set({ view: "settings" });
      }
      setAction(null);
    }
  }, [action]);

  if (!action) return null;

  const directory =
    s.sessions.find((session) => session.id === s.activeSessionId)?.directory ??
    s.directories[0] ??
    null;

  async function confirm() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "install-mcp") {
        const config: any = {
          type: "local",
          command: action.command,
          enabled: true,
        };
        if (Object.keys(action.env).length) config.environment = action.env;
        const result = await api.saveMcp({
          name: action.name,
          config,
          directory,
        });
        toast(
          result.runtimeError
            ? `MCP saved; runtime: ${result.runtimeError}`
            : `MCP ${action.name} installed`,
        );
        store.set({ view: "extensions" });
      } else if (action.kind === "import-skill" || action.kind === "import-plugin") {
        const result = await api.importWorkspaceResources({
          kind: action.kind === "import-skill" ? "skills" : "plugins",
          urls: [action.source],
          scope: "global",
          directory,
        });
        if (!result.imported.length) throw new Error(result.errors.join("\n") || "import failed");
        toast(`Imported ${result.imported[0]!.name}`);
        store.set({ view: "workspace" });
      } else if (action.kind === "unknown") {
        toast("Unsupported AiMAN deep link");
      }
      setAction(null);
    } catch (e) {
      toast(`Deep link failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && setAction(null)}>
      <div className="overlay-box ws-modal" onClick={(event) => event.stopPropagation()}>
        <div className="overlay-title">
          {action.kind === "install-mcp"
            ? "Install MCP server"
            : action.kind === "import-skill"
              ? "Import skill"
              : action.kind === "import-plugin"
                ? "Import plugin"
                : "AiMAN deep link"}
        </div>
        <p className="muted small">
          This link was opened from outside AiMAN. Only continue if you trust the source.
        </p>
        {action.kind === "install-mcp" && (
          <>
            <div className="ws-path-row">
              <span className="muted small">Name</span>
              <code>{action.name}</code>
            </div>
            <div className="ws-path-row">
              <span className="muted small">Command</span>
              <code>{action.command.join(" ")}</code>
            </div>
            {Object.keys(action.env).length > 0 && (
              <div className="ws-path-row">
                <span className="muted small">Environment</span>
                <code>{Object.keys(action.env).join(", ")}</code>
              </div>
            )}
          </>
        )}
        {(action.kind === "import-skill" || action.kind === "import-plugin") && (
          <div className="ws-path-row">
            <span className="muted small">Source</span>
            <code>{action.source}</code>
          </div>
        )}
        {action.kind === "unknown" && <code>{action.url}</code>}
        <div className="ws-form-actions">
          <button className="btn" onClick={() => setAction(null)} disabled={busy}>
            Cancel
          </button>
          {action.kind !== "unknown" && (
            <button className="btn primary" onClick={confirm} disabled={busy}>
              {busy ? "Working…" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
