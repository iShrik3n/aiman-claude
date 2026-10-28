import { useEffect, useState, type ReactNode } from "react";
import Icon from "./Icon";
import { useStore } from "./store";

type WindowState = { maximized: boolean; focused: boolean };

function useDesktopWindow() {
  const api = typeof window !== "undefined" ? window.aimanDesktop : undefined;
  const { theme } = useStore();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    return api.onState((state) => setMaximized(state.maximized));
  }, [api]);

  return { api, theme, maximized };
}

/** Minimize / maximize / close controls for a frameless window. */
export function WindowControls() {
  const { api, theme, maximized } = useDesktopWindow();
  if (!api) return null;

  const retro = theme.startsWith("winxp") || theme.startsWith("win98");
  const dark98 = theme === "win98-dark";
  const buttonClass = retro ? "caption-btn" : "win-btn";

  const buttons = (
    <>
      <button
        type="button"
        className={buttonClass}
        title="Minimize"
        aria-label="Minimize"
        onClick={(event) => {
          event.stopPropagation();
          api.minimize();
        }}
      >
        <Icon name="windowMin" size={11} />
      </button>
      <button
        type="button"
        className={buttonClass}
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={(event) => {
          event.stopPropagation();
          api.toggleMaximize();
        }}
      >
        <Icon name={maximized ? "windowRestore" : "windowMax"} size={11} />
      </button>
      <button
        type="button"
        className={`${buttonClass} close`}
        title="Close"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation();
          api.close();
        }}
      >
        <Icon name="windowClose" size={11} />
      </button>
    </>
  );

  if (retro) {
    return (
      <div
        className={`title-bar-controls${dark98 ? " dark-controls" : ""} header-window-controls`}
        aria-label="Window controls"
      >
        {buttons}
      </div>
    );
  }
  return (
    <div className="win-controls header-window-controls" aria-label="Window controls">
      {buttons}
    </div>
  );
}

/**
 * The titlebar for the frameless Electron shell.
 *
 * XP.css and 98.css ship complete title-bar components. Let those libraries
 * own the caption chrome instead of re-drawing Luna/98 by hand. The modern
 * skins keep the compact custom strip.
 *
 * In a normal browser there is no preload bridge, so this renders nothing.
 */
export default function DesktopTitlebar({
  compact = false,
  nav,
  title,
}: {
  compact?: boolean;
  nav?: ReactNode;
  title?: string;
}) {
  const { api, theme } = useDesktopWindow();
  if (!api) return null;

  const retro = theme.startsWith("winxp") || theme.startsWith("win98");
  const caption = title?.trim() || "AiMAN";
  const sub = title?.trim() ? "session window" : "session manager";

  if (retro) {
    return (
      <div
        className={
          "title-bar retro-titlebar" +
          (compact ? " compact" : "") +
          (title ? " session-titlebar" : "")
        }
        onDoubleClick={() => api.toggleMaximize()}
        title="Drag to move · double-click to maximize"
      >
        <span className="title-bar-text retro-caption">
          <span className="retro-app-icon" aria-hidden="true" />
          {caption}
        </span>
        {nav ? <div className="titlebar-nav-slot">{nav}</div> : null}
        <WindowControls />
      </div>
    );
  }

  return (
    <div
      className={
        "desktop-titlebar" +
        (compact ? " compact" : "") +
        (title ? " session-titlebar" : "")
      }
      onDoubleClick={() => api.toggleMaximize()}
      title="Drag to move · double-click to maximize"
    >
      <span className="dtb-orb" aria-hidden="true" />
      <span className="dtb-name">{caption}</span>
      <span className="dtb-sub">{sub}</span>
      {/* When compact navigation is present it already contains the flexible
          spacer. Adding another spacer here split the leftover width and left
          the profile/live/user/logout group floating left of the window
          controls — especially obvious at full screen. */}
      {nav ? <div className="titlebar-nav-slot">{nav}</div> : <span className="spacer" />}
      <WindowControls />
    </div>
  );
}
