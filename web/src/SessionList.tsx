import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  archiveSession,
  filterSessions,
  moveToFolder,
  openSession,
  openSessionWindow,
  store,
  togglePin,
  useStore,
} from "./store";
import type { Session } from "./api";
import { fmtCost, fmtTokens } from "./StatsView";
import CodeMap from "./CodeMap";
import ErrorBoundary from "./ErrorBoundary";

function timeAgo(ms: number) {
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function SessionList() {
  const s = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Only root sessions are top-level rows; child sessions (subagents) nest
  // beneath their parent. When searching, keep the matched session's ancestors
  // so a hit inside a subagent is still reachable.
  const rows = useMemo(() => {
    const base = filterSessions(s.sessions, s.filters);
    if (!s.filters.q) return base;
    const byId = new Map(s.sessions.map((x) => [x.id, x]));
    const keep = new Set(base.map((x) => x.id));
    for (const row of base) {
      let parent = row.parentId;
      let guard = 0;
      while (parent && guard++ < 20) {
        keep.add(parent);
        parent = byId.get(parent)?.parentId ?? null;
      }
    }
    return s.sessions.filter((x) => keep.has(x.id));
  }, [s.sessions, s.filters]);

  const byParent = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const row of rows) {
      if (!row.parentId) continue;
      const list = map.get(row.parentId) ?? [];
      list.push(row);
      map.set(row.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.timeUpdated - a.timeUpdated);
    return map;
  }, [rows]);

  const roots = useMemo(() => rows.filter((r) => !r.parentId), [rows]);
  const childCount = rows.length - roots.length;
  const scopedDirs = [...new Set(rows.map((r) => r.directory))].filter(Boolean);
  const split = !!(s.filters.folder || s.filters.directory);

  // Opening a child (or a deep-link) expands its parent chain automatically.
  useEffect(() => {
    if (!s.activeSessionId) return;
    const byId = new Map(s.sessions.map((x) => [x.id, x]));
    const parents: string[] = [];
    let current = byId.get(s.activeSessionId);
    let guard = 0;
    while (current?.parentId && guard++ < 20) {
      parents.push(current.parentId);
      current = byId.get(current.parentId);
    }
    if (!parents.length) return;
    setExpanded((prev) => {
      if (parents.every((p) => prev.has(p))) return prev;
      const next = new Set(prev);
      for (const p of parents) next.add(p);
      return next;
    });
  }, [s.activeSessionId, s.sessions]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rowActions(sess: Session, depth: number) {
    if (depth > 0) {
      return (
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn ghost sm"
            title="Open in new window"
            onClick={() => openSessionWindow(sess.id)}
          >
            ⇗
          </button>
        </div>
      );
    }
    return (
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <select
          className="input"
          value={sess.folderId ?? ""}
          onChange={(e) => moveToFolder(sess.id, e.target.value || null)}
          title="Folder"
        >
          <option value="">Unfiled</option>
          {s.folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          className="btn ghost sm"
          title="Open in new window"
          onClick={() => openSessionWindow(sess.id)}
        >
          ⇗
        </button>
        <button className="btn ghost sm" title="Pin" onClick={() => togglePin(sess)}>
          {sess.pinned ? "★" : "☆"}
        </button>
        {sess.timeArchived != null ? (
          <button className="btn sm" onClick={() => archiveSession(sess.id, false)}>
            Unarchive
          </button>
        ) : (
          <button
            className="btn ghost sm"
            title="Archive"
            onClick={() => archiveSession(sess.id, true)}
          >
            🗄
          </button>
        )}
      </div>
    );
  }

  function renderRow(sess: Session, depth: number): ReactNode {
    const status = s.statuses[sess.id];
    const busy = status && status.type !== "idle";
    const kids = byParent.get(sess.id) ?? [];
    const open = expanded.has(sess.id);

    return (
      <div key={sess.id}>
        <div
          className={
            "session-row" +
            (depth ? " sub" : "") +
            (s.activeSessionId === sess.id ? " active" : "")
          }
          style={depth ? { marginLeft: depth * 14 } : undefined}
          onClick={() => openSession(sess.id)}
        >
          <div style={{ minWidth: 0 }}>
            <div className="session-title-line">
              {kids.length > 0 ? (
                <button
                  className="session-expand"
                  title={`${kids.length} sub-session${kids.length === 1 ? "" : "s"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(sess.id);
                  }}
                >
                  {open ? "▾" : "▸"}
                </button>
              ) : (
                <span className="session-expand-spacer" />
              )}
              <div className="session-title">
                {depth > 0 ? "↳ " : ""}
                {sess.pinned ? "★ " : ""}
                {sess.title || "(untitled)"}
              </div>
              {depth > 0 && <span className="badge sub-badge">agent</span>}
              {kids.length > 0 && !open && (
                <span className="muted small sub-count">{kids.length}</span>
              )}
            </div>
            <div className="session-sub">
              <span title={sess.directory}>{sess.directory}</span>
              <span>· {timeAgo(sess.timeUpdated)}</span>
              <span>· {sess.messageCount} msgs</span>
              {sess.usage && sess.usage.total > 0 && (
                <span title="tokens · cost">
                  · {fmtTokens(sess.usage.total)} tok · {fmtCost(sess.usage.cost)}
                </span>
              )}
              {busy && (
                <span className="badge running">
                  {status.type === "retry" ? `retry ${status.attempt}` : "working"}
                </span>
              )}
              {sess.timeArchived != null && <span className="badge">archived</span>}
            </div>
          </div>
          {rowActions(sess, depth)}
        </div>
        {open && kids.map((kid) => renderRow(kid, depth + 1))}
      </div>
    );
  }

  // Streaming updates the whole store on every token. Keep the rendered list
  // stable unless something that actually affects it changed.
  const listRows = useMemo(
    () => roots.map((sess) => renderRow(sess, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roots, byParent, expanded, s.activeSessionId, s.statuses, s.folders],
  );

  const pane = (
    <div className="main">
      <div className="chat-head">
        <div className="chat-title">
          {s.filters.archived === "1"
            ? "Archived"
            : s.filters.folder
              ? (s.folders.find((f) => f.id === s.filters.folder)?.name ?? "Folder")
              : s.filters.directory
                ? s.filters.directory
                : "All sessions"}
        </div>
        <span className="muted small">
          {roots.length} sessions
          {childCount > 0 ? ` · ${childCount} agent` : ""}
        </span>
        <div className="spacer" />
        <input
          className="input"
          placeholder="Filter by title / path…"
          value={s.filters.q}
          onChange={(e) => store.set({ filters: { ...s.filters, q: e.target.value } })}
        />
        <select
          className="input"
          value={s.filters.sort}
          onChange={(e) => store.set({ filters: { ...s.filters, sort: e.target.value } })}
        >
          <option value="updated">Last updated</option>
          <option value="created">Created</option>
          <option value="messages">Most messages</option>
          <option value="tokens">Most tokens</option>
          <option value="cost">Highest cost</option>
          <option value="title">Title</option>
        </select>
      </div>

      <div className="session-list">
        {rows.length === 0 && <div className="empty">No sessions here.</div>}
        {listRows}
      </div>
    </div>
  );

  if (!split) return pane;

  return (
    <div className="split">
      <div className="split-left">{pane}</div>
      <div className="split-right">
        {scopedDirs.length ? (
          <ErrorBoundary label="Codebase visualizer error">
            <CodeMap directories={scopedDirs} />
          </ErrorBoundary>
        ) : (
          <div className="empty">No directory to visualise.</div>
        )}
      </div>
    </div>
  );
}
