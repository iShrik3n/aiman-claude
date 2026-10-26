import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "./api";

type Filter = "all" | "info" | "warn" | "error" | "debug";

export default function LogsView() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const pausedRef = useRef(paused);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const source = new EventSource("/api/logs/stream");
    source.onmessage = (event) => {
      if (pausedRef.current) return;
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        setEntries((prev) => [...prev.slice(-1199), entry]);
      } catch {}
    };
    return () => source.close();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        (filter === "all" || entry.level === filter) &&
        (!q || entry.line.toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [shown.length, autoScroll, paused]);

  return (
    <div className="ws-section">
      <div className="ws-section-head">
        <div>
          <h3>Live logs</h3>
          <p className="muted small">
            Manager and opencode diagnostics captured in memory. The newest 1,200 lines are kept.
          </p>
        </div>
        <div className="ws-actions">
          <button className="btn sm" onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="btn sm" onClick={() => setEntries([])}>
            Clear view
          </button>
        </div>
      </div>
      <div className="ws-toolbar">
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warnings</option>
          <option value="error">Errors</option>
          <option value="debug">Debug</option>
        </select>
        <input
          className="input"
          placeholder="Filter log text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="ws-check">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
        <span className="muted small">{shown.length} shown</span>
      </div>
      <div className="ws-log" ref={boxRef}>
        {shown.length === 0 && <div className="ext-empty">No log lines yet.</div>}
        {shown.map((entry) => (
          <div key={entry.id} className={"ws-log-line " + entry.level}>
            <span className="ws-log-time">{new Date(entry.at).toLocaleTimeString()}</span>
            <span className="ws-log-level">{entry.level}</span>
            <span className="ws-log-text">{entry.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
