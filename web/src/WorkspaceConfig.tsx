import { useEffect, useMemo, useState } from "react";
import { api, type WorkspaceConfig } from "./api";
import { toast } from "./store";

type Mode = "raw" | "providers" | "permissions" | "prompt" | "code";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function cleanObject(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = cleanObject(value);
      if (Object.keys(nested).length) out[key] = nested;
    } else {
      out[key] = value;
    }
  }
  return out;
}

const COMMON_PERMISSIONS = ["edit", "bash", "webfetch", "read", "write", "list", "task", "skill"];

const RULE_TEMPLATES: Record<string, string> = {
  "Next.js": `# Project Rules (Next.js)\n\n## Stack\n- Next.js App Router\n- React with TypeScript\n- Tailwind\n\n## Conventions\n- Keep components small\n- Use typed API helpers\n- Avoid any/ts-ignore\n`,
  Python: `# Python Script Rules\n\n## Stack\n- Python 3.11+\n- Type hints required\n\n## Conventions\n- Prefer pathlib\n- Keep functions small\n- Add docstrings\n- Use ruff for linting\n`,
  General: `# Project Rules\n\n## Context\n\nDescribe the project, stack and important constraints here.\n\n## Conventions\n\n- Follow existing patterns\n- Keep changes focused\n- Run the relevant tests\n`,
};

