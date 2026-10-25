import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Composer from "./Composer";
import PartView from "./PartView";
import ErrorBoundary from "./ErrorBoundary";
import FileBrowser from "./FileBrowser";
import BtwPanel from "./BtwPanel";
import Icon from "./Icon";
import { WindowControls } from "./DesktopTitlebar";

const TerminalPane = lazy(() => import("./TerminalPane"));
import {
  api,
  type MessageEntry,
  type Part,
  type QuestionRequest,
  type SessionStats,
} from "./api";
import { fmtFull, fmtTime } from "./time";
import { agentAccent } from "./agents";

/** Text a part contributes to the in-session finder. */
function partSearchText(part: Part): string {
  if (part.type === "text" || part.type === "reasoning") return part.text ?? "";
  if (part.type === "tool") {
    return [
      part.tool ?? "",
      JSON.stringify(part.state?.input ?? {}),
      part.state?.output ?? "",
      part.state?.error ?? "",
    ].join("\n");
  }
  if (part.type === "file") return [part.filename ?? "", part.url ?? ""].join(" ");
  if (part.type === "patch" && Array.isArray(part.files)) return part.files.join("\n");
  return "";
}

function entryMatches(entry: MessageEntry, query: string): boolean {
  return entry.parts.some((p) => partSearchText(p).toLowerCase().includes(query));
}

