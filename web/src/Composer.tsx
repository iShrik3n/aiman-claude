import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { api, type QueueItem, type Usage } from "./api";
import { BUILTINS, runBuiltin } from "./commands";
import { abortSession, sendPrompt, setAgent, setModel, setVariant, toast, useStore } from "./store";
import { agentAccent } from "./agents";
import Icon from "./Icon";
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

const VARIANT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  thinking: "Thinking",
};

function variantLabel(id: string): string {
  return VARIANT_LABELS[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Convert an absolute path to a file:// URI that opencode can read. */
function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withRoot = /^[A-Za-z]:/.test(normalized) ? "/" + normalized : normalized;
  return "file://" + encodeURI(withRoot).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

export default function Composer({
  sessionId,
  onBtw,
}: {
  sessionId: string;
  onBtw?: (question: string) => void;
}) {
  const s = useStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState<Cmd[]>([]);
  const [palSel, setPalSel] = useState(0);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueServerOffset, setQueueServerOffset] = useState(0);
  const [queueTick, setQueueTick] = useState(Date.now());

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

  // The deferred queue lives on the server so it survives reloads and browser
  // closes. Poll while the composer is visible so the quiet-window bar and
  // blocker messages stay current.
  useEffect(() => {
    let alive = true;
    setQueueItems([]);
    const load = async () => {
      try {
        const result = await api.queue(sessionId);
        if (!alive) return;
        setQueueItems(result.items);
        setQueueServerOffset(result.serverNow - Date.now());
      } catch {
        // The session may be gone, or the manager may be restarting.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!queueItems.some((item) => item.nextSendAt)) return;
    const timer = setInterval(() => setQueueTick(Date.now()), 250);
    return () => clearInterval(timer);
  }, [queueItems]);

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
  // The model selector follows the session's last actually-used assistant
  // model when the session opens. A session can have a different model from
  // the global default (e.g. an opencode free model vs a direct API model).
  const lastUsedModel = useMemo(() => {
    const list = s.entries[sessionId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const info = list[i]?.info;
      if (info?.role === "assistant" && info.providerID && info.modelID) {
        return {
          key: `${info.providerID}/${info.modelID}`,
          variant: info.variant ?? "",
        };
      }
    }
    return null;
  }, [s.entries[sessionId]]);
  const syncedLastModel = useRef("");
  useEffect(() => {
    if (!lastUsedModel) return;
    const signature = `${sessionId}:${lastUsedModel.key}:${lastUsedModel.variant}`;
    if (syncedLastModel.current === signature) return;
    syncedLastModel.current = signature;
    if (s.model !== lastUsedModel.key || s.variant !== lastUsedModel.variant) {
      setModel(lastUsedModel.key);
      setVariant(lastUsedModel.variant);
    }
  }, [sessionId, lastUsedModel, s.model, s.variant]);

  // opencode v2 exposes reasoning-effort variants per model; only show the
  // second selector (and send `variant`) when the active model has any.
  const activeModel = s.models.find((m) => m.key === s.model);
  const variants = activeModel?.variants ?? [];
  const variant = variants.includes(s.variant) ? s.variant : "";
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
  const pendingPermissions = s.permissions[sessionId] ?? [];
  const pendingQuestions = s.questions[sessionId] ?? [];
  const usage: Usage | null | undefined = s.sessions.find((x) => x.id === sessionId)?.usage;

  // opencode's context indicator uses the latest assistant message (not the
  // cumulative session total): input + output + reasoning + cache read/write.
  const contextUsage = useMemo(() => {
    const entries = s.entries[sessionId] ?? [];
    let info: any = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      const candidate = entries[i]?.info;
      if (candidate?.role === "assistant" && candidate.tokens) {
        info = candidate;
        break;
      }
    }
    if (!info) return null;
    const tokens = info.tokens;
    const cache = tokens.cache ?? {};
    const used =
      Number(tokens.input ?? 0) +
      Number(tokens.output ?? 0) +
      Number(tokens.reasoning ?? 0) +
      Number(cache.read ?? 0) +
      Number(cache.write ?? 0);
    const model =
      s.models.find(
        (m) => m.providerID === info.providerID && m.modelID === info.modelID,
      ) ?? s.models.find((m) => m.key === s.model);
    const limit = model?.context ?? 0;
    if (!used || !limit) return null;
    return { used, limit, pct: Math.round((used / limit) * 100) };
  }, [s.entries[sessionId], s.models, s.model]);

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
        if (name === "btw") {
          if (onBtw) onBtw(args);
          else toast("BTW side questions are unavailable here");
          return;
        }
        if (await runBuiltin(name)) return;
        // custom command
        try {
          setSending(true);
          await api.commandRun(sessionId, {
            command: name,
            arguments: args,
            agent: s.agent,
            model: s.model,
            variant: variant || undefined,
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
        variant: variant || undefined,
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

  async function queue() {
    const value = text.trim();
    if ((!value && !attachments.length) || sending) return;
    if (!s.queueEnabled) {
      toast("Deferred messages are disabled in Settings");
      return;
    }
    if (!s.opencodeV2) {
      toast("Deferred messages require opencode v2");
      return;
    }
    if (value.startsWith("/")) {
      toast("Slash commands can't be queued");
      return;
    }

    setSending(true);
    try {
      const result = await api.enqueue(sessionId, {
        text: value,
        files: attachments.map((a) => ({
          uri: a.uri,
          name: a.name,
          mime: a.mime,
        })),
        quietMs: s.queueQuietSeconds * 1000,
        blockQuestions: s.queueBlockQuestions,
        blockPermissions: s.queueBlockPermissions,
        blockShells: s.queueBlockShells,
        blockSubagents: s.queueBlockSubagents,
      });
      setQueueItems(result.items);
      setQueueServerOffset(result.serverNow - Date.now());
      setText("");
      setHistIdx(-1);
      draftRef.current = "";
      clearAttachments();
      toast("Queued for after this task");
    } catch (e) {
      toast(`Queue failed: ${e}`);
    } finally {
      setSending(false);
    }
  }

  async function cancelQueuedItem(id: string) {
    try {
      await api.cancelQueued(id);
      const result = await api.queue(sessionId);
      setQueueItems(result.items);
      setQueueServerOffset(result.serverNow - Date.now());
      toast("Queued message cancelled");
    } catch (e) {
      toast(`Could not cancel: ${e}`);
    }
  }

  function isQueueShortcut(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    return (
      e.key === "Enter" &&
      (e.getModifierState?.("AltGraph") || (e.altKey && e.ctrlKey))
    );
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
  const queueNow = queueTick + queueServerOffset;

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

      {queueItems.length > 0 && (
        <div className="queue-tray">
          <div className="queue-head">
            <Icon name="clock" size={13} />
            <b>Deferred messages</b>
            <span className="muted small">
              — sent one at a time after the current task is fully done
            </span>
          </div>
          {queueItems.map((item, index) => {
            const remaining = item.nextSendAt ? Math.max(0, item.nextSendAt - queueNow) : null;
            const pct =
              item.nextSendAt && item.quietMs > 0
                ? Math.max(
                    0,
                    Math.min(
                      100,
                      ((item.quietMs - (remaining ?? 0)) / item.quietMs) * 100,
                    ),
                  )
                : 0;
            const label =
              item.status === "sending"
                ? "Sending…"
                : item.status === "failed"
                  ? "Failed"
                  : `Queued${queueItems.length > 1 ? ` #${index + 1}` : ""}`;
            const preview =
              item.text.trim() ||
              `${item.files.length} attachment${item.files.length === 1 ? "" : "s"}`;
            return (
              <div
                key={item.id}
                className={
                  "queue-item" +
                  (item.status === "failed" ? " failed" : "") +
                  (item.status === "sending" ? " sending" : "")
                }
              >
                <div className="queue-item-head">
                  <span className="queue-label">{label}</span>
                  <span className="queue-preview" title={preview}>
                    {preview}
                  </span>
                  {item.status !== "sending" &&
                    !(item.status === "pending" && item.nextSendAt && item.quietMs > 0) && (
                      <button
                        type="button"
                        className="btn ghost sm queue-cancel"
                        onClick={() => void cancelQueuedItem(item.id)}
                        title={
                          item.status === "failed"
                            ? "Dismiss failed message"
                            : "Cancel this queued message"
                        }
                      >
                        {item.status === "failed" ? "Dismiss" : "Cancel"}
                      </button>
                    )}
                </div>
                {item.status === "pending" && item.nextSendAt && item.quietMs > 0 ? (
                  <div
                    className="queue-wait"
                    title={`Sending in ${Math.ceil((remaining ?? 0) / 1000)} seconds unless cancelled`}
                  >
                    <div className="queue-progress">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="queue-eta">
                      {remaining && remaining > 0
                        ? `${Math.ceil(remaining / 1000)}s`
                        : "sending…"}
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => void cancelQueuedItem(item.id)}
                      title="Cancel before this message is sent"
                    >
                      Cancel
                    </button>
                  </div>
                ) : item.blockedReason ? (
                  <div className="queue-reason">{item.blockedReason}</div>
                ) : item.status === "sending" ? (
                  <div className="queue-reason">Delivering message to opencode…</div>
                ) : null}
                {item.status === "failed" && item.error && (
                  <div className="queue-reason queue-error">{item.error}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(attachments.length > 0 || uploading > 0) && (
        <div className="attachments">
          {attachments.map((a) => (
            <div className="attachment" key={a.id} title={`${a.name} · ${Math.max(1, Math.round(a.size / 1024))} KB`}>
              {a.preview ? (
                <img src={a.preview} alt="" />
              ) : (
                <span className="attachment-icon"><Icon name="attach" size={16} /></span>
              )}
              <span className="attachment-name">{a.name}</span>
              <button
                type="button"
                className="attachment-x"
                onClick={() => removeAttachment(a.id)}
                title="Remove attachment"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
          {uploading > 0 && <span className="small muted">uploading {uploading}…</span>}
        </div>
      )}

      <textarea
        ref={taRef}
        className="kjofol-lcd-screen xeno3000-composer-input"
        value={text}
        placeholder="Message opencode…  (Enter to send · Shift+Enter newline · AltGr+Enter to queue · / for commands · paste or drop files)"
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (isQueueShortcut(e)) {
            e.preventDefault();
            void queue();
            return;
          }
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
            const queueOnEnter =
              s.queueEnabled &&
              s.opencodeV2 &&
              s.queueEnter &&
              (busy || pendingPermissions.length > 0 || pendingQuestions.length > 0);
            if (queueOnEnter) void queue();
            else void send();
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
          <Icon name="attach" />
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
          title={
            lastUsedModel
              ? `Model — last used by this session: ${lastUsedModel.key}${
                  lastUsedModel.variant ? ` · ${lastUsedModel.variant}` : ""
                }`
              : "Model (ctrl+↑ / ctrl+↓)"
          }
        >
          {!s.models.some((m) => m.key === s.model) && (
            <option value={s.model}>{s.model}</option>
          )}
          {s.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {variants.length > 0 && (
          <select
            className="input variant-select"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            title="Reasoning effort / performance level for this model"
          >
            <option value="">Default</option>
            {variants.map((v) => (
              <option key={v} value={v}>
                {variantLabel(v)}
              </option>
            ))}
          </select>
        )}
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
        {contextUsage && (
          <span
            className={
              "context-usage" +
              (contextUsage.pct >= 90 ? " danger" : contextUsage.pct >= 70 ? " warn" : "")
            }
            title={`Context used: ${fmtTokens(contextUsage.used)} / ${fmtTokens(contextUsage.limit)} tokens (${contextUsage.pct}%)`}
          >
            <span className="context-track">
              <span style={{ width: `${Math.min(100, contextUsage.pct)}%` }} />
            </span>
            <span>{contextUsage.pct}% ctx</span>
          </span>
        )}
        {usage && usage.total > 0 && (
          <span className="muted small" title="session tokens · cost">
            {fmtTokens(usage.total)} tok · {fmtCost(usage.cost)}
          </span>
        )}
        <div className="spacer" />
        {busy && (
          <button className="btn danger kill-switch-btn" onClick={() => abortSession(sessionId)}>
            <Icon name="stop" /> Stop
          </button>
        )}
        {s.queueEnabled && s.opencodeV2 && (
          <button
            type="button"
            className="btn micro-deck-btn"
            disabled={!canSend}
            onClick={() => void queue()}
            title="Queue for after the current task is fully done (AltGr+Enter)"
          >
            <Icon name="clock" /> Queue
          </button>
        )}
        <button
          className="btn primary xeno3000-send plasma-orb"
          disabled={!canSend}
          onClick={send}
        >
          <Icon name={sending ? "refresh" : "send"} /> {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
