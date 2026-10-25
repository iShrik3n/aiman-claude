import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api, type Usage } from "./api";
import { BUILTINS, runBuiltin } from "./commands";
import { abortSession, sendPrompt, setAgent, setModel, toast, useStore } from "./store";
import { agentAccent } from "./agents";
import { fmtCost, fmtTokens } from "./StatsView";

type Cmd = { name: string; description: string; custom?: boolean; args?: boolean };

type Attachment = {
  id: string;
  name: string;
  size: number;
  mime: string;
  uri: string;
  preview?: string;
};

/** Convert an absolute path to a file:// URI that opencode can read. */
function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withRoot = /^[A-Za-z]:/.test(normalized) ? "/" + normalized : normalized;
  return "file://" + encodeURI(withRoot).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

export default function Composer({ sessionId }: { sessionId: string }) {
  const s = useStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState<Cmd[]>([]);
  const [palSel, setPalSel] = useState(0);

  // Up/Down recall previously sent prompts for this session.
  const [histIdx, setHistIdx] = useState(-1);
  const draftRef = useRef("");
  const promptHistory = useMemo(() => {
    const out: string[] = [];
    for (const entry of s.entries[sessionId] ?? []) {
      if (entry.info?.role !== "user") continue;
      const body = (entry.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (body) out.push(body);
    }
    return out;
  }, [s.entries[sessionId]]);

  useEffect(() => {
    setHistIdx(-1);
    draftRef.current = "";
  }, [sessionId]);

  function recallHistory(dir: 1 | -1) {
    if (!promptHistory.length) return;
    if (dir === -1) {
      if (histIdx === -1) draftRef.current = text;
      const next = histIdx === -1 ? promptHistory.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setText(promptHistory[next] ?? "");
    } else {
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= promptHistory.length) {
        setHistIdx(-1);
        setText(draftRef.current);
      } else {
        setHistIdx(next);
        setText(promptHistory[next] ?? "");
      }
    }
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  // drag/drop + paste attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  attachmentsRef.current = attachments;

  const taRef = useRef<HTMLTextAreaElement>(null);
  const session = s.sessions.find((x) => x.id === sessionId);
  const directory = session?.directory;

  const accent = useMemo(() => agentAccent(s.agent), [s.agent]);
  const accentStyle = {
    "--agent-accent": accent.accent,
    "--agent-soft": accent.soft,
    "--agent-border": accent.border,
  } as CSSProperties;

  useEffect(() => {
    api
      .commands()
      .then((cs) =>
        setCustom(
          (cs ?? []).map((c) => ({
            name: c.name,
            description: c.description ?? "",
            custom: true,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  // Release object URLs when the composer unmounts.
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) if (a.preview) URL.revokeObjectURL(a.preview);
    };
  }, []);

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((a) => a.id !== id);
    });
  }

  function clearAttachments() {
    for (const a of attachmentsRef.current) if (a.preview) URL.revokeObjectURL(a.preview);
    setAttachments([]);
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const uploaded = await api.upload(directory, file, file.name || "paste");
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: uploaded.name || file.name || "file",
            size: uploaded.size ?? file.size,
            mime: file.type || "application/octet-stream",
            uri: fileUri(uploaded.path),
            preview,
          },
        ]);
      } catch (e) {
        toast(`Upload failed: ${e}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  // slash palette visibility
  const slashMatch = text.match(/^\/([\w-]*)$/);
  const paletteOpen = !!slashMatch && !s.menu;
  const query = (slashMatch?.[1] ?? "").toLowerCase();
  const allCmds: Cmd[] = useMemo(
    () => [...BUILTINS.map((b) => ({ ...b })), ...custom],
    [custom],
  );
  const filtered = useMemo(
    () => allCmds.filter((c) => c.name.toLowerCase().startsWith(query)).slice(0, 12),
    [allCmds, query],
  );

  useEffect(() => setPalSel(0), [query]);

  const status = s.statuses[sessionId];
  const busy = status && status.type !== "idle";
  const usage: Usage | null | undefined = s.sessions.find((x) => x.id === sessionId)?.usage;

  async function send() {
    const value = text.trim();
    if ((!value && !attachments.length) || sending) return;

    // slash command?
    if (value.startsWith("/")) {
      const m = value.match(/^\/([\w-]+)\s*([\s\S]*)$/);
      if (m) {
        const name = m[1]!;
        const args = (m[2] ?? "").trim();
        setText("");
        if (await runBuiltin(name)) return;
        // custom command
        try {
          setSending(true);
          await api.commandRun(sessionId, {
            command: name,
            arguments: args,
            agent: s.agent,
            model: s.model,
          });
        } catch (e) {
          toast(`Command failed: ${e}`);
        } finally {
          setSending(false);
        }
        return;
      }
    }

    setSending(true);
    try {
      const m = s.models.find((x) => x.key === s.model);
      await sendPrompt(sessionId, value, {
        model: m ? { providerID: m.providerID, modelID: m.modelID } : undefined,
        agent: s.agent || undefined,
        files: attachments.map((a) => ({ url: a.uri, filename: a.name, mime: a.mime })),
      });
      setText("");
      setHistIdx(-1);
      draftRef.current = "";
      clearAttachments();
    } catch (e) {
      alert(`Send failed: ${e}`);
    } finally {
      setSending(false);
    }
  }

  function pickCommand(c: Cmd) {
    // parameterless built-ins run immediately; everything else gets inserted
    const paramless = ["new", "sessions", "models", "agents", "compact", "undo", "redo", "share", "unshare", "terminal", "stats", "help", "logout"];
    if (c.custom || !paramless.includes(c.name)) {
      setText("/" + c.name + " ");
      taRef.current?.focus();
    } else if (c.name === "clear") {
      setText("");
    } else {
      setText("");
      runBuiltin(c.name);
    }
  }

  const canSend = !sending && uploading === 0 && (!!text.trim() || attachments.length > 0);

  return (
    <div
      className={"composer" + (dragging ? " drag" : "")}
      style={accentStyle}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      {paletteOpen && (
        <div className="palette">
          {filtered.map((c, i) => (
            <div
              key={c.name}
              className={"palette-item" + (i === palSel ? " active" : "")}
              onMouseEnter={() => setPalSel(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pickCommand(c);
              }}
            >
              <span className="palette-name">/{c.name}</span>
              <span className="muted small">{c.description}</span>
              {c.custom && <span className="badge">command</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-item muted">no matching command</div>}
        </div>
      )}

      {(attachments.length > 0 || uploading > 0) && (
        <div className="attachments">
          {attachments.map((a) => (
            <div className="attachment" key={a.id} title={`${a.name} · ${Math.max(1, Math.round(a.size / 1024))} KB`}>
              {a.preview ? (
                <img src={a.preview} alt="" />
              ) : (
                <span className="attachment-icon">📎</span>
              )}
              <span className="attachment-name">{a.name}</span>
              <button
                type="button"
                className="attachment-x"
                onClick={() => removeAttachment(a.id)}
                title="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}
          {uploading > 0 && <span className="small muted">uploading {uploading}…</span>}
        </div>
      )}

      <textarea
        ref={taRef}
        value={text}
        placeholder="Message opencode…  (Enter to send · Shift+Enter newline · / for commands · Tab changes agent · paste or drop files)"
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (paletteOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setPalSel((i) => (i + 1) % Math.max(1, filtered.length));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setPalSel((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              const c = filtered[palSel];
              if (c) pickCommand(c);
              return;
            }
          }
          if (!paletteOpen && e.key === "ArrowUp") {
            const ta = taRef.current;
            if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
              e.preventDefault();
              recallHistory(-1);
              return;
            }
          }
          if (!paletteOpen && e.key === "ArrowDown" && histIdx >= 0) {
            const ta = taRef.current;
            if (!ta || ta.selectionStart === ta.value.length) {
              e.preventDefault();
              recallHistory(1);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="composer-row">
        <button
          type="button"
          className="btn ghost sm attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach files"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <select
          className="input"
          value={s.model}
          onChange={(e) => setModel(e.target.value)}
          title="Model (ctrl+↑ / ctrl+↓)"
        >
          {s.models.length === 0 && <option value={s.model}>{s.model}</option>}
          {s.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="input agent-select"
          value={s.agent}
          onChange={(e) => setAgent(e.target.value)}
          title="Agent (Tab to cycle) — blue build, orange plan, purple custom"
        >
          {s.agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {usage && usage.total > 0 && (
          <span className="muted small" title="session tokens · cost">
            {fmtTokens(usage.total)} tok · {fmtCost(usage.cost)}
          </span>
        )}
        <div className="spacer" />
        {busy && (
          <button className="btn danger" onClick={() => abortSession(sessionId)}>
            ■ Stop
          </button>
        )}
        <button className="btn primary" disabled={!canSend} onClick={send}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