/** Wrap query hits in rendered plain text with <mark>. */
function Highlight({ text, query }: { text: string; query?: string }): ReactNode {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(q);
  while (idx >= 0) {
    if (idx > last) out.push(text.slice(last, idx));
    out.push(
      <mark key={`m${idx}`} className="find-mark">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    last = idx + q.length;
    idx = lower.indexOf(q, last);
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
import { fmtCost, fmtTokens } from "./StatsView";
import {
  abortSession,
  answerQuestion,
  archiveSession,
  createSession,
  openSession,
  openSessionWindow,
  refreshSessions,
  rejectQuestionSafe,
  renameSession,
  replyPermissionSafe,
  store,
  toast,
  togglePin,
  useStore,
} from "./store";

export default function ChatView({
  popout = false,
  compact = false,
}: {
  popout?: boolean;
  compact?: boolean;
} = {}) {
  const s = useStore();
  const id = s.activeSessionId!;

  const session = s.sessions.find((x) => x.id === id);
  const entries = s.entries[id] ?? [];
  const todos = s.todos[id] ?? [];
  const perms = s.permissions[id] ?? [];
  const questions = s.questions[id] ?? [];
  const status = s.statuses[id];
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session?.title ?? "");
  const [diff, setDiff] = useState<{ files: string[] } | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showBtw, setShowBtw] = useState(false);
  const [btwRequest, setBtwRequest] = useState<{ question: string; nonce: number } | null>(
    null,
  );

  // Floating subagent panels (child sessions spawned by this one).
  const [subModes, setSubModes] = useState<Record<string, "min" | "normal" | "max">>({});
  const [dismissedSubs, setDismissedSubs] = useState<Set<string>>(() => new Set());
  const requestedSubs = useRef<Set<string>>(new Set());

  // Small shell terminals that live in the same dock as subagent windows.
  const [terminals, setTerminals] = useState<
    { id: number; mode: "min" | "normal" | "max" }[]
  >([]);
  const nextTerminal = useRef(0);
  useEffect(() => {
    setTerminals([]);
    setShowBtw(false);
    setBtwRequest(null);
  }, [id]);
  function openTerminal() {
    setTerminals((prev) => {
      if (prev.length >= 4) {
        toast("Close a terminal before opening another");
        return prev;
      }
      return [...prev, { id: ++nextTerminal.current, mode: "normal" }];
    });
  }

  function openBtw(question = "") {
    setBtwRequest({ question, nonce: Date.now() });
    setShowBtw(true);
  }

  // ---- quick find inside the open session ----
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [findPos, setFindPos] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const confirmStopRef = useRef(false);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Transcript virtualisation: how many messages live in the DOM at once.
  const VISIBLE = 40;
  const STEP = 20;

  const findMatches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [] as number[];
    const hits: number[] = [];
    entries.forEach((e, i) => {
      if (entryMatches(e, q)) hits.push(i);
    });
    return hits;
  }, [entries, find]);
  const findSet = useMemo(() => new Set(findMatches), [findMatches]);

  const thinkingOpen = s.thinkingOpen;
  const shellOutputOpen = s.shellOutputOpen;

  // Tools/shell commands that are still executing, surfaced under the header.
  const runningTools = useMemo(() => {
    const out: { id: string; name: string; detail: string; status: string }[] = [];
    for (const entry of entries) {
      for (const part of entry.parts) {
        if (part.type !== "tool") continue;
        const status = part.state?.status;
        if (status !== "running" && status !== "pending") continue;
        const meta = part.state?.metadata ?? {};
        const input = part.state?.input ?? {};
        const detail = String(
          part.state?.title ??
            meta.title ??
            meta.command ??
            input.command ??
            input.description ??
            input.filePath ??
            input.path ??
            "",
        );
        out.push({ id: part.id, name: part.tool ?? "tool", detail, status });
      }
    }
    return out;
  }, [entries]);

  const busy = (status != null && status.type !== "idle") || runningTools.length > 0;

  // Child sessions spawned by task/subagent tools, shown as floating panels.
  const now = Date.now();
  const visibleSubs = s.sessions.filter((child) => {
    if (child.parentId !== id || dismissedSubs.has(child.id)) return false;
    // /btw side sessions are for the history overlay, not the subagent dock.
    if (child.title.startsWith("btw:")) return false;
    const st = s.statuses[child.id];
    const childBusy = !!st && st.type !== "idle";
    return childBusy || now - child.timeUpdated < 20 * 60 * 1000;
  });

  function subMeta(childId: string) {
    const list = s.entries[childId] ?? [];
    let agent = "subagent";
    for (let i = list.length - 1; i >= 0; i--) {
      const name = list[i]?.info?.agentID;
      if (name) {
        agent = name;
        break;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      for (const part of list[i]!.parts) {
        if (part.type !== "tool") continue;
        if (part.state?.status !== "running" && part.state?.status !== "pending") continue;
        const detail = String(
          part.state?.title ??
            part.state?.metadata?.command ??
            part.state?.input?.command ??
            part.state?.input?.description ??
            part.tool ??
            "",
        );
        return {
          agent,
          busy: true,
          activity: `${part.tool ?? "tool"}${detail ? " · " + detail : ""}`,
        };
      }
    }
    const st = s.statuses[childId];
    if (st?.type === "retry") return { agent, busy: true, activity: `retry ${st.attempt}` };
    if (st && st.type !== "idle") return { agent, busy: true, activity: "thinking…" };
    return { agent, busy: false, activity: "idle" };
  }

  // Liveness fallback: opencode v2 does not always deliver `session.status`,
  // so also treat an unfinished last message, running tools, or a running
  // subagent as "still working".
  const lastEntry = entries[entries.length - 1];
  const lastCreated = Number(lastEntry?.info?.time?.created ?? 0);
  const looksStreaming =
    !!lastEntry &&
    Date.now() - lastCreated < 30 * 60 * 1000 &&
    (lastEntry.info?.role === "user" ||
      (lastEntry.info?.role === "assistant" && !lastEntry.info?.time?.completed));
  const subLive = visibleSubs.some((child) => {
    const st = s.statuses[child.id];
    if (st && st.type !== "idle") return true;
    return subMeta(child.id).busy;
  });
  const live = busy || subLive || (status == null && looksStreaming);
  // Auto-follow is only for an in-flight turn. Once the turn is complete, late
  // layout work (markdown, images, tool cards) must not yank the viewport back
  // to the bottom while the user is reading.
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  /** Open/close the "stop running?" confirmation (ref keeps double-Esc reliable). */
  function setStopPrompt(open: boolean) {
    confirmStopRef.current = open;
    setConfirmStop(open);
  }

  function reveal(index: number) {
    const maxStart = Math.max(0, entries.length - VISIBLE);
    const start = Math.max(0, Math.min(index - Math.floor(VISIBLE / 3), maxStart));
    stickToBottom.current = false;
    setWindowStart(start);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(
          `[data-entry-index="${index}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });
  }

  function gotoMatch(dir: 1 | -1) {
    if (!findMatches.length) return;
    const next = (findPos + dir + findMatches.length) % findMatches.length;
    setFindPos(next);
    reveal(findMatches[next]!);
  }

  // Reset the finder when switching sessions.
  useEffect(() => {
    setFind("");
    setFindOpen(false);
    setFindPos(0);
    setStopPrompt(false);
  }, [id]);

  // Reset the hit cursor while typing, but never move the transcript until the
  // user actually navigates (Enter / arrows) — auto-jumping felt like a glitch.
  useEffect(() => {
    setFindPos(0);
  }, [find]);

  // Ctrl/Cmd+F opens the session finder instead of the browser's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && id !== "__new__") {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  // Escape: close the finder, or ask before stopping a running turn. A second
  // Escape confirms, so a stray keypress never kills a long tool run.
  useEffect(() => {
    if (s.chatMode === "terminal" && !s.opencodeV2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (findOpen) {
        setFindOpen(false);
        setFind("");
        return;
      }
      if (confirmStopRef.current) {
        e.preventDefault();
        setStopPrompt(false);
        abortSession(id);
        return;
      }
      if (live) {
        e.preventDefault();
        setStopPrompt(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, findOpen, live, s.chatMode, s.opencodeV2]);

  // Hide the confirmation if the turn ends while it is open.
  useEffect(() => {
    if (!live) setStopPrompt(false);
  }, [live, id]);

  // Load transcripts for recently active subagent (child) sessions so their
  // floating panels can follow the shared event stream.
  useEffect(() => {
    if (id === "__new__") return;
    const now = Date.now();
    for (const child of s.sessions) {
      if (child.parentId !== id) continue;
      const childStatus = s.statuses[child.id];
      const childBusy = !!childStatus && childStatus.type !== "idle";
      if (!childBusy && now - child.timeUpdated > 20 * 60 * 1000) continue;
      if (requestedSubs.current.has(child.id)) continue;
      requestedSubs.current.add(child.id);
      api
        .messages(child.id)
        .then((loaded) =>
          store.set({ entries: { ...store.get().entries, [child.id]: loaded } }),
        )
        .catch(() => requestedSubs.current.delete(child.id));
    }
  }, [id, s.sessions, s.statuses]);

  // ---- virtualised transcript -------------------------------------------
  // Only a small window of messages is kept in the DOM. The window follows the
  // newest messages while the user is parked at the bottom; scrolling up loads
  // earlier batches, and a "new messages" button appears when the stream runs
  // ahead of the viewport.
  const [windowStart, setWindowStart] = useState(0);
  const initedFor = useRef<string | null>(null);
  const stickToBottom = useRef(true);
  // Set when the user deliberately leaves the bottom. While true, merely being
  // within the "near bottom" band does not silently re-enable auto-follow.
  const userPaused = useRef(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  const pauseFollow = () => {
    stickToBottom.current = false;
    userPaused.current = true;
  };

  const resumeFollow = () => {
    stickToBottom.current = true;
    userPaused.current = false;
  };

  const scrollToBottom = () => {
    const snap = () => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    // Two frames cover the window/state update; the timer catches late layout
    // (images, code blocks) after opening a session.
    requestAnimationFrame(() => {
      snap();
      requestAnimationFrame(snap);
    });
    setTimeout(() => {
      if (stickToBottom.current) snap();
    }, 200);
  };

  // First render (or first arrival of messages) for a session.
  useLayoutEffect(() => {
    if (!entries.length || initedFor.current === id) return;
    initedFor.current = id;
    resumeFollow();
    lastScrollTop.current = 0;
    setWindowStart(Math.max(0, entries.length - VISIBLE));
    scrollToBottom();
  }, [id, entries.length]);

  // Follow new messages only while the turn is live and the user is at the
  // bottom. A finished conversation should stay exactly where it is.
  useEffect(() => {
    if (!entries.length || !stickToBottom.current || !liveRef.current) return;
    setWindowStart(Math.max(0, entries.length - VISIBLE));
    scrollToBottom();
  }, [entries.length]);

  const loadEarlier = () => {
    const el = bodyRef.current;
    const before = el?.scrollHeight ?? 0;
    const beforeTop = el?.scrollTop ?? 0;
    setWindowStart((w) => Math.max(0, w - STEP));
    requestAnimationFrame(() => {
      const el2 = bodyRef.current;
      if (el2) el2.scrollTop = el2.scrollHeight - before + beforeTop;
    });
  };

  const lastLen = useMemo(
    () => entries.reduce((n, e) => n + e.parts.length + JSON.stringify(e.info).length, 0),
    [entries],
  );

  // Streaming grows the last message without changing the entry count. Only
  // follow while the turn is actually live; when it finishes, leave the scroll
  // position alone even if the final markdown/tool layout changes height.
  useEffect(() => {
    if (live && stickToBottom.current) scrollToBottom();
  }, [lastLen, live]);

  // Pin to the bottom whenever the rendered content changes height (images,
  // code blocks, markdown) while the user is following the stream.
  useEffect(() => {
    const inner = innerRef.current;
    const el = bodyRef.current;
    if (!inner || !el) return;
    const ro = new ResizeObserver(() => {
      if (!stickToBottom.current || !liveRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [id]);

  const newestHidden = Math.max(0, entries.length - (windowStart + VISIBLE));

  const jumpToLatest = () => {
    resumeFollow();
    setWindowStart(Math.max(0, entries.length - VISIBLE));
    scrollToBottom();
  };

  useEffect(() => setTitle(session?.title ?? ""), [session?.id, session?.title]);

  const statusType = status?.type ?? "idle";
  useEffect(() => {
    if (id === "__new__") return;
    let alive = true;
    api
      .sessionStats(id)
      .then((st) => alive && setStats(st))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, statusType]);

  if (id === "__new__") return <NewSession />;

  // Terminal chat mode: embed the opencode TUI attached to this session.
  // opencode v2 dropped `attach`, so use the structured chat there.
  if (s.chatMode === "terminal" && !s.opencodeV2) {
    return (
      <div className="chat">
        <div className={"chat-head" + (popout && compact ? " popout-header" : "")}>
          {!popout && (
            <button
              className="btn ghost sm"
              onClick={() => store.set({ activeSessionId: null })}
              title="Back to list"
            >
              <Icon name="back" />
            </button>
          )}
          <div className="chat-title">{session?.title || "(untitled)"}</div>
          <span className="badge">{session?.directory}</span>
          <div className={"spacer" + (popout && compact ? " drag-region" : "")} />
          {!popout && (
            <button
              className="btn ghost sm"
              onClick={() => openSessionWindow(id)}
              title="Open in new window"
            >
              <Icon name="external" />
            </button>
          )}
          <button className="btn ghost sm" onClick={() => setShowFiles(true)} title="Files">
            <Icon name="folder" /> files
          </button>
          <button className="btn ghost sm" onClick={() => setShowStats(true)} title="Session statistics">
            <Icon name="stats" /> stats
          </button>
          <button
            className="btn ghost sm"
            onClick={openTerminal}
            title="Open a shell terminal in this session's directory"
          >
            <Icon name="terminal" /> terminal
          </button>
          <button
            className="btn ghost sm"
            onClick={() => openBtw()}
            title="BTW side questions and saved answers"
          >
            <Icon name="chat" /> btw
          </button>
          <button className="btn ghost sm" onClick={loadDiff} title="Show changed files">
            <Icon name="code" /> diff
          </button>
          <button
            className="btn ghost sm"
            onClick={() => togglePin(session!)}
            title={session?.pinned ? "Unpin session" : "Pin session"}
          >
            <Icon name={session?.pinned ? "pin" : "pinOff"} />
          </button>
          <button
            className="btn ghost sm"
            onClick={() => archiveSession(id, session?.timeArchived == null)}
            title={session?.timeArchived == null ? "Archive session" : "Unarchive session"}
          >
            <Icon name="archive" /> {session?.timeArchived == null ? "archive" : "unarchive"}
          </button>
          {popout && compact && <WindowControls />}
        </div>
        {diff && (
          <div style={{ padding: "6px 20px", borderBottom: "1px solid var(--border)" }}>
            <DiffFiles diff={diff} onClose={() => setDiff(null)} />
          </div>
        )}
        {showStats && (
          <SessionStatsCard stats={stats} onClose={() => setShowStats(false)} />
        )}
        {showFiles && (
          <FileBrowser
            directory={session?.directory ?? ""}
            onClose={() => setShowFiles(false)}
          />
        )}
        <ErrorBoundary label="Terminal error">
          <Suspense fallback={<div className="empty">loading terminal…</div>}>
            <TerminalPane sessionId={id} directory={session?.directory} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  async function loadDiff() {
    const raw: any = await api.diff(id, session?.directory).catch(() => null);
    // opencode returns an array of { file, patch, additions, deletions };
    // tolerate the older { files: [...] } shape too.
    let files: string[] = Array.isArray(raw)
      ? raw.map((x: any) => x?.file ?? x?.path ?? String(x))
      : (raw?.files ?? []);

    // Fallback: opencode's per-session diff is empty when the project isn't
    // tracked. Derive changed files from the session's edit/write/patch parts.
    if (!files.length) {
      const set = new Set<string>();
      for (const e of entries) {
        for (const p of e.parts) {
          if (p.type === "tool") {
            const name = String(p.tool ?? "").toLowerCase();
            const inp = p.state?.input ?? {};
            const fp = inp.filePath ?? inp.file_path ?? inp.path ?? inp.filename;
            if (fp && /edit|write|patch|multiedit|create/.test(name)) set.add(String(fp));
          }
          if (p.type === "patch" && Array.isArray(p.files)) {
            for (const f of p.files) set.add(String(f));
          }
        }
      }
      files = [...set];
    }
    setDiff({ files });
  }

  return (
    <div className="chat">
      <div className={"chat-head" + (popout && compact ? " popout-header" : "")}>
        {!popout && (
          <button className="btn ghost sm" onClick={() => store.set({ activeSessionId: null })} title="Back to list">
            <Icon name="back" />
          </button>
        )}
        {editing ? (
          <input
            className="rename-input"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (title && title !== session?.title) renameSession(id, title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <div
            className="chat-title"
            onClick={() => {
              if (!popout) setEditing(true);
            }}
            title={popout ? "Drag to move" : "Click to rename"}
          >
            {session?.title || "(untitled)"}
          </div>
        )}
        <span className="badge">{session?.directory}</span>
        {stats && stats.totals.total > 0 && (
          <span className="badge" title="tokens · cost">
            {fmtTokens(stats.totals.total)} tok · {fmtCost(stats.totals.cost)}
          </span>
        )}
        {live && (
          <span className="badge running">
            {status?.type === "retry" ? `retry ${status.attempt}` : "working"}
          </span>
        )}
        <div className={"spacer" + (popout && compact ? " drag-region" : "")} />
        {!popout && (
          <button
            className="btn ghost sm"
            onClick={() => openSessionWindow(id)}
            title="Open in new window"
          >
            <Icon name="external" />
          </button>
        )}
        {live && (
          <button
            className="btn danger sm"
            onClick={() => setStopPrompt(true)}
            title="Stop the running turn (Esc)"
          >
            <Icon name="stop" /> stop
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setShowFiles(true)} title="Files">
          <Icon name="folder" /> files
        </button>
        <button className="btn ghost sm" onClick={() => setShowStats(true)} title="Session statistics">
          <Icon name="stats" /> stats
        </button>
        <button
          className={"btn ghost sm" + (findOpen ? " active" : "")}
          onClick={() => {
            setFindOpen((o) => !o);
            requestAnimationFrame(() => findInputRef.current?.focus());
          }}
          title="Find in this session (Ctrl+F)"
        >
          <Icon name="search" /> find
        </button>
        <button
          className="btn ghost sm"
          onClick={openTerminal}
          title="Open a shell terminal in this session's directory"
        >
          <Icon name="terminal" /> terminal
        </button>
        <button
          className="btn ghost sm"
          onClick={() => openBtw()}
          title="BTW side questions and saved answers"
        >
          <Icon name="chat" /> btw
        </button>
        <button className="btn ghost sm" onClick={loadDiff} title="Show changed files">
          <Icon name="code" /> diff
        </button>
        <button
          className="btn ghost sm"
          onClick={() => togglePin(session!)}
          title={session?.pinned ? "Unpin session" : "Pin session"}
        >
          <Icon name={session?.pinned ? "pin" : "pinOff"} />
        </button>
        <button
          className="btn ghost sm"
          onClick={() => archiveSession(id, session?.timeArchived == null)}
          title={session?.timeArchived == null ? "Archive session" : "Unarchive session"}
        >
          <Icon name="archive" /> {session?.timeArchived == null ? "archive" : "unarchive"}
        </button>
        {popout && compact && <WindowControls />}
      </div>

      {runningTools.length > 0 && (
        <div className="running-bar">
          <span className="running-dot" />
          <span className="small">
            <b>{runningTools.length}</b> running
          </span>
          {runningTools.map((t) => (
            <span className="run-chip" key={t.id} title={t.detail || t.name}>
              <span className="run-name">{t.name}</span>
              {t.detail && <span className="run-detail">{t.detail}</span>}
            </span>
          ))}
          <div className="spacer" />
          <span className="small muted">Esc to stop</span>
          <button className="btn danger sm" onClick={() => setStopPrompt(true)}>
            <Icon name="stop" /> Stop
          </button>
        </div>
      )}

      {findOpen && (
        <div className="find-bar">
          <input
            ref={findInputRef}
            className="input find-input"
            placeholder="Find in this session…"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                gotoMatch(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape") {
                setFindOpen(false);
                setFind("");
              }
            }}
          />
          <span className="small muted">
            {find.trim() ? `${findMatches.length ? findPos + 1 : 0}/${findMatches.length}` : ""}
          </span>
          <button
            className="btn ghost sm"
            onClick={() => gotoMatch(-1)}
            disabled={!findMatches.length}
            title="Previous match (Shift+Enter)"
          >
            <Icon name="up" />
          </button>
          <button
            className="btn ghost sm"
            onClick={() => gotoMatch(1)}
            disabled={!findMatches.length}
            title="Next match (Enter)"
          >
            <Icon name="down" />
          </button>
          <button
            className="btn ghost sm"
            onClick={() => {
              setFindOpen(false);
              setFind("");
            }}
            title="Close finder (Esc)"
          >
            <Icon name="close" />
          </button>
        </div>
      )}

      {showStats && <SessionStatsCard stats={stats} onClose={() => setShowStats(false)} />}
      {showFiles && (
        <FileBrowser directory={session?.directory ?? ""} onClose={() => setShowFiles(false)} />
      )}
      {showBtw && (
        <BtwPanel
          sessionId={id}
          request={btwRequest}
          onClose={() => setShowBtw(false)}
        />
      )}

      {(todos.length > 0 || diff || perms.length > 0 || (stats && stats.models.length > 0)) && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
          {stats && stats.models.length > 0 && (
            <div className="small muted" style={{ marginBottom: diff || todos.length ? 6 : 0 }}>
              {stats.models.map((m) => (
                <span key={m.providerID + m.modelID} style={{ marginRight: 14 }}>
                  <b>{m.modelID}</b>: {fmtTokens(m.input)} in / {fmtTokens(m.output)} out /{" "}
                  {fmtTokens(m.reasoning)} think · {fmtCost(m.cost)}
                </span>
              ))}
            </div>
          )}
          {diff && <DiffFiles diff={diff} onClose={() => setDiff(null)} />}
          {todos.length > 0 && (
            <div className="small" style={{ marginTop: diff ? 6 : 0 }}>
              {todos.map((t) => (
                <div key={t.id}>
                  <Icon
                    name={
                      t.status === "completed"
                        ? "check"
                        : t.status === "in_progress"
                          ? "half"
                          : t.status === "cancelled"
                            ? "cross"
                            : "circle"
                    }
                    size={13}
                  />{" "}
                  {t.content}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="chat-body"
        ref={bodyRef}
        onWheel={(e) => {
          // Explicit upward wheel = reading history; stop following at once.
          if (e.deltaY < 0) pauseFollow();
        }}
        onScroll={() => {
          const el = bodyRef.current;
          if (!el) return;
          const top = el.scrollTop;
          const remaining = el.scrollHeight - top - el.clientHeight;
          const nearBottom = remaining < 120;
          const atBottom = remaining < 8;

          // Any upward movement means the user is reading history. Do this
          // immediately (not after an ignore window) so streaming output cannot
          // keep pulling the viewport back down.
          if (top < lastScrollTop.current - 2) pauseFollow();
          lastScrollTop.current = top;

          if (top < 120 && windowStart > 0) loadEarlier();

          if (!nearBottom) {
            stickToBottom.current = false;
            return;
          }

          if (userPaused.current) {
            // Only a deliberate scroll all the way back down (or the "latest"
            // button) re-enables following.
            if (atBottom) resumeFollow();
            return;
          }

          const wasSticking = stickToBottom.current;
          stickToBottom.current = true;
          if (!wasSticking && liveRef.current) {
            if (entries.length > windowStart + VISIBLE) {
              setWindowStart(Math.max(0, entries.length - VISIBLE));
            }
            scrollToBottom();
          }
        }}
      >
        <div className="chat-inner" ref={innerRef}>
        {entries.length === 0 && <div className="empty">No messages yet — say hello below.</div>}
        {windowStart > 0 && (
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <button className="btn ghost sm" onClick={loadEarlier}>
              <Icon name="up" /> Load earlier messages ({windowStart} hidden)
            </button>
          </div>
        )}
        {entries.slice(windowStart, windowStart + VISIBLE).map((e, i) => {
          const index = windowStart + i;
          const hit = findSet.has(index);
          return (
            <MessageRow
              key={e.info?.id ?? index}
              entry={e}
              index={index}
              query={find}
              hit={hit}
              active={hit && index === findMatches[findPos]}
              thinkingOpen={thinkingOpen}
              shellOutputOpen={shellOutputOpen}
            />
          );
        })}

        {questions.map((q) => (
          <QuestionPrompt key={q.id} req={q} />
        ))}

        {perms.map((perm) => (
          <div className="permission" key={perm.id}>
            <div className="p-title">
              Permission required: <b>{perm.permission}</b>
            </div>
            <div className="small muted">
              {(perm.patterns ?? []).join(", ")}
              {perm.metadata?.command ? ` · ${perm.metadata.command}` : ""}
            </div>
            <div className="actions">
              <button className="btn primary sm" onClick={() => replyPermissionSafe(perm, "once")}>
                Allow once
              </button>
              <button className="btn sm" onClick={() => replyPermissionSafe(perm, "always")}>
                Allow always
              </button>
              <button className="btn danger sm" onClick={() => replyPermissionSafe(perm, "reject")}>
                Deny
              </button>
            </div>
          </div>
        ))}
        </div>
      </div>

      {newestHidden > 0 && (
        <button className="jump-latest" onClick={jumpToLatest}>
          <Icon name="down" /> {newestHidden} new message{newestHidden === 1 ? "" : "s"}
        </button>
      )}

      {(visibleSubs.length > 0 || terminals.length > 0) && (
        <div className="subagent-dock">
          {terminals.map((terminal) => (
            <TerminalWindow
              key={terminal.id}
              directory={session?.directory ?? ""}
              mode={terminal.mode}
              onMode={(mode) =>
                setTerminals((prev) =>
                  prev.map((item) =>
                    item.id === terminal.id ? { ...item, mode } : item,
                  ),
                )
              }
              onClose={() =>
                setTerminals((prev) => prev.filter((item) => item.id !== terminal.id))
              }
            />
          ))}
          {visibleSubs.map((child) => {
            const meta = subMeta(child.id);
            const mode = subModes[child.id] ?? "normal";
            return (
              <SubagentPanel
                key={child.id}
                agent={meta.agent}
                busy={meta.busy}
                activity={meta.activity}
                entries={s.entries[child.id] ?? []}
                shellOutputOpen={shellOutputOpen}
                mode={mode}
                onMode={(m) => setSubModes((prev) => ({ ...prev, [child.id]: m }))}
                onClose={() =>
                  setDismissedSubs((prev) => new Set(prev).add(child.id))
                }
              />
            );
          })}
        </div>
      )}

      {confirmStop && (
        <div className="overlay" onClick={() => setStopPrompt(false)}>
          <div
            className="overlay-box"
            style={{ width: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overlay-title">Stop the running turn?</div>
            <div className="small muted" style={{ margin: "10px 0 16px" }}>
              <b>{s.agent || "opencode"}</b> is still thinking
              {runningTools.length
                ? ` and running ${runningTools.length} tool${runningTools.length === 1 ? "" : "s"}`
                : ""}
              . Interrupting stops the model response; programs a tool already
              started may keep running.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn sm" onClick={() => setStopPrompt(false)}>
                Keep running
              </button>
              <button
                className="btn danger sm"
                onClick={() => {
                  setStopPrompt(false);
                  abortSession(id);
                }}
              >
                Stop now
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Press <b>Esc</b> again to confirm.
            </div>
          </div>
        </div>
      )}

      <Composer sessionId={id} onBtw={openBtw} />
    </div>
  );
}

/**
 * Drag a floating window by its header. The transform is relative to the
 * window's original dock slot, so windows keep their default stacking until
 * moved. At least a small strip stays on screen.
 */
function useWindowDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    rect: DOMRect;
  } | null>(null);
  const moved = useRef(false);
  const suppressClick = useRef(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const win = e.currentTarget.closest(".subagent") as HTMLElement | null;
    if (!win) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      rect: win.getBoundingClientRect(),
    };
    moved.current = false;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    // Keep at least a header-sized strip of the window on screen.
    const minX = 80 - d.rect.right;
    const maxX = window.innerWidth - 80 - d.rect.left;
    // Keep the drag handle itself on screen vertically; the body may extend
    // below the viewport, but the window can always be dragged back.
    const minY = 8 - d.rect.top;
    const maxY = window.innerHeight - 44 - d.rect.top;
    const clamp = (value: number, lo: number, hi: number) =>
      Math.min(Math.max(value, Math.min(lo, hi)), Math.max(lo, hi));
    setOffset({
      x: d.baseX + clamp(dx, minX, maxX),
      y: d.baseY + clamp(dy, minY, maxY),
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
    if (moved.current) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }

  function onHeadClick(restore: () => void) {
    if (suppressClick.current) return;
    restore();
  }

  return {
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` } as CSSProperties,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    onHeadClick,
  };
}

