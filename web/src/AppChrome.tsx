import { Fragment } from "react";
import Icon, { type IconName } from "./Icon";
import { logout, store, t, useStore, type View } from "./store";
import { confirmDiscardWorkspace } from "./workspaceDirty";
import { XenoMicrobar, XenoVisualizer } from "./XenoChrome";

type NavItem = {
  view: View;
  label: string;
  key: string;
  icon: IconName;
  admin?: boolean;
};

const NAV: NavItem[] = [
  { view: "chat", key: "nav.sessions", label: "Sessions", icon: "chat" },
  { view: "search", key: "nav.search", label: "Search", icon: "search" },
  { view: "stats", key: "nav.stats", label: "Stats", icon: "stats" },
  { view: "terminal", key: "nav.terminal", label: "Terminal", icon: "terminal" },
  { view: "settings", key: "nav.settings", label: "Settings", icon: "settings" },
  { view: "users", key: "nav.users", label: "Users", icon: "user", admin: true },
  {
    view: "extensions",
    key: "nav.integrations",
    label: "Integrations",
    icon: "config",
    admin: true,
  },
  { view: "workspace", key: "nav.opencode", label: "OpenCode", icon: "settings", admin: true },
];

/** The main view switcher. `compact` is used inside the desktop title bar. */
export function AppTabs({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const isAdmin = !!s.auth.user?.is_admin;
  const visible = NAV.filter((item) => !item.admin || isAdmin);
  return (
    <div className={"tabs" + (compact ? " compact-tabs" : "")}>
      {visible.map((item, index) => (
        <Fragment key={item.view}>
          {item.admin && (index === 0 || !visible[index - 1]?.admin) && (
            <span className="nav-admin-sep" aria-hidden="true" />
          )}
          <button
            type="button"
            className={"tab" + (s.view === item.view ? " active" : "")}
            onClick={() => {
              if (!confirmDiscardWorkspace("Discard unsaved OpenCode changes?")) return;
              store.set({ view: item.view });
            }}
            title={t(item.key)}
          >
            {(s.theme === "xeno" || s.theme === "xeno4") && (
              <span className="xeno-led-pip" aria-hidden="true" />
            )}
            <Icon name={item.icon} />
            <span className="tab-label">{t(item.key)}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** Profile switcher, live status, signed-in user, logout. */
export function AppActions({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  return (
    <>
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
export function AppTopbar({ microbar = true }: { microbar?: boolean }) {
  const s = useStore();
  const xeno = s.theme === "xeno" || s.theme === "xeno4";
  const deck = (
    <>
      <div className="brand">
        {xeno && <span className="xeno-agent-label">XENO-AGENT</span>}
        Ai<span>MAN</span>
      </div>
      {xeno && <XenoVisualizer />}
      <AppTabs />
      <div className="spacer" />
      <AppActions />
    </>
  );
  if (!xeno) return <div className="topbar">{deck}</div>;
  return (
    <div className="topbar xeno-topbar">
      {microbar && <XenoMicrobar />}
      <div className="xeno-topbar-main">{deck}</div>
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
