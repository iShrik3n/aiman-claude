import { useEffect, useMemo, useState } from "react";
import { api, type Profile, type WorkspaceAuthProvider } from "./api";
import Icon from "./Icon";
import { loadProfiles, toast, useStore } from "./store";

const PROVIDERS = [
  "anthropic",
  "azure",
  "cerebras",
  "deepseek",
  "fireworks",
  "google",
  "groq",
  "github",
  "mistral",
  "openai",
  "openrouter",
  "perplexity",
  "togetherai",
  "xai",
];

function providerList(values: string[]): string[] {
  return [...new Set([...PROVIDERS, ...values.filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b),
  );
}

export default function CredentialSets() {
  const s = useStore();
  const isAdmin = !!s.auth.user?.is_admin;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<WorkspaceAuthProvider[]>([]);
  const [name, setName] = useState("");
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [providerID, setProviderID] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [ps, active, auth] = await Promise.all([
        api.profiles(),
        api.activeProfile(),
        api.workspaceAuth(),
      ]);
      setProfiles(ps);
      setActiveId(active.profileId);
      setLive(auth.providers);
      await loadProfiles();
    } catch (e) {
      toast(`Failed to load credential sets: ${e}`);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = profiles.find((profile) => profile.id === activeId) ?? null;
  const drift = useMemo(() => {
    if (!active) return false;
    const saved = active.providers
      .map((provider) => `${provider.providerID}:${provider.hint}`)
      .sort();
    const current = live
      .filter((provider) => provider.type === "api" && provider.hasAuth)
      .map((provider) => `${provider.id}:${provider.hint}`)
      .sort();
    return saved.join("|") !== current.join("|");
  }, [active, live]);

  const knownProviders = useMemo(
    () => providerList([...live.map((provider) => provider.id), ...(active?.providers ?? []).map((p) => p.providerID)]),
    [live, active],
  );

  async function create() {
    if (!name.trim()) return toast("credential set name is required");
    setBusy(true);
    try {
      await api.createProfile(name.trim());
      setName("");
      toast("credential set created");
      await load();
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addKey(profile: Profile) {
    if (!providerID.trim() || !key.trim()) return toast("provider and API key are required");
    setBusy(true);
    try {
      await api.setProfileAuth(profile.id, [
        { providerID: providerID.trim(), key: key.trim() },
      ]);
      setProviderID("");
      setKey("");
      setAddingFor(null);
      toast("key saved to credential set");
      await load();
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(profile: Profile, id: string) {
    if (!confirm(`Remove ${id} from "${profile.name}"?`)) return;
    try {
      await api.removeProfileAuth(profile.id, id);
      await load();
    } catch (e) {
      toast(String(e));
    }
  }

  async function capture(profile: Profile) {
    if (
      !confirm(
        `Replace "${profile.name}" with the current live API keys? OAuth credentials are not included.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api.captureProfileAuth(profile.id);
      toast(
        result.captured.length
          ? `Captured ${result.captured.length} live API key${result.captured.length === 1 ? "" : "s"}`
          : "No live API keys to capture",
      );
      await load();
    } catch (e) {
      toast(`Capture failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function activate(profile: Profile) {
    const providers = profile.providers.map((provider) => provider.providerID).join(", ") || "none";
    const savedIds = new Set(profile.providers.map((provider) => provider.providerID));
    const removed = live
      .filter((provider) => provider.type === "api" && provider.hasAuth && !savedIds.has(provider.id))
      .map((provider) => provider.id)
      .join(", ");
    if (
      !confirm(
        `Apply credential set "${profile.name}"?\n\nThis changes provider credentials server-wide.\n\nApply: ${providers}\nRemove: ${removed || "none"}\nOAuth: unchanged`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api.activateProfile(profile.id);
      setActiveId(profile.id);
      toast(
        `Active set: ${profile.name}` +
          (result.applied?.length ? ` · applied ${result.applied.length}` : ""),
      );
      await load();
    } catch (e) {
      toast(`Apply failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function rename(profile: Profile) {
    const next = prompt("Credential set name:", profile.name);
    if (!next || !next.trim() || next.trim() === profile.name) return;
    try {
      await api.renameProfile(profile.id, next.trim());
      await load();
    } catch (e) {
      toast(String(e));
    }
  }

  async function remove(profile: Profile) {
    if (!confirm(`Delete credential set "${profile.name}"? The live credentials are not changed.`))
      return;
    try {
      await api.deleteProfile(profile.id);
      await load();
    } catch (e) {
      toast(String(e));
    }
  }

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Saved credential sets</h3>
          <p className="muted small">
            Named sets of provider API keys. Applying a set changes the server-wide opencode auth
            store; it does not touch OAuth credentials or chat history.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => void load()} disabled={busy}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      {drift && (
        <div className="ws-note">
          <b>Live API keys differ from the active set.</b> They may have been edited in Live
          credentials. Capture the current keys into the set, or apply the set to replace them.
        </div>
      )}

      <datalist id="aiman-known-providers">
        {knownProviders.map((provider) => (
          <option key={provider} value={provider} />
        ))}
      </datalist>

      {!!isAdmin && (
        <div className="ws-card">
          <div className="ws-card-head">
            <b>New credential set</b>
            <div className="ws-actions">
              <input
                className="input"
                placeholder="Set name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <button className="btn sm primary" onClick={create} disabled={busy}>
                Create set
              </button>
            </div>
          </div>
          <p className="muted small">
            A set starts empty. Add API keys manually, or create it and use “Capture live keys”.
          </p>
        </div>
      )}

      <div className="ws-provider-list">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            <div className="ws-card" key={profile.id}>
              <div className="ws-card-head">
                <div>
                  <b>{profile.name}</b>
                  {isActive && <span className="badge completed"> active</span>}
                  <div className="muted small">
                    {profile.providers.length} saved API key
                    {profile.providers.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="ws-actions">
                  <button
                    className="btn sm"
                    onClick={() => capture(profile)}
                    disabled={busy}
                    title="Copy current live API keys into this set"
                  >
                    Capture live keys
                  </button>
                  <button
                    className="btn sm primary"
                    onClick={() => activate(profile)}
                    disabled={busy || isActive}
                  >
                    {isActive ? "Active" : "Apply"}
                  </button>
                  <button className="btn sm ghost" onClick={() => rename(profile)}>
                    Rename
                  </button>
                  {!!isAdmin && (
                    <button className="btn sm danger" onClick={() => remove(profile)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="profile-providers">
                {profile.providers.length === 0 && (
                  <span className="muted small">no API keys saved in this set</span>
                )}
                {profile.providers.map((provider) => (
                  <span className="badge" key={provider.providerID}>
                    {provider.providerID} · {provider.hint}{" "}
                    {!!isAdmin && (
                      <a
                        style={{ cursor: "pointer", marginLeft: 4 }}
                        onClick={() => removeKey(profile, provider.providerID)}
                      >
                        <Icon name="close" size={12} />
                      </a>
                    )}
                  </span>
                ))}
              </div>
              {!!isAdmin && (
                <div style={{ marginTop: 8 }}>
                  {addingFor === profile.id ? (
                    <div className="ws-form-row">
                      <input
                        className="input"
                        list="aiman-known-providers"
                        placeholder="provider id (e.g. deepseek, openai)"
                        value={providerID}
                        onChange={(e) => setProviderID(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="API key"
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addKey(profile)}
                      />
                      <button className="btn sm primary" onClick={() => addKey(profile)} disabled={busy}>
                        Save key
                      </button>
                      <button className="btn sm ghost" onClick={() => setAddingFor(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="btn sm" onClick={() => setAddingFor(profile.id)}>
                      + Add provider key
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!profiles.length && <div className="ext-empty">No credential sets found.</div>}
      </div>
    </div>
  );
}
