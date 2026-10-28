import { useEffect, useMemo, useState } from "react";
import { api, type WorkspaceResource } from "./api";
import Icon from "./Icon";
import { toast } from "./store";

type Kind = WorkspaceResource["kind"];

const LABELS: Record<Kind, { title: string; singular: string; plural: string; template: string; help: string }> = {
  skills: {
    title: "Skills",
    singular: "skill",
    plural: "skills",
    template: "## When to use\n\nDescribe when the agent should load this skill.\n\n## Instructions\n\n- Step one\n- Step two\n",
    help: "Reusable instructions stored as SKILL.md. Skills are loaded by opencode when their description matches the task.",
  },
  commands: {
    title: "Commands",
    singular: "command",
    plural: "commands",
    template: "Instructions:\n\nUse $ARGUMENTS to insert the user's arguments.\n",
    help: "Custom slash commands. The command name becomes /<name> in the composer.",
  },
  agents: {
    title: "Agents",
    singular: "agent",
    plural: "agents",
    template: "---\ndescription: A focused agent\nmode: subagent\n---\n\nYou are a focused agent. Describe the agent's responsibilities here.\n",
    help: "Custom Markdown agents. Frontmatter controls description, mode, model, tools and permissions.",
  },
  plugins: {
    title: "Plugins",
    singular: "plugin",
    plural: "plugins",
    template: "// Local opencode plugin\nexport default async function plugin() {\n  return {};\n}\n",
    help: "Local JavaScript/TypeScript plugin files. Package plugins are managed from Integrations → Plugins.",
  },
};

function scopeLabel(scope: string): string {
  if (scope === "project") return "project";
  if (scope === "config") return "config";
  return "global";
}

