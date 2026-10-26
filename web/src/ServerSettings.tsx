import { useEffect, useState } from "react";
import { api, type OpenCodeServer, type OpenCodeServers } from "./api";
import Icon from "./Icon";
import { toast } from "./store";

type Draft = {
  id: string | null;
  name: string;
  url: string;
  password: string;
  db: string;
  auth: string;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  url: "http://127.0.0.1:4096",
  password: "",
  db: "",
  auth: "",
};

export default function ServerSettings() {
  const [data, setData] = useState<OpenCodeServers | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api.servers());
    } catch (e) {
      toast(`Failed to load server profiles: ${e}`);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function edit(server: OpenCodeServer) {
    setDraft({
      id: server.id,
      name: server.name,
      url: server.url,
      password: "",
      db: server.db,
      auth: server.auth,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.url.trim()) return toast("name and URL are required");
    setBusy(true);
    try {
      if (draft.id) {
        await api.updateServer(draft.id, {
          name: draft.name.trim(),
          url: draft.url.trim(),
          ...(draft.password ? { password: draft.password } : {}),
          db: draft.db.trim(),
          auth: draft.auth.trim(),
        });
      } else {
        await api.createServer({
          name: draft.name.trim(),
          url: draft.url.trim(),
          ...(draft.password ? { password: draft.password } : {}),
          db: draft.db.trim(),
          auth: draft.auth.trim(),
        });
      }
      setDraft(null);
      toast("server profile saved");
      await load();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function activate(server: OpenCodeServer) {
    if (
      !confirm(
        `Activate "${server.name}" and restart AiMAN? The manager will briefly disconnect.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.activateServer(server.id);
      toast("Server activated — restarting AiMAN…");
      setData((prev) => (prev ? { ...prev, activeId: server.id } : prev));
    } catch (e) {
      toast(`Activate failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(server: OpenCodeServer) {
    if (!confirm(`Delete server profile "${server.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteServer(server.id);
      toast("server profile deleted");
      await load();
    } catch (e) {
      toast(`Delete failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 24 }}>OpenCode servers</h3>
      <p className="muted small">
        Keep multiple opencode endpoints and switch the active one. A server profile also stores the
        local database and auth files that belong to that endpoint. Switching restarts AiMAN.
      </p>
      {!!data?.envOverrides.length && (
        <div className="ws-note">
          Environment overrides are active: <b>{data.envOverrides.join(", ")}</b>. They take
          precedence over the selected profile until removed from the service environment.
        </div>
      )}
      <div className="ws-provider-list">
        {data?.servers.map((server) => (
          <div className="ws-card" key={server.id}>
            <div className="ws-card-head">
              <div>
                <b>{server.name}</b>
                {server.active && <span className="badge completed"> active</span>}
                <div className="ws-mono">{server.url}</div>
                {server.db && <div className="ws-mono">db: {server.db}</div>}
                {server.auth && <div className="ws-mono">auth: {server.auth}</div>}
              </div>
              <div className="ws-actions">
                {!server.active && (
                  <button className="btn sm primary" onClick={() => activate(server)} disabled={busy}>
                    Activate
                  </button>
                )}
                <button className="btn sm" onClick={() => edit(server)}>
                  Edit
                </button>
                {!server.active && (
                  <button className="btn sm danger" onClick={() => remove(server)} disabled={busy}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="ws-form-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn sm" onClick={() => setDraft({ ...EMPTY })}>
          <Icon name="plus" /> Add server profile
        </button>
      </div>
      {data?.file && <div className="ws-mono">profiles: {data.file}</div>}

      {draft && (
        <div className="overlay" onClick={() => !busy && setDraft(null)}>
          <div className="overlay-box ws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">
              {draft.id ? "Edit server profile" : "New server profile"}
            </div>
            <div className="ws-form-grid">
              <label>
                Name
                <input
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Local, Work server…"
                />
              </label>
              <label>
                URL
                <input
                  className="input"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="http://127.0.0.1:4096"
                />
              </label>
              <label>
                Password
                <input
                  className="input"
                  type="password"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  placeholder={draft.id ? "leave blank to keep current" : "optional"}
                />
              </label>
              <label>
                opencode database
                <input
                  className="input"
                  value={draft.db}
                  onChange={(e) => setDraft({ ...draft, db: e.target.value })}
                  placeholder="path to opencode.db (optional)"
                />
              </label>
              <label className="full">
                auth.json
                <input
                  className="input"
                  value={draft.auth}
                  onChange={(e) => setDraft({ ...draft, auth: e.target.value })}
                  placeholder="path to auth.json (optional)"
                />
              </label>
            </div>
            <p className="muted small">
              The database and auth paths are read locally by AiMAN. For a remote server, point them
              at a matching local copy of that server's opencode data.
            </p>
            <div className="ws-form-actions">
              <button className="btn" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
