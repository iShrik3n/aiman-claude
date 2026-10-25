import Icon, { type IconName } from "./Icon";
import {
  activateProfile,
  logout,
  store,
  useStore,
  type View,
} from "./store";

type NavItem = {
  view: View;
  label: string;
  icon: IconName;
  admin?: boolean;
};

const NAV: NavItem[] = [
  { view: "chat", label: "Sessions", icon: "chat" },
  { view: "search", label: "Search", icon: "search" },
  { view: "stats", label: "Stats", icon: "stats" },
  { view: "terminal", label: "Terminal", icon: "terminal" },
  { view: "settings", label: "Settings", icon: "settings" },
  { view: "users", label: "Users", icon: "user", admin: true },
  { view: "extensions", label: "Extensions", icon: "config", admin: true },
  { view: "profiles", label: "Profiles", icon: "user" },
];

/** The main view switcher. `compact` is used inside the desktop title bar. */
export function AppTabs({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const isAdmin = !!s.auth.user?.is_admin;
  return (
    <div className={"tabs" + (compact ? " compact-tabs" : "")}>
      {NAV.filter((item) => !item.admin || isAdmin).map((item) => (
        <button
          key={item.view}
          type="button"
          className={"tab" + (s.view === item.view ? " active" : "")}
          onClick={() => store.set({ view: item.view })}
          title={item.label}
        >
          <Icon name={item.icon} />
          <span className="tab-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Profile switcher, live status, signed-in user, logout. */
export function AppActions({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  return (
    <>
      {s.profiles.length > 0 && (
        <select
          className={"input" + (compact ? " compact-profile" : "")}
          title="Switch config profile"
          value={s.activeProfile ?? ""}
          onChange={(e) => activateProfile(e.target.value)}
        >
          {!s.activeProfile && <option value="">profile…</option>}
          {s.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <span className="small muted live-status" title={s.connected ? "Live event stream connected" : "Disconnected"}>
        <span className={"dot " + (s.connected ? "up" : "down")} />{" "}
        <span className="live-label">{s.connected ? "live" : "disconnected"}</span>
      </span>
      <span className="small muted user-name">{s.auth.user?.username}</span>
      <button
        type="button"
        className={"btn ghost sm" + (compact ? " titlebar-logout" : "")}
        onClick={() => logout()}
        title="Log out"
      >
        <Icon name="lock" />
        <span className="tab-label">Log out</span>
      </button>
    </>
  );
}

/** The normal (non-compact) app toolbar. */
export function AppTopbar() {
  return (
    <div className="topbar">
      <div className="brand">
        Ai<span>MAN</span>
      </div>
      <AppTabs />
      <div className="spacer" />
      <AppActions />
    </div>
  );
}

/** Toolbar contents rendered inside the desktop title bar in compact mode. */
export function CompactTitlebarNav() {
  return (
    <div className="titlebar-nav">
      <AppTabs compact />
      <div className="spacer" />
      <AppActions compact />
    </div>
  );
}