export default function WorkspaceConfig({
  directory,
  mode,
  onChanged,
}: {
  directory: string;
  mode: Mode;
  onChanged?: () => void;
}) {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [path, setPath] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [providers, setProviders] = useState<Record<string, any>>({});
  const [defaultModel, setDefaultModel] = useState("");
  const [smallModel, setSmallModel] = useState("");
  const [permission, setPermission] = useState<any>({});
  const [permissionKey, setPermissionKey] = useState<"permission" | "permissions">("permission");
  const [permissionText, setPermissionText] = useState("{}");
  const [lspText, setLspText] = useState("{}");
  const [formatterText, setFormatterText] = useState("{}");
  const [prompt, setPrompt] = useState("");
  const [promptPath, setPromptPath] = useState("");
  const [rules, setRules] = useState("");
  const [rulesPath, setRulesPath] = useState("");
  const [rulesSource, setRulesSource] = useState("AGENTS.md");
  const [cli, setCli] = useState("");
  const [cliPath, setCliPath] = useState("");
  const [cliRevision, setCliRevision] = useState("");

  const docs = config?.docs ?? [];

  async function loadConfig(selected?: string) {
    setLoading(true);
    setError(null);
    try {
      const next = await api.workspaceConfig(directory || null, selected ?? (path || null));
      setConfig(next);
      setPath(next.selected.path);
      setRevision(next.selected.revision);
      setDraft(next.selected.text);
      const data = next.selected.data ?? {};
      setProviders(clone(data.provider ?? {}));
      setDefaultModel(typeof data.model === "string" ? data.model : "");
      setSmallModel(typeof data.small_model === "string" ? data.small_model : "");
      const nativePermissions = data.permissions !== undefined && data.permission === undefined;
      setPermissionKey(nativePermissions ? "permissions" : "permission");
      const permissionValue = nativePermissions ? data.permissions : data.permission;
      setPermission(clone(permissionValue ?? {}));
      setPermissionText(JSON.stringify(permissionValue ?? {}, null, 2));
      setLspText(JSON.stringify(data.lsp ?? {}, null, 2));
      setFormatterText(JSON.stringify(data.formatter ?? {}, null, 2));
      if (next.selected.error) setError(next.selected.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadPrompt() {
    try {
      const [p, r] = await Promise.all([
        api.workspacePrompt(),
        directory ? api.workspaceRules(directory) : Promise.resolve(null),
      ]);
      setPrompt(p.content);
      setPromptPath(p.path);
      if (r) {
        setRules(r.content);
        setRulesPath(r.path);
        setRulesSource(r.source);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadCli() {
    try {
      const c = await api.workspaceCli();
      setCli(c.content);
      setCliPath(c.path);
      setCliRevision(c.revision);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    if (mode === "prompt") {
      void loadPrompt();
      return;
    }
    if (mode === "code" && !config) {
      void loadConfig();
      void loadCli();
      return;
    }
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, mode]);

  useEffect(() => {
    if (mode === "code") void loadCli();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function saveRaw() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveWorkspaceConfig({
        path,
        content: draft,
        revision,
        directory: directory || null,
      });
      setRevision(result.revision);
      toast("Config saved");
      onChanged?.();
      await loadConfig(path);
    } catch (e) {
      setError(String(e));
      toast(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveSections(sections: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveWorkspaceSections({
        path,
        sections,
        revision,
        directory: directory || null,
      });
      setRevision(result.revision);
      toast("Config saved");
      onChanged?.();
      await loadConfig(path);
    } catch (e) {
      setError(String(e));
      toast(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveProviders() {
    const clean: Record<string, any> = {};
    for (const [id, provider] of Object.entries(providers)) {
      const key = id.trim();
      if (!key) continue;
      const next = clone(provider);
      if (next.options) next.options = cleanObject(next.options);
      if (next.env && Array.isArray(next.env)) {
        next.env = next.env.map(String).filter(Boolean);
        if (!next.env.length) delete next.env;
      }
      clean[key] = cleanObject(next);
    }
    const sections: Record<string, unknown> = { provider: clean };
    if (defaultModel.trim()) sections.model = defaultModel.trim();
    if (smallModel.trim()) sections.small_model = smallModel.trim();
    await saveSections(sections);
  }

  async function savePermissions() {
    let parsed: any;
    try {
      parsed = JSON.parse(permissionText);
    } catch (e) {
      toast(`Permission JSON is invalid: ${e}`);
      return;
    }
    await saveSections({ [permissionKey]: parsed });
  }

  async function savePrompt() {
    setSaving(true);
    try {
      await api.saveWorkspacePrompt(prompt);
      toast("Global instructions saved");
      onChanged?.();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveRules() {
    if (!directory) return toast("select a project directory first");
    setSaving(true);
    try {
      const result = await api.saveWorkspaceRules(directory, rules, rulesSource);
      setRulesPath(result.path);
      toast("Project rules saved");
      onChanged?.();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveCode() {
    let lsp: any;
    let formatter: any;
    try {
      lsp = JSON.parse(lspText || "{}");
      formatter = JSON.parse(formatterText || "{}");
    } catch (e) {
      toast(`LSP/formatter JSON is invalid: ${e}`);
      return;
    }
    await saveSections({ lsp, formatter });
  }

  async function saveCli() {
    setSaving(true);
    try {
      const result = await api.saveWorkspaceCli(cli, cliRevision);
      setCliRevision(result.revision);
      toast("cli.json saved");
      onChanged?.();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  function updateProvider(id: string, patch: Record<string, any>) {
    setProviders((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }

  function updateOption(id: string, key: string, value: any) {
    setProviders((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {}),
        options: { ...(prev[id]?.options ?? {}), [key]: value },
      },
    }));
  }

  function updateModel(providerID: string, modelID: string, patch: Record<string, any>) {
    setProviders((prev) => {
      const provider = prev[providerID] ?? {};
      return {
        ...prev,
        [providerID]: {
          ...provider,
          models: {
            ...(provider.models ?? {}),
            [modelID]: { ...(provider.models?.[modelID] ?? {}), ...patch },
          },
        },
      };
    });
  }

  function updateModelLimit(providerID: string, modelID: string, key: string, value: any) {
    setProviders((prev) => {
      const provider = prev[providerID] ?? {};
      const model = provider.models?.[modelID] ?? {};
      return {
        ...prev,
        [providerID]: {
          ...provider,
          models: {
            ...(provider.models ?? {}),
            [modelID]: {
              ...model,
              limit: { ...(model.limit ?? {}), [key]: value === "" ? undefined : Number(value) },
            },
          },
        },
      };
    });
  }

  function updateModelCost(providerID: string, modelID: string, key: string, value: any) {
    setProviders((prev) => {
      const provider = prev[providerID] ?? {};
      const model = provider.models?.[modelID] ?? {};
      return {
        ...prev,
        [providerID]: {
          ...provider,
          models: {
            ...(provider.models ?? {}),
            [modelID]: {
              ...model,
              cost: { ...(model.cost ?? {}), [key]: value === "" ? undefined : Number(value) },
            },
          },
        },
      };
    });
  }

  function addProvider() {
    const id = window.prompt("Provider id (e.g. deepseek, openai)")?.trim();
    if (!id) return;
    if (providers[id]) return toast("provider already exists");
    setProviders((prev) => ({
      ...prev,
      [id]: { name: id, npm: "", options: {}, models: {} },
    }));
  }

  function removeProvider(id: string) {
    if (!confirm(`Remove provider "${id}" from this config?`)) return;
    setProviders((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addModel(providerID: string) {
    const id = window.prompt("Model id (e.g. deepseek-chat)")?.trim();
    if (!id) return;
    if (providers[providerID]?.models?.[id]) return toast("model already exists");
    updateProvider(providerID, {
      models: { ...(providers[providerID]?.models ?? {}), [id]: { id, name: id } },
    });
  }

  function removeModel(providerID: string, modelID: string) {
    if (!confirm(`Remove model "${modelID}"?`)) return;
    setProviders((prev) => {
      const provider = { ...(prev[providerID] ?? {}) };
      const models = { ...(provider.models ?? {}) };
      delete models[modelID];
      provider.models = models;
      return { ...prev, [providerID]: provider };
    });
  }

  const modelCount = useMemo(
    () => Object.values(providers).reduce((n, p: any) => n + Object.keys(p.models ?? {}).length, 0),
    [providers],
  );

  if (mode === "prompt") {
    return (
      <div className="ws-section">
        <div className="ws-section-head">
          <div>
            <h3>System prompt & project rules</h3>
            <p className="muted small">
              Global instructions apply to every opencode session. Project rules apply only inside the
              selected working directory.
            </p>
          </div>
          <div className="ws-actions">
            <button className="btn sm ghost" onClick={() => void loadPrompt()}>
              Reload
            </button>
          </div>
        </div>
        <div className="ws-two-col">
          <div className="ws-card">
            <div className="ws-card-head">
              <div>
                <b>Global instructions</b>
                <div className="ws-mono">{promptPath || "loading…"}</div>
              </div>
              <button className="btn sm primary" onClick={savePrompt} disabled={saving}>
                Save
              </button>
            </div>
            <textarea
              className="ws-code ws-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Global instructions for every agent…"
            />
          </div>
          <div className="ws-card">
            <div className="ws-card-head">
              <div>
                <b>Project rules</b>
                <div className="ws-mono">
                  {directory ? rulesPath || "select a directory" : "select a directory"}
                </div>
              </div>
              <button className="btn sm primary" onClick={saveRules} disabled={saving || !directory}>
                Save
              </button>
            </div>
            <div className="ws-template-row">
              {Object.keys(RULE_TEMPLATES).map((name) => (
                <button
                  key={name}
                  className="btn sm ghost"
                  onClick={() => setRules(RULE_TEMPLATES[name]!)}
                  disabled={!directory}
                >
                  {name}
                </button>
              ))}
            </div>
            <textarea
              className="ws-code ws-prompt"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Project-specific AGENTS.md rules…"
              disabled={!directory}
            />
          </div>
        </div>
      </div>
    );
  }

  if (loading && !config) return <div className="ext-empty">loading config…</div>;
  if (error && !config) return <div className="ws-error">{error}</div>;

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>
            {mode === "raw"
              ? "Raw config"
              : mode === "providers"
                ? "Providers & models"
                : mode === "permissions"
                  ? "Permissions"
                  : "Code settings"}
          </h3>
          <p className="muted small">
            {mode === "raw"
              ? "Edits preserve comments and unknown fields. Save is validated before writing."
              : mode === "providers"
                ? "Configure provider endpoints, model limits, costs and capabilities."
                : mode === "permissions"
                  ? "Global tool permission policy. Agent-specific rules live in agent frontmatter or Raw Config."
                  : "LSP, formatter and the global v2 cli.json."}
          </p>
        </div>
        <div className="ws-actions">
          <select
            className="input"
            value={path}
            onChange={(e) => void loadConfig(e.target.value)}
            title="Config document"
          >
            {docs.map((doc) => (
              <option key={doc.path} value={doc.path}>
                {doc.label}
              </option>
            ))}
          </select>
          <button className="btn sm ghost" onClick={() => void loadConfig(path)}>
            Reload
          </button>
        </div>
      </div>

      {error && <div className="ws-error">{error}</div>}

      {mode === "raw" && (
        <>
          <div className="ws-toolbar">
            <span className="ws-mono">{path}</span>
            {!docs.find((doc) => doc.path === path)?.exists && <span className="badge">new file</span>}
            <div className="spacer" />
            <button className="btn sm" onClick={() => setDraft(JSON.stringify(config?.selected.data ?? {}, null, 2))}>
              Prettify
            </button>
            <button className="btn sm ghost" onClick={() => void loadConfig(path)}>
              Reset
            </button>
            <button className="btn sm primary" onClick={saveRaw} disabled={saving}>
              {saving ? "Saving…" : "Save config"}
            </button>
          </div>
          <textarea
            className="ws-code ws-config-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
        </>
      )}

      {mode === "providers" && (
        <>
          <div className="ws-toolbar">
            <span className="muted small">
              {Object.keys(providers).length} providers · {modelCount} models
            </span>
            <div className="spacer" />
            <button className="btn sm" onClick={addProvider}>
              + Add provider
            </button>
            <button className="btn sm primary" onClick={saveProviders} disabled={saving}>
              {saving ? "Saving…" : "Save providers"}
            </button>
          </div>
          <div className="ws-form-row">
            <label>
              Default model
              <input
                className="input"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="provider/model"
              />
            </label>
            <label>
              Small model
              <input
                className="input"
                value={smallModel}
                onChange={(e) => setSmallModel(e.target.value)}
                placeholder="provider/small-model"
              />
            </label>
          </div>
          <div className="ws-provider-list">
            {Object.entries(providers).map(([id, provider]) => (
              <div className="ws-provider-card" key={id}>
                <div className="ws-card-head">
                  <div>
                    <b>{id}</b>
                    <div className="ws-mono">
                      {Object.keys(provider.models ?? {}).length} models
                    </div>
                  </div>
                  <div className="ws-actions">
                    <button className="btn sm" onClick={() => addModel(id)}>
                      + Model
                    </button>
                    <button className="btn sm danger" onClick={() => removeProvider(id)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="ws-form-grid">
                  <label>
                    Display name
                    <input
                      className="input"
                      value={provider.name ?? ""}
                      onChange={(e) => updateProvider(id, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    npm package
                    <input
                      className="input"
                      value={provider.npm ?? ""}
                      onChange={(e) => updateProvider(id, { npm: e.target.value })}
                      placeholder="@ai-sdk/openai-compatible"
                    />
                  </label>
                  <label>
                    API type
                    <input
                      className="input"
                      value={provider.api ?? ""}
                      onChange={(e) => updateProvider(id, { api: e.target.value })}
                      placeholder="openai-compatible"
                    />
                  </label>
                  <label>
                    Base URL
                    <input
                      className="input"
                      value={provider.options?.baseURL ?? ""}
                      onChange={(e) => updateOption(id, "baseURL", e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </label>
                  <label>
                    API key
                    <input
                      className="input"
                      type="password"
                      value={provider.options?.apiKey ?? ""}
                      onChange={(e) => updateOption(id, "apiKey", e.target.value)}
                      placeholder="optional; env vars also work"
                    />
                  </label>
                  <label>
                    Environment variables
                    <input
                      className="input"
                      value={(provider.env ?? []).join(", ")}
                      onChange={(e) =>
                        updateProvider(id, {
                          env: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                        })
                      }
                      placeholder="DEEPSEEK_API_KEY, OTHER_KEY"
                    />
                  </label>
                </div>
                <div className="ws-model-list">
                  {Object.entries(provider.models ?? {}).map(([modelID, model]: [string, any]) => (
                    <div className="ws-model-row" key={modelID}>
                      <div className="ws-model-id">
                        <b>{modelID}</b>
                        <span className="badge">model</span>
                        <button className="btn ghost sm" onClick={() => removeModel(id, modelID)}>
                          remove
                        </button>
                      </div>
                      <div className="ws-form-grid compact">
                        <label>
                          Model id
                          <input
                            className="input"
                            value={model.id ?? modelID}
                            onChange={(e) => updateModel(id, modelID, { id: e.target.value })}
                          />
                        </label>
                        <label>
                          Name
                          <input
                            className="input"
                            value={model.name ?? ""}
                            onChange={(e) => updateModel(id, modelID, { name: e.target.value })}
                          />
                        </label>
                        <label>
                          Context limit
                          <input
                            className="input"
                            inputMode="numeric"
                            value={model.limit?.context ?? ""}
                            onChange={(e) => updateModelLimit(id, modelID, "context", e.target.value)}
                          />
                        </label>
                        <label>
                          Output limit
                          <input
                            className="input"
                            inputMode="numeric"
                            value={model.limit?.output ?? ""}
                            onChange={(e) => updateModelLimit(id, modelID, "output", e.target.value)}
                          />
                        </label>
                        <label>
                          Input cost
                          <input
                            className="input"
                            inputMode="decimal"
                            value={model.cost?.input ?? ""}
                            onChange={(e) => updateModelCost(id, modelID, "input", e.target.value)}
                          />
                        </label>
                        <label>
                          Output cost
                          <input
                            className="input"
                            inputMode="decimal"
                            value={model.cost?.output ?? ""}
                            onChange={(e) => updateModelCost(id, modelID, "output", e.target.value)}
                          />
                        </label>
                        <label>
                          Cache read
                          <input
                            className="input"
                            inputMode="decimal"
                            value={model.cost?.cache_read ?? ""}
                            onChange={(e) => updateModelCost(id, modelID, "cache_read", e.target.value)}
                          />
                        </label>
                        <label>
                          Cache write
                          <input
                            className="input"
                            inputMode="decimal"
                            value={model.cost?.cache_write ?? ""}
                            onChange={(e) => updateModelCost(id, modelID, "cache_write", e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="ws-check-row">
                        {[
                          ["reasoning", "Reasoning"],
                          ["tool_call", "Tool calls"],
                          ["attachment", "Attachments"],
                        ].map(([field, label]) => (
                          <label className="ws-check" key={field}>
                            <input
                              type="checkbox"
                              checked={field === "tool_call" ? model.tool_call !== false : !!model[field]}
                              onChange={(e) =>
                                updateModel(id, modelID, {
                                  [field]: field === "tool_call" ? e.target.checked : e.target.checked || undefined,
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!Object.keys(provider.models ?? {}).length && (
                    <div className="ext-empty">No models yet. Add one to use this provider.</div>
                  )}
                </div>
              </div>
            ))}
            {!Object.keys(providers).length && (
              <div className="ext-empty">No custom providers configured.</div>
            )}
          </div>
        </>
      )}

      {mode === "permissions" && (
        <>
          <div className="ws-toolbar">
            <span className="muted small">Values are ask, allow or deny.</span>
            <div className="spacer" />
            <button
              className="btn sm"
              onClick={() =>
                setPermissionText(
                  JSON.stringify(
                    Object.fromEntries(COMMON_PERMISSIONS.map((key) => [key, "ask"])),
                    null,
                    2,
                  ),
                )
              }
            >
              Ask by default
            </button>
            <button className="btn sm primary" onClick={savePermissions} disabled={saving}>
              {saving ? "Saving…" : "Save permissions"}
            </button>
          </div>
          <div className="ws-permission-grid">
            {COMMON_PERMISSIONS.map((key) => {
              let current = permission?.[key];
              if (!current) current = "ask";
              if (typeof current !== "string") current = "custom";
              return (
                <label className="ws-permission-row" key={key}>
                  <span>{key}</span>
                  <select
                    className="input"
                    value={current}
                    onChange={(e) => {
                      const next = { ...(permission ?? {}), [key]: e.target.value };
                      setPermission(next);
                      setPermissionText(JSON.stringify(next, null, 2));
                    }}
                  >
                    <option value="ask">ask</option>
                    <option value="allow">allow</option>
                    <option value="deny">deny</option>
                    {current === "custom" && <option value="custom">custom</option>}
                  </select>
                </label>
              );
            })}
          </div>
          <label className="ws-label-block">
            Advanced permission object (JSON)
            <textarea
              className="ws-code ws-permission-editor"
              value={permissionText}
              onChange={(e) => {
                setPermissionText(e.target.value);
                try {
                  setPermission(JSON.parse(e.target.value || "{}"));
                } catch {}
              }}
              spellCheck={false}
            />
          </label>
        </>
      )}

      {mode === "code" && (
        <>
          <div className="ws-toolbar">
            <span className="muted small">These write to the selected opencode config document.</span>
            <div className="spacer" />
            <button className="btn sm primary" onClick={saveCode} disabled={saving}>
              {saving ? "Saving…" : "Save code settings"}
            </button>
          </div>
          <div className="ws-two-col">
            <div className="ws-card">
              <div className="ws-card-head">
                <b>LSP</b>
              </div>
              <textarea
                className="ws-code ws-small-editor"
                value={lspText}
                onChange={(e) => setLspText(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="ws-card">
              <div className="ws-card-head">
                <b>Formatters</b>
              </div>
              <textarea
                className="ws-code ws-small-editor"
                value={formatterText}
                onChange={(e) => setFormatterText(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="ws-card">
            <div className="ws-card-head">
              <div>
                <b>Global v2 cli.json</b>
                <div className="ws-mono">{cliPath || "loading…"}</div>
              </div>
              <button className="btn sm primary" onClick={saveCli} disabled={saving}>
                {saving ? "Saving…" : "Save cli.json"}
              </button>
            </div>
            <p className="muted small">
              Terminal-client settings for opencode v2. This editor does not touch tui.json or v1
              settings.
            </p>
            <textarea
              className="ws-code ws-small-editor tall"
              value={cli}
              onChange={(e) => setCli(e.target.value)}
              spellCheck={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