export default function WorkspaceResources({
  kind,
  directory,
  embedded = false,
}: {
  kind: Kind;
  directory: string;
  embedded?: boolean;
}) {
  const labels = LABELS[kind];
  const [items, setItems] = useState<WorkspaceResource[]>([]);
  const [selected, setSelected] = useState<WorkspaceResource | null>(null);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"global" | "project">("project");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrls, setImportUrls] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.workspaceResources(directory || null, kind);
      setItems(data.resources[kind] ?? []);
    } catch (e) {
      toast(`Failed to load ${labels.plural}: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelected(null);
    setDraft("");
    setName("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, kind]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.scope.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope);
      });
  }, [items, search]);

  function startNew() {
    setSelected(null);
    setName("");
    setScope(directory ? "project" : "global");
    setDraft(labels.template);
  }

  function open(item: WorkspaceResource) {
    setSelected(item);
    setName(item.name);
    setScope(item.scope === "project" ? "project" : "global");
    setDraft(item.content);
  }

  async function save() {
    if (!draft.trim()) return toast("content is required");
    if (!selected && !name.trim()) return toast("name is required");
    setBusy(true);
    try {
      const result = await api.saveWorkspaceResource({
        kind,
        name: name.trim(),
        content: draft,
        scope: selected?.scope === "config" ? "config" : scope,
        path: selected?.editable ? selected.path : null,
        directory: directory || null,
      });
      toast(`${labels.singular} saved`);
      setSelected(result.item);
      setName(result.item.name);
      await load();
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!confirm(`Delete ${labels.singular} "${selected.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteWorkspaceResource({
        kind,
        name: selected.name,
        scope: selected.scope,
        path: selected.path,
        directory: directory || null,
      });
      toast("deleted");
      setSelected(null);
      setDraft("");
      setName("");
      await load();
    } catch (e) {
      toast(`Delete failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: WorkspaceResource) {
    try {
      await api.toggleWorkspaceResource({
        kind,
        name: item.name,
        scope: item.scope,
        path: item.path,
        enabled: !item.enabled,
        directory: directory || null,
      });
      await load();
      if (selected?.path === item.path) {
        setSelected({ ...item, enabled: !item.enabled });
      }
    } catch (e) {
      toast(`Toggle failed: ${e}`);
    }
  }

  async function bulkImport() {
    const urls = importUrls
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!urls.length) return toast("paste at least one URL");
    setBusy(true);
    try {
      const result = await api.importWorkspaceResources({
        kind: kind === "plugins" ? "plugins" : "skills",
        urls,
        scope,
        directory: directory || null,
      });
      toast(
        `Imported ${result.imported.length}${result.errors.length ? ` · ${result.errors.length} failed` : ""}`,
      );
      if (result.errors.length) console.warn(result.errors);
      setImportOpen(false);
      setImportUrls("");
      await load();
    } catch (e) {
      toast(`Import failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ws-section ws-resource-section">
      <div className="ws-section-head">
        <div>
          <h3>{embedded && kind === "plugins" ? "Local plugin files" : labels.title}</h3>
          <p className="muted small">
            {embedded && kind === "plugins"
              ? "Create, edit, import or disable local plugin files for the selected scope."
              : labels.help}
          </p>
        </div>
        <div className="ws-actions">
          <button className="btn sm primary" onClick={startNew}>
            <Icon name="plus" /> New {labels.singular}
          </button>
          {(kind === "skills" || kind === "plugins") && (
            <button className="btn sm" onClick={() => setImportOpen(true)}>
              Import URLs
            </button>
          )}
          <button className="btn sm ghost" onClick={() => void load()}>
            <Icon name="refresh" /> Refresh
          </button>
        </div>
      </div>

      <div className="ws-toolbar">
        <input
          className="input"
          placeholder={`Search ${labels.plural}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted small">
          {items.filter((item) => item.enabled).length} enabled · {items.length} total
        </span>
      </div>

      <div className="ws-resource-split">
        <div className="ws-resource-list">
          {loading && <div className="ext-empty">loading…</div>}
          {!loading && shown.length === 0 && (
            <div className="ext-empty">No {labels.plural} found. Create one to get started.</div>
          )}
          {shown.map((item) => (
            <div
              key={item.kind + item.scope + item.path}
              className={
                "ws-resource-card" +
                (selected?.path === item.path ? " active" : "") +
                (item.enabled ? "" : " off")
              }
              onClick={() => open(item)}
            >
              <div className="ws-resource-main">
                <div className="ws-resource-title">
                  <b>{item.name}</b>
                  <span className="badge">{scopeLabel(item.scope)}</span>
                  {!item.enabled && <span className="badge ran">disabled</span>}
                  {!item.editable && <span className="badge">config</span>}
                </div>
                <div className="ws-resource-desc">
                  {item.description || "No description"}
                </div>
                <div className="ws-mono">{item.path}</div>
              </div>
              {item.editable && item.scope !== "config" && (
                <button
                  className="btn ghost sm"
                  title={item.enabled ? "Disable" : "Enable"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggle(item);
                  }}
                >
                  <Icon name={item.enabled ? "checked" : "unchecked"} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="ws-resource-editor">
          {!selected && !draft && (
            <div className="ext-empty">
              Select a {labels.singular} or create a new one.
            </div>
          )}
          {(selected || draft) && (
            <>
              <div className="ws-editor-head">
                <div>
                  <b>
                    {selected
                      ? selected.editable
                        ? `Edit ${selected.name}`
                        : `${selected.name} (config)`
                      : `New ${labels.singular}`}
                  </b>
                  {selected && <div className="ws-mono">{selected.path}</div>}
                </div>
                <div className="spacer" />
                {selected?.editable && selected.scope !== "config" && (
                  <button className="btn sm danger" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                )}
                {selected?.editable && (
                  <button className="btn sm primary" onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                )}
                {!selected && (
                  <button className="btn sm primary" onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Create"}
                  </button>
                )}
              </div>
              {!selected && (
                <div className="ws-form-row">
                  <label>
                    Name
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={labels.singular + "-name"}
                    />
                  </label>
                  <label>
                    Scope
                    <select
                      className="input"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as "global" | "project")}
                      disabled={!directory}
                    >
                      <option value="project" disabled={!directory}>
                        project (.opencode/{labels.plural})
                      </option>
                      <option value="global">global ({labels.plural})</option>
                    </select>
                  </label>
                </div>
              )}
              {selected?.scope === "config" && (
                <div className="ws-note">
                  This {labels.singular} lives inside an opencode config document. Edit the JSON object
                  here; unrelated config fields stay intact.
                </div>
              )}
              <textarea
                className="ws-code ws-resource-code"
                value={draft}
                readOnly={!!selected && !selected.editable}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
              />
            </>
          )}
        </div>
      </div>

      {importOpen && (
        <div className="overlay" onClick={() => !busy && setImportOpen(false)}>
          <div className="overlay-box ws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">Import {labels.plural} from URLs</div>
            <p className="muted small">
              Paste raw GitHub or HTTPS URLs, one per line. Up to 50 files. Existing items are
              overwritten only when you save them explicitly.
            </p>
            <textarea
              className="input ws-import"
              value={importUrls}
              onChange={(e) => setImportUrls(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../SKILL.md"
              autoFocus
            />
            <div className="ws-form-row">
              <label>
                Scope
                <select
                  className="input"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "global" | "project")}
                  disabled={!directory}
                >
                  <option value="project" disabled={!directory}>
                    project
                  </option>
                  <option value="global">global</option>
                </select>
              </label>
            </div>
            <div className="ws-form-actions">
              <button className="btn" onClick={() => setImportOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" onClick={bulkImport} disabled={busy}>
                {busy ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