/** Floating window for a subagent (child session) spawned by this session. */
function SubagentPanel({
  agent,
  busy,
  activity,
  entries,
  shellOutputOpen,
  mode,
  onMode,
  onClose,
}: {
  agent: string;
  busy: boolean;
  activity: string;
  entries: MessageEntry[];
  shellOutputOpen: boolean;
  mode: "min" | "normal" | "max";
  onMode: (mode: "min" | "normal" | "max") => void;
  onClose: () => void;
}) {
  const accent = agentAccent(agent);
  const drag = useWindowDrag();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastLen = useMemo(
    () => entries.reduce((n, e) => n + e.parts.length + JSON.stringify(e.info).length, 0),
    [entries],
  );

  useEffect(() => {
    if (!stick.current) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastLen, mode]);

  const style = {
    "--msg-accent": accent.accent,
    "--msg-border": accent.border,
  } as CSSProperties;

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div className={`subagent ${mode}`} style={{ ...style, ...drag.style }}>
      <div
        className="subagent-head"
        {...drag.handlers}
        onClick={() => drag.onHeadClick(() => mode === "min" && onMode("normal"))}
        title={mode === "min" ? "Click to restore · drag to move" : "Drag to move"}
      >
        <span className="sub-dot" data-busy={busy ? "true" : "false"} />
        <span className="sub-name">{agent}</span>
        <span className="sub-activity">{activity}</span>
        <div className="spacer" />
        {mode !== "max" && (
          <button onClick={(e) => (stop(e), onMode("max"))} title="Maximize">
            <Icon name="windowMax" />
          </button>
        )}
        {mode !== "normal" && (
          <button onClick={(e) => (stop(e), onMode("normal"))} title="Restore">
            <Icon name="windowRestore" />
          </button>
        )}
        {mode !== "min" && (
          <button onClick={(e) => (stop(e), onMode("min"))} title="Minimize">
            <Icon name="windowMin" />
          </button>
        )}
        <button onClick={(e) => (stop(e), onClose())} title="Close">
          <Icon name="windowClose" />
        </button>
      </div>
      {mode !== "min" && (
        <div
          className="subagent-body"
          ref={bodyRef}
          onScroll={() => {
            const el = bodyRef.current;
            if (!el) return;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {entries.length === 0 && <div className="small muted">waiting for output…</div>}
          {entries.slice(-30).map((entry) => (
            <div className="sub-msg" key={entry.info?.id}>
              <div className="sub-role">
                {entry.info?.role === "user"
                  ? "prompt"
                  : (entry.info?.agentID ?? "assistant")}
                {entry.info?.role !== "user" && entry.info?.modelID && (
                  <span
                    className="sub-model"
                    title={
                      [entry.info.providerID, entry.info.modelID].filter(Boolean).join("/") +
                      (entry.info.variant ? ` · variant: ${entry.info.variant}` : "")
                    }
                  >
                    {entry.info.modelID}
                    {entry.info.variant ? ` · ${entry.info.variant}` : ""}
                  </span>
                )}
              </div>
              {entry.parts.map((part) =>
                part.type === "text" || part.type === "reasoning" || part.type === "tool" ? (
                  <PartView
                    key={part.id}
                    part={part}
                    thinkingOpen={false}
                    shellOutputOpen={shellOutputOpen}
                    messageTime={entry.info?.time?.created}
                  />
                ) : null,
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small shell terminal that lives in the floating session dock. */
function TerminalWindow({
  directory,
  mode,
  onMode,
  onClose,
}: {
  directory: string;
  mode: "min" | "normal" | "max";
  onMode: (mode: "min" | "normal" | "max") => void;
  onClose: () => void;
}) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const drag = useWindowDrag();
  const folder =
    directory.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() || "shell";
  const style = {
    "--msg-accent": "var(--accent)",
    "--msg-border": "var(--border)",
  } as CSSProperties;

  return (
    <div className={`subagent terminal-win ${mode}`} style={{ ...style, ...drag.style }}>
      <div
        className="subagent-head"
        {...drag.handlers}
        onClick={() => drag.onHeadClick(() => mode === "min" && onMode("normal"))}
        title={mode === "min" ? "Click to restore · drag to move" : `${directory} · drag to move`}
      >
        <Icon name="terminal" size={13} />
        <span className="sub-name">terminal</span>
        <span className="sub-activity">{folder}</span>
        <div className="spacer" />
        {mode !== "max" && (
          <button onClick={(e) => (stop(e), onMode("max"))} title="Maximize">
            <Icon name="windowMax" />
          </button>
        )}
        {mode !== "normal" && (
          <button onClick={(e) => (stop(e), onMode("normal"))} title="Restore">
            <Icon name="windowRestore" />
          </button>
        )}
        {mode !== "min" && (
          <button onClick={(e) => (stop(e), onMode("min"))} title="Minimize">
            <Icon name="windowMin" />
          </button>
        )}
        <button onClick={(e) => (stop(e), onClose())} title="Close">
          <Icon name="windowClose" />
        </button>
      </div>
      <div className="terminal-window-body">
        <ErrorBoundary label="Terminal error">
          <Suspense fallback={<div className="empty">loading terminal…</div>}>
            <TerminalPane directory={directory} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function QuestionPrompt({ req }: { req: QuestionRequest }) {
  const [sel, setSel] = useState<string[][]>(req.questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(req.questions.map(() => ""));
  const [busy, setBusy] = useState(false);

  const toggle = (qi: number, label: string, multiple: boolean) => {
    setSel((prev) => {
      const next = prev.map((a) => a.slice());
      const cur = next[qi]!;
      if (multiple) {
        const i = cur.indexOf(label);
        if (i >= 0) cur.splice(i, 1);
        else cur.push(label);
      } else {
        next[qi] = cur[0] === label ? [] : [label];
      }
      return next;
    });
  };

  const submit = async () => {
    const answers = req.questions.map((q, i) => {
      const a = sel[i]!.slice();
      const c = custom[i]?.trim();
      if (c && q.custom !== false) a.push(c);
      return a;
    });
    if (answers.some((a) => a.length === 0)) {
      toast("Please answer all questions");
      return;
    }
    setBusy(true);
    try {
      await answerQuestion(req, answers);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="question">
      {req.questions.map((q, i) => (
        <div key={i} className="question-item">
          <div className="q-header">{q.header}</div>
          <div className="q-text">{q.question}</div>
          <div className="q-options">
            {q.options.map((opt) => {
              const active = sel[i]!.includes(opt.label);
              return (
                <div
                  key={opt.label}
                  className={"q-option" + (active ? " active" : "")}
                  onClick={() => toggle(i, opt.label, !!q.multiple)}
                >
                  <span className="q-mark">
                    <Icon
                      name={
                        q.multiple
                          ? active
                            ? "checked"
                            : "unchecked"
                          : active
                            ? "radioOn"
                            : "radioOff"
                      }
                      size={15}
                    />
                  </span>
                  <div>
                    <div className="q-label">{opt.label}</div>
                    {opt.description && <div className="small muted">{opt.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {q.custom !== false && (
            <input
              className="input q-custom"
              placeholder="Type a custom answer…"
              value={custom[i]}
              onChange={(e) =>
                setCustom((prev) => {
                  const n = prev.slice();
                  n[i] = e.target.value;
                  return n;
                })
              }
            />
          )}
        </div>
      ))}
      <div className="actions">
        <button className="btn primary sm" disabled={busy} onClick={submit}>
          Submit
        </button>
        <button className="btn danger sm" disabled={busy} onClick={() => rejectQuestionSafe(req)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

async function forkAt(sessionId: string, messageID: string) {
  try {
    const created = await api.forkSession(sessionId, messageID);
    if (created?.id) {
      await refreshSessions();
      await openSession(created.id);
      toast("Forked to a new session");
    }
  } catch (e) {
    toast(`Fork failed: ${e}`);
  }
}

const MessageRow = memo(function MessageRow({
  entry,
  index,
  query,
  hit,
  active,
  thinkingOpen,
  shellOutputOpen,
}: {
  entry: MessageEntry;
  index: number;
  query?: string;
  hit?: boolean;
  active?: boolean;
  thinkingOpen?: boolean;
  shellOutputOpen?: boolean;
}) {
  const role = entry.info?.role ?? "assistant";
  const agentName = entry.info?.agentID ?? entry.info?.agent ?? "build";
  const accent = agentAccent(agentName);
  const accentStyle =
    role === "assistant"
      ? ({
          "--msg-accent": accent.accent,
          "--msg-soft": accent.soft,
          "--msg-border": accent.border,
        } as CSSProperties)
      : undefined;
  return (
    <div
      className={"msg " + role + (hit ? " find-hit" : "") + (active ? " find-active" : "")}
      data-entry-index={index}
      style={accentStyle}
    >
      <div className="msg-head">
        <div className="msg-role">
          {role === "user"
            ? "You"
            : role === "assistant"
              ? `opencode · ${agentName}`
              : role}
        </div>
        {role === "assistant" && entry.info?.modelID && (
          <span
            className="msg-model"
            title={
              [entry.info.providerID, entry.info.modelID].filter(Boolean).join("/") +
              (entry.info.variant ? ` · variant: ${entry.info.variant}` : "")
            }
          >
            via {entry.info.modelID}
            {entry.info.variant ? ` · ${entry.info.variant}` : ""}
          </span>
        )}
        {entry.info?.time?.created ? (
          <span
            className="msg-time"
            title={
              fmtFull(entry.info.time.created) +
              (entry.info.time.completed ? ` → ${fmtFull(entry.info.time.completed)}` : "")
            }
          >
            {fmtTime(entry.info.time.created)}
          </span>
        ) : null}
        {entry.info?.sessionID && entry.info?.id && (
          <button
            className="btn ghost sm fork-btn"
            title="Fork a new session from this message"
            onClick={() => forkAt(entry.info.sessionID, entry.info.id)}
          >
            Fork here
          </button>
        )}
      </div>
      {role === "user" ? (
        <div className="bubble">
          {entry.parts
            .filter((p) => p.type === "text" || p.type === "file")
            .map((p) =>
              p.type === "file" ? (
                <span className="user-file" key={p.id} title={p.url}>
                  <Icon name="attach" size={14} /> {p.filename ?? p.url ?? "file"}
                </span>
              ) : (
                <div key={p.id}>
                  <Highlight text={p.text ?? ""} query={query} />
                </div>
              ),
            )}
        </div>
      ) : (
        entry.parts.map((p) => (
          <PartView
            key={p.id}
            part={p}
            query={query}
            thinkingOpen={thinkingOpen}
            shellOutputOpen={shellOutputOpen}
            messageTime={entry.info?.time?.created}
          />
        ))
      )}
      {entry.info?.error && (
        <div className="permission">
          <div className="p-title">Error</div>
          <div className="small">{entry.info.error?.data?.message ?? entry.info.error?.name}</div>
        </div>
      )}
    </div>
  );
});

function DiffFiles({ diff, onClose }: { diff: { files: string[] }; onClose: () => void }) {
  return (
    <div className="small">
      <b>Changed files{diff.files.length ? ` (${diff.files.length})` : ""}:</b>{" "}
      <button className="btn ghost sm" onClick={onClose}>
        hide
      </button>
      <div className="diff-files-list">
        {diff.files.length ? (
          diff.files.map((f) => <div key={f}>{f}</div>)
        ) : (
          <span className="muted">none recorded for this session</span>
        )}
      </div>
    </div>
  );
}

function SessionStatsCard({
  stats,
  onClose,
}: {
  stats: SessionStats | null;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title">Session statistics</div>
        {!stats ? (
          <div className="muted small">loading…</div>
        ) : (
          <>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="stat-card">
                <div className="stat-value">{fmtTokens(stats.totals.total)}</div>
                <div className="stat-label">Tokens</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmtCost(stats.totals.cost)}</div>
                <div className="stat-label">Cost</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.userMessages}</div>
                <div className="stat-label">User messages</div>
              </div>
            </div>
            <table className="markdown" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Model</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Think</th>
                  <th>Total</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.models.map((m) => (
                  <tr key={m.providerID + m.modelID}>
                    <td style={{ textAlign: "left" }}>
                      {m.providerID}/{m.modelID}
                    </td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.input)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.output)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.reasoning)}</td>
                    <td style={{ textAlign: "center" }}>{fmtTokens(m.total)}</td>
                    <td style={{ textAlign: "center" }}>{fmtCost(m.cost)}</td>
                  </tr>
                ))}
                {stats.models.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted small">
                      no usage yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
        <div className="overlay-foot">
          <button className="btn sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSession() {
  const s = useStore();
  const [directory, setDirectory] = useState(s.directories[0] ?? "/home/ubuntu/opencode");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!directory.trim()) return;
    setCreating(true);
    try {
      await createSession(directory.trim(), title.trim() || undefined);
    } catch (e) {
      alert(`Could not create session: ${e}`);
      setCreating(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="btn ghost sm" onClick={() => store.set({ activeSessionId: null })}>
          <Icon name="back" />
        </button>
        <div className="chat-title">New session</div>
      </div>
      <div className="chat-body" style={{ maxWidth: 640 }}>
        <label className="small muted">Working directory</label>
        <input
          className="input"
          style={{ width: "100%", margin: "6px 0 14px" }}
          list="dirs"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
        />
        <datalist id="dirs">
          {s.directories.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <label className="small muted">Title (optional)</label>
        <input
          className="input"
          style={{ width: "100%", margin: "6px 0 14px" }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button className="btn primary" disabled={creating} onClick={create}>
          {creating ? "Creating…" : "Create session"}
        </button>
      </div>
    </div>
  );
}
