import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { api, type Session, type Stats } from "./api";
import { openSession, store, toast, useStore } from "./store";

type Range = "all" | "24h" | "7d" | "30d" | "3m" | "custom";

function rangeStart(range: Range): string | undefined {
  if (range === "24h") return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "3m") return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  return undefined;
}

export function fmtTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function fmtCost(n: number): string {
  if (!n) return "$0";
  if (n < 0.01) return "$" + n.toFixed(5);
  return "$" + n.toFixed(2);
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export default function StatsView() {
  const s = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(true);
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [project, setProject] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const dashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .statsFilters()
      .then((f) => {
        setUsers(f.users);
        setProfiles(f.profiles);
        setProjects(f.projects ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    const from =
      range === "custom"
        ? customFrom
          ? new Date(`${customFrom}T00:00:00`).toISOString()
          : undefined
        : rangeStart(range);
    const to =
      range === "custom" && customTo
        ? new Date(`${customTo}T23:59:59.999`).toISOString()
        : undefined;
    (async () => {
      try {
        const [st, sess] = await Promise.all([
          api.stats({
            user: userId || undefined,
            profile: profileId || undefined,
            project: project || undefined,
            from,
            to,
          }),
          api.sessions({ archived: "all" }),
        ]);
        if (!alive) return;
        setStats(st);
        store.set({ sessions: sess });
      } catch (e) {
        toast(`Failed to load stats: ${e}`);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, profileId, project, range, customFrom, customTo]);

  if (busy || !stats) return <div className="empty">loading stats…</div>;

  const t = stats.totals;
  const maxDay = Math.max(1, ...stats.days.map((d) => d.total));
  const filtered = s.sessions.filter(
    (x) =>
      (!userId || x.userId === userId) &&
      (!profileId || x.profileId === profileId) &&
      (!project || x.directory === project),
  );
  const topSessions: Session[] = [...filtered]
    .filter((x) => x.usage)
    .sort((a, b) => (b.usage?.total ?? 0) - (a.usage?.total ?? 0))
    .slice(0, 15);

  function exportCsv() {
    const rows = [
      ["provider", "model", "messages", "input", "output", "reasoning", "cache_read", "cache_write", "total", "cost"],
      ...stats!.models.map((m) => [
        m.providerID,
        m.modelID,
        m.messages,
        m.input,
        m.output,
        m.reasoning,
        m.cacheRead,
        m.cacheWrite,
        m.total,
        m.cost,
      ]),
    ];
    const text = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `aiman-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng() {
    if (!dashRef.current) return;
    try {
      const dataUrl = await toPng(dashRef.current, {
        cacheBust: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#0e1013",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `aiman-usage-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      toast(`Screenshot failed: ${e}`);
    }
  }

  return (
    <div className="search-wrap stats-page" ref={dashRef}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: "0 12px 0 0" }}>Usage statistics</h2>
        <label className="small muted">
          User
          <select
            className="input"
            style={{ marginLeft: 6 }}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted">
          Credential set
          <select
            className="input"
            style={{ marginLeft: 6 }}
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value="">All credential sets</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted">
          Project
          <select
            className="input"
            style={{ marginLeft: 6 }}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((dir) => (
              <option key={dir} value={dir}>
                {dir}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted">
          Range
          <select
            className="input"
            style={{ marginLeft: 6 }}
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
          >
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="3m">Last 3 months</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {range === "custom" && (
          <>
            <label className="small muted">
              From
              <input
                className="input"
                style={{ marginLeft: 6 }}
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="small muted">
              To
              <input
                className="input"
                style={{ marginLeft: 6 }}
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button className="btn sm" onClick={exportCsv}>
          CSV
        </button>
        <button className="btn sm" onClick={exportPng}>
          PNG
        </button>
        {(userId || profileId || project || range !== "all") && (
          <button
            className="btn ghost sm"
            onClick={() => {
              setUserId("");
              setProfileId("");
              setProject("");
              setRange("all");
              setCustomFrom("");
              setCustomTo("");
            }}
          >
            clear
          </button>
        )}
      </div>

      <div className="stat-grid">
        <Card label="Sessions" value={String(t.sessions)} sub={`${t.archived} archived`} />
        <Card label="Assistant messages" value={String(t.messages)} sub={`${t.userMessages} user`} />
        <Card
          label="Total tokens"
          value={fmtTokens(t.total)}
          sub={`${fmtTokens(t.input)} in · ${fmtTokens(t.output)} out · ${fmtTokens(t.reasoning)} think`}
        />
        <Card label="Total cost" value={fmtCost(t.cost)} sub="estimated at API list prices" />
        <Card
          label="Cache"
          value={fmtTokens(t.cacheRead + t.cacheWrite)}
          sub={`${fmtTokens(t.cacheRead)} read · ${fmtTokens(t.cacheWrite)} write`}
        />
      </div>

      <h3>By model</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Provider / model</th>
            <th>Msgs</th>
            <th>Input</th>
            <th>Output</th>
            <th>Thinking</th>
            <th>Cache</th>
            <th>Total</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {stats.models.map((m) => (
            <tr key={m.providerID + "/" + m.modelID}>
              <td style={{ textAlign: "left" }}>
                <span className="muted">{m.providerID}</span> / <b>{m.modelID}</b>
              </td>
              <td style={{ textAlign: "center" }}>{m.messages}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.input)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.output)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.reasoning)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.cacheRead + m.cacheWrite)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.total)}</td>
              <td style={{ textAlign: "center" }}>{fmtCost(m.cost)}</td>
            </tr>
          ))}
          {stats.models.length === 0 && (
            <tr>
              <td colSpan={8} className="muted small">
                no usage yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Daily activity</h3>
      <div className="bars">
        {stats.days.length === 0 && <div className="muted small">no data</div>}
        {stats.days.map((d) => (
          <div className="bar-col" key={d.day} title={`${d.day}: ${fmtTokens(d.total)} tokens, ${fmtCost(d.cost)}`}>
            <div className="bar" style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }} />
            <div className="bar-x">{d.day.slice(5)}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Top sessions by tokens</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Session</th>
            <th>Msgs</th>
            <th>Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {topSessions.map((x) => (
            <tr
              key={x.id}
              style={{ cursor: "pointer" }}
              onClick={() => openSession(x.id)}
            >
              <td style={{ textAlign: "left" }}>{x.title || "(untitled)"}</td>
              <td style={{ textAlign: "center" }}>{x.usage?.messages ?? 0}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(x.usage?.total ?? 0)}</td>
              <td style={{ textAlign: "center" }}>{fmtCost(x.usage?.cost ?? 0)}</td>
            </tr>
          ))}
          {topSessions.length === 0 && (
            <tr>
              <td colSpan={4} className="muted small">
                no sessions for this filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
