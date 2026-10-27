import { useEffect } from "react";
import { applyLocation, bootstrapAuth, pathFor, store, useStore } from "./store";
import Sidebar from "./Sidebar";
import SessionList from "./SessionList";
import ChatView from "./ChatView";
import SearchView from "./SearchView";
import TerminalView from "./TerminalView";
import Users from "./Users";
import StatsView from "./StatsView";
import SettingsView from "./SettingsView";
import ExtensionsView from "./ExtensionsView";
import Workspace from "./Workspace";
import DesktopTitlebar from "./DesktopTitlebar";
import { AppTopbar, CompactTitlebarNav } from "./AppChrome";
import { XenoFooter, XenoMicrobar, XenoPodBottom, XenoPodTop } from "./XenoChrome";
import Xeno3000, { Xeno3000Popout } from "./Xeno3000";
import Overlays from "./Overlays";
import Login from "./Login";
import Onboarding from "./Onboarding";
import DeepLinkHandler from "./DeepLinkHandler";

export default function App() {
  const s = useStore();

  useEffect(() => {
    bootstrapAuth().catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = s.language;
  }, [s.language]);

  // Keep the browser URL in sync with the active view / session (handles).
  useEffect(() => {
    const onPop = () => {
      if (store.get().routeReady) applyLocation().catch(() => {});
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reflect the active session (or view) in the browser/window title.
  useEffect(() => {
    const sess = s.sessions.find((x) => x.id === s.activeSessionId);
    document.title = sess?.title ? `${sess.title} · AiMAN` : "AiMAN";
  }, [s.activeSessionId, s.sessions]);

  const popout =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("popout");

  useEffect(() => {
    if (popout || typeof location === "undefined" || !s.routeReady) return;
    const desired = pathFor(s.view, s.activeSessionId);
    if (location.pathname + location.search !== desired) {
      history.pushState(null, "", desired);
    }
  }, [s.view, s.activeSessionId, s.routeReady, popout]);

  if (s.auth.loading) {
    return (
      <div className="empty" style={{ height: "100vh" }}>
        loading…
      </div>
    );
  }

  if (!s.auth.authenticated) return <Login />;
  if (s.onboarded === false) return <Onboarding />;

  const isAdmin = !!s.auth.user?.is_admin;

  const mainContent = (
    <div className="main">
      {s.view === "chat" && (s.activeSessionId ? <ChatView /> : <SessionList />)}
      {s.view === "search" && <SearchView />}
      {s.view === "stats" && <StatsView />}
      {s.view === "terminal" && <TerminalView />}
      {s.view === "users" && isAdmin && <Users />}
      {s.view === "extensions" && isAdmin && <ExtensionsView />}
      {s.view === "extensions" && !isAdmin && (
        <div className="empty">Integrations are only available to administrators.</div>
      )}
      {s.view === "workspace" && isAdmin && <Workspace />}
      {s.view === "workspace" && !isAdmin && (
        <div className="empty">OpenCode configuration is only available to administrators.</div>
      )}
      {s.view === "settings" && <SettingsView />}
    </div>
  );

  // XP.css / 98.css draw the complete window frame around `.window`.
  const retroWindow = s.theme.startsWith("winxp") || s.theme.startsWith("win98");
  const isDesktop = typeof window !== "undefined" && !!window.aimanDesktop;
  // In a normal browser there is no custom titlebar to merge into, so compact
  // mode falls back to the regular toolbar instead of hiding navigation.
  const compact = s.compactToolbar && isDesktop;
  const windowClass = retroWindow ? " window" : "";

  if (popout && s.theme === "xeno3000") {
    return (
      <Xeno3000Popout
        main={
          <div className="main">
            {s.activeSessionId ? <ChatView popout compact={compact} /> : <SessionList />}
          </div>
        }
        overlays={
          <>
            {s.toast && <div className="toast">{s.toast}</div>}
            <Overlays />
            <DeepLinkHandler />
          </>
        }
      />
    );
  }

  // A pop-out is a single session: no sidebar, no view switcher, no app toolbar.
  if (popout) {
    const popoutSession = s.sessions.find((x) => x.id === s.activeSessionId);
    return (
      <div className={"app popout" + (compact ? " compact" : "") + windowClass}>
        {!compact && <DesktopTitlebar title={popoutSession?.title || "session"} />}
        <div className="main">
          {s.activeSessionId ? <ChatView popout compact={compact} /> : <SessionList />}
        </div>
        {s.toast && <div className="toast">{s.toast}</div>}
        <Overlays />
      </div>
    );
  }

  if (s.theme === "xeno3000" && !compact) {
    return (
      <Xeno3000
        sidebar={<Sidebar />}
        main={mainContent}
        overlays={
          <>
            {s.toast && <div className="toast">{s.toast}</div>}
            <Overlays />
            <DeepLinkHandler />
          </>
        }
      />
    );
  }

  if (s.theme === "xeno4" && !compact) {
    return (
      <div className={"app xeno-shell" + windowClass}>
        <DesktopTitlebar />
        <XenoMicrobar />
        <div className="alien-hull-chassis">
          <AppTopbar microbar={false} />
          <div className="plasma-conduit" />
          <div className="xeno-workspace-grid">
            <aside className="left-biopod xeno-left-pod">
              <XenoPodTop />
              <Sidebar />
              <XenoPodBottom />
            </aside>
            <main className="main-command-cavity">{mainContent}</main>
          </div>
          <XenoFooter />
        </div>
        {s.toast && <div className="toast">{s.toast}</div>}
        <Overlays />
        <DeepLinkHandler />
      </div>
    );
  }

  return (
    <div className={"app" + (compact ? " compact" : "") + windowClass}>
      {compact ? (
        <DesktopTitlebar compact nav={<CompactTitlebarNav />} />
      ) : (
        <DesktopTitlebar />
      )}
      {!compact && <AppTopbar />}

      <div className="layout">
        <Sidebar />
        {mainContent}
      </div>

      {s.toast && <div className="toast">{s.toast}</div>}
      <Overlays />
      <DeepLinkHandler />
    </div>
  );
}
