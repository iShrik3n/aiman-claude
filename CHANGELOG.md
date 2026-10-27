# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.3] - 2026-10-27

### Added
- **K-Jöfol Xeno4 theme** — a separate source-matched cockpit skin alongside
  Alien Grotesque. It uses the full outside microbar, chrome bridge, animated
  spectrum pod, plasma conduit, biomech left pod, paper-LCD directory matrix,
  command cavity and hull footer, with bundled Orbitron / Share Tech Mono /
  VT323 typography and the four reactor palettes (Cryo-Cyan, K-Jöfol Amber,
  Xeno Bio-Green, Crimson Pod).

## [1.10.2] - 2026-10-27

### Added
- **Alien Grotesque theme** — a second alien skin built as a chrome/cyan
  spaceship console: a floating asymmetric hull, liquid-metal panels, a cyan
  glass LCD, reactor rings, hull seams, rivet-like textures, starfield
  lighting, HUD corner brackets and side vents. Navigation sits on a coherent
  console rail, while sidebar/workspace controls keep staggered organic
  positions and Fibonacci-ish radii. Textures are applied to buttons, tabs and
  chrome surfaces without reducing text contrast.
- The cockpit structure now follows the supplied K-Jöfol mock: outside microbar
  with four reactor palettes, chrome bridge with animated spectrum pod, plasma
  conduit, biomech left pod, command cavity, riveted/ribbed pod decor, speaker
  grille and hull-integrity footer.
- The sidebar directory matrix becomes an olive **paper LCD** screen, the
  bridge uses dark brushed metal with a red ignition capsule for new sessions,
  and the live spectrum pod uses the bundled Orbitron / Share Tech Mono fonts.
- Theme preview cards and all admin panels use the same no-hard-edge language,
  including inputs, toolbar strips, notices, diffs and modal shells.
- Chat surfaces use a readable blue-glass HUD grid rather than clipping
  message text behind oversized lobes; the composer and Send/Queue controls
  stay fully visible.

## [1.10.1] - 2026-10-27

### Changed
- **Consolidated provider credentials.** Live provider auth and saved API-key
  sets now live together under **OpenCode → Providers → Credentials**. The
  top-level Profiles page and the unprotected top-bar credential switcher were
  removed. Saved sets can detect drift from the live auth store and capture the
  current live API keys.
- **Clearer snapshot model.** Workspace config profiles were renamed to
  **Snapshots** and merged with file/GitHub backup into **Snapshots & backups**.
  Snapshots exclude sessions, chat history and credentials.
- **One plugin surface.** Local plugin files moved from OpenCode into
  **Integrations → Plugins**, alongside package plugins.
- **Settings tabs.** Appearance, Chat, Servers, System and About are now
  separate tabs instead of one long scroll. Live logs moved to
  **Settings → System**.
- **OpenCode navigation.** The admin configuration area is now **OpenCode** with
  a grouped sidebar instead of a long tab strip. Extensions is now
  **Integrations**.
- **Credential and server safety.** Credential-set activation now requires
  admin, shows the providers being applied/removed, and warns that OAuth is
  unchanged. Server profiles have a connection test and database-path check.
- Provider ID fields now offer a known-provider dropdown.
- Workspace forms show an **unsaved** badge and confirm before switching
  sections or configuration scope.

### Fixed
- Old `/profiles` bookmarks redirect to the OpenCode credentials area.
- `/integrations` is the canonical Integrations URL; `/extensions` remains an
  alias.

## [1.10.0] - 2026-10-26

### Added
- **Workspace** — an admin configuration cockpit for opencode: raw JSONC
  editing, providers/models, permissions, system prompt, project rules,
  LSP/formatter and v2 `cli.json`, skills, commands, agents, local plugin files,
  presets, config profiles, backup/restore, GitHub sync, provider auth and live
  logs.
- **Usage dashboard filters** — date ranges, project filtering, CSV export and
  PNG dashboard snapshots. The dashboard keeps the existing per-user,
  per-profile, per-session, cache and reasoning views.
- **Live log viewer** — captured manager logs plus the newest opencode log file,
  with level/search filters, pause and auto-scroll.
- **Deep links** — `aiman://` protocol registration in the Electron shell for
  launch/open, MCP install and skill/plugin import, guarded by a confirmation
  dialog.
- **Installable web app** — manifest, service worker, theme metadata and a skip
  link.
- **Typography controls** — choose UI and code/terminal font families, set a
  base font size, or reset to the active theme's defaults.
- **Switchable opencode server profiles** — keep multiple URLs with their own
  password, database and `auth.json`, then activate a profile and restart.
- **European translations** — navigation and workspace shell translations for
  Spanish, French, German, Italian, Portuguese, Dutch, Polish, Russian,
  Ukrainian, Romanian, Czech, Swedish, Norwegian, Danish, Finnish, Greek,
  Hungarian, Bulgarian, Croatian, Serbian, Slovak, Slovenian, Lithuanian,
  Latvian, Estonian and Turkish.

### Fixed
- MCP lists now support search/filter and a one-click enable/disable action.
- Backup files no longer recreate `cli.json` when the source file did not exist.
- Ctrl/Cmd+F in a session now scrolls to the highlighted occurrence instead of
  merely centering the containing message.

## [1.9.0] - 2026-10-26

### Fixed
- **Per-session model memory in the composer.** Opening a session now syncs the
  model selector (and reasoning variant) to the last model actually used by
  that session’s assistant messages. Sessions using an opencode free model no
  longer appear as the global/direct-API model.
- **`/btw` now uses the composer model.** The selected model and variant are
  passed with the side question, stored with its history entry, and reapplied
  after the side session’s `general` agent is selected. The history detail shows
  the exact model used. Previously `/btw` read only the session’s persisted
  model, which could differ from the model currently shown in the composer.
- Compact desktop title bars now let the navigation slot fill the remaining
  width, so profile/live/user/logout sit flush against the window controls
  instead of floating left with a growing gap when maximized.
- Page-level overflow is contained and the layout grid uses a shrinkable main
  column, preventing horizontal drift at full screen. Settings, Stats, Users and
  Profiles now keep a full-width scroll container while constraining only their
  content column, so their scrollbars sit at the page edge rather than at the
  right edge of a narrow inner column.
- PTY WebSocket connections now carry the session's location. This fixes blank
  embedded terminals on opencode v2 when the PTY was created outside the
  server's default working directory.

### Changed
- **Commissioner app font.** The Commissioner variable font is bundled locally
  (no Google Fonts request at runtime) and is now the app-wide UI typeface. Code,
  terminals and other technical surfaces keep the monospace stack.
- **DeSOTA About section.** Settings now has an About card with the DeSOTA
  wordmark and link, “by DeSOTA” branding, the installed AiMAN version, and the
  developer credit for Kristian Atanasov (`kristian@uber-dick.net`).
- **AiMAN branding.** The visible product name is now **AiMAN**. The old
  `opencode · sessions` wordmark is gone from the app, login, onboarding,
  browser title and desktop loading/error screens. Internal package, binary,
  environment-variable and database names remain `aiman` for compatibility.

### Added
- **Desktop release packaging.** Tagged releases now attach a Windows Electron
  installer and include the desktop shell, `run-desktop.bat`, and `.env.example`
  in the downloadable source archives.
- **`/btw` side questions.** Use `/btw <question>` or the session toolbar's
  **btw** button to ask a quick question without touching the main transcript.
  Recent context is snapshotted into an isolated child session; the answer is
  saved per main session in a **BTW history** overlay for later review. Side
  sessions are archived after completion and hidden from the subagent dock.
- **Deferred message queue.** A new **Queue** action (or **AltGr+Enter**)
  stores a prompt and delivers it only after the current agent task is fully
  quiescent: idle, no pending question/permission, no running shell or tool, and
  no busy subagent. The default quiet window is 10 seconds and is shown as a
  cancellable progress bar. Messages are delivered one at a time, use the
  session's model/agent at delivery time, and survive browser or server
  restarts. Settings control the Enter-key behaviour, quiet window and each
  blocker. Enter still sends immediately by default.
- **Session terminals.** The session toolbar now has a **terminal** button that
  opens a small floating shell window in the session's working directory, with
  minimize/restore/maximize/close controls like the subagent windows.
- **Movable floating windows.** Subagent and terminal windows can be dragged by
  their headers. They stay partially on-screen and keep their position while
  minimizing, restoring or maximizing.
- **Lightweight split file map (default on).** The right-side treemap no longer
  prefetches every eligible text body. A second **Safe previews** setting (also
  on by default) keeps images, PDFs and small text files visible, but only for
  cells currently on screen. Text, image and PDF limits are configurable in
  Settings; names, sizes, layout and double-click open/edit are unchanged.
  Turning the lightweight setting off restores full prefetching.
- **Reasoning-effort selector.** Models that expose opencode v2 variants get a
  second dropdown next to the model picker (`Default`, `None`, `Minimal`, `Low`,
  `Medium`, `High`, `Extra high`, `Max`). The choice is remembered per model and
  sent as `model.variant`; switching back to *Default* clears it.
- **Per-message model attribution.** Every assistant message — including
  messages in subagent panels — shows the model and effort variant that produced
  it, so mixed-model sessions are no longer ambiguous.
- **Extension manager (admin).** A new top-bar **Extensions** view manages
  opencode v2 MCP servers and plugins: add/edit/remove local and remote MCP
  servers, connect/disconnect them, browse their resources and templates, and
  add/remove/check/update plugins. Writes go to the selected opencode config
  document (global or project) and opencode hot-reloads it; a `.aiman.bak`
  rollback copy is kept next to the config file.
- **Selection-aware Ctrl+X.** Pressing Ctrl+X with selected text in the composer
  now cuts the selection instead of opening the command menu; the menu still
  opens when nothing is selected.
- **Shell output shown by default.** Completed `bash`/`shell` tool cards now open
  automatically; a new **Settings → Show shell output** switch turns this off
  (running and failed tools always stay expanded).
- **Semantic icon set.** Replaced emoji and text glyphs throughout the UI with
  [Iconoir](https://iconoir.com/) line icons. The Windows XP / 98 themes swap in
  matching bitmap-era icons from `@react95/icons`.
- **Dark Windows themes.** Added **Windows XP Dark** and **Windows 98 Dark**,
  with dark tokens for chrome, chat, terminal, code map and overlays while
  keeping each skin's bevels, fonts and classic icons.
- **Desktop shell.** A frameless Electron window with a theme-aware titlebar,
  native window controls, remembered bounds, automatic server startup, and an
  installer target (`bun run desktop:build`).
- **Alien Skeuomorphic theme.** The former *Skeuomorphic* skin is now a
  chrome-and-LCD alien theme using the saved `winamp` theme id.
- **Compact toolbar (Settings → Compact toolbar).** In the desktop shell the
  Sessions, Search, Stats, Terminal, Settings, Users, Extensions, Profiles and
  live indicators move into the themed title bar, removing the separate app
  toolbar. Pop-out session windows drop the app toolbar entirely and put only
  the minimize/maximize/close controls in their header.
- **Context-window meter.** The composer status bar shows the percentage of the
  active model's context window used, based on the latest assistant turn
  (`input + output + reasoning + cache read/write`) and the provider's
  `limit.context`. It turns amber at 70% and red at 90%.
- **Sortable, collapsible directories.** The sidebar directory list can be
  ordered by latest session, session count, or alphabetically. Collapsing it
  reveals a scrollable list of the current sessions in the sidebar; expanding
  it restores the directory list. Both the sort and collapsed state persist.
- **Nested session folders.** Aiman folders are now a tree: create subfolders
  from any folder, navigate with indented rows, collapse branches, and filter a
  folder inclusively across its subtree. Deleting a folder deletes its
  descendants while keeping the sessions.
- **One-click AI organizer.** The admin **Auto-organize** button asks opencode
  to build a folder tree from session titles, working directories, existing
  folders and short conversation snippets, then applies the plan to all unfiled
  sessions. The internal organizer session is archived, not deleted.
- **Automatic filing at message ten.** New sessions created after the organizer
  baseline are filed when they reach ten user messages. A matching directory
  rule files them immediately; otherwise opencode organizes that one session.
  Child sessions inherit their parent's folder.

### Fixed
- The command-menu shortcut no longer swallows Ctrl+X while editing a text
  selection in the chat composer or any other input.
- **`/compact` on opencode v2.** The manager now sends the required JSON body to
  `/api/session/:id/compact`; previously the proxied request had no body and
  opencode rejected it with `Expected object`.
- **XP/98 window chrome.** The desktop titlebars now use the real XP.css /
  98.css `.title-bar` components, and the app is wrapped in the libraries'
  `.window` frame so the Luna/98 borders are present on every edge. The close
  button is inset correctly instead of being clipped.
- **XP titlebar overflow.** The XP caption used `width: 100%` with the library's
  content-box height, adding 10px of padding/border to the viewport and causing
  a horizontal scrollbar. The grid now stretches the titlebar to the track.
- **XP/98 dropdown arrows.** Keeping the select's arrow as a longhand background
  image preserves the library's `no-repeat` placement; hover no longer tiles the
  arrow across the whole control.
- **Win98-dark users table** and profile/sort selects now use dark surfaces with
  readable text instead of white-on-white controls.
- **Alien controls.** Dropdowns, buttons, tabs, menus and list rows now have
  visible hover/active states, and native option popups use readable dark
  teal/acid-green colours.
- **"0" before session names.** The session row rendered the numeric `pinned`
  flag with `pinned && <Icon/>`; React prints `0` when the flag is false. The
  check is now boolean, so unpinned sessions no longer start with a stray zero.
- **Session pop-outs.** Pop-out windows are frameless again and use the same
  themed title bar/window frame as the main app. They hide the redundant
  *Open in new window* and *Back to list* controls. The Electron server probe
  now recognises the authenticated 401 response, so it can attach to a running
  aiman instead of refusing to start.
- **Stray horizontal scrollbars.** Session and chat panes only scroll
  vertically now; long paths wrap instead of widening the pane.
- **Chat no longer snaps back after a turn finishes.** Auto-follow is now
  limited to the live turn; final markdown, images, tool cards and other late
  layout changes no longer yank a finished conversation back to the bottom.
- **`/undo` and `/redo`.** opencode v2's revert is staged, not committed, so
  redo remains possible and the transcript is never deleted. The manager filters
  the staged boundary when reading v2 messages, and both commands reload the
  visible entries immediately: undo hides the last user turn and its response,
  redo brings them back. The command-menu Undo/Redo actions use the same path.

## [1.8.0] - 2026-10-25

### Added
- **opencode v2 support.** aiman detects the storage schema and works with both
  opencode v1 and v2. On v2 it reads sessions from `session_v2` and messages
  from `session_message` (parts embedded in the message JSON), builds the search
  index from those messages, computes usage from the v2 projections, and
  translates the v2 HTTP API (`/api/session/*`, `/api/provider`, `/api/form`, …)
  into the shapes the web UI already speaks. The v2 event stream
  (`session.text.delta`, `session.tool.success`, `session.step.ended`, …) is
  translated to `message.part.updated`, `message.part.delta`, `session.idle` and
  permission/question events, so streaming, tool output and live status keep
  working.
- **Password-aware launcher.** v2 protects every `/api/*` route with basic auth.
  `aiman` generates `OPENCODE_SERVER_PASSWORD`, starts `opencode serve` with it,
  and passes it to the manager as `OPENCODE_PASSWORD`. It verifies a reused
  server's password and starts its own instance on a free port when it cannot
  authenticate; a second launch of aiman exits instead of spawning duplicates.
- **In-session search.** Ctrl+F (or the *find* button) searches the open session
  for text, thinking and tool input/output with inline highlighting, hit counts
  and Enter/arrow navigation.
- **Attachments in the chat composer.** Drag & drop, Ctrl+V or the 📎 picker
  uploads files to `<session>/.aiman-uploads/`, shows image thumbnails and sends
  them to the model as `file://` attachments. Messages can be sent with
  attachments alone.
- **Agent-aware UI.** The composer, Send button and each assistant message are
  tinted by the active agent: build = blue, plan = orange, custom agents get a
  stable purple/violet hue. Assistant headers show `opencode · <agent>`.
- **Prompt history.** ↑/↓ in the composer recalls previously sent prompts for
  the session and restores the draft when passing the newest.
- **Timestamps** on every message, Thinking card and tool card (compact time,
  full timestamp on hover).
- **Thinking cards open by default**, configurable in **Settings → Chat mode**.
- **Subagent windows.** Child sessions spawned by subagent/task tools appear as
  floating panels with live activity, streaming transcripts, and
  maximize / restore / minimize (name + activity only) / close.
- **Sub-sessions in the session list.** Only root sessions appear at the top
  level; parents with children get an expander and count, children are indented
  with an *agent* badge, and opening a child auto-expands its ancestors.
- **Stop controls.** Esc opens a *Stop the running turn?* confirmation (a second
  Esc confirms); the header and the running-tools strip expose the same action.
  A running-tools bar lists active tools with an Esc hint.
- **Virtualised transcript.** At most 40 messages stay in the DOM with
  *load earlier* batches, while auto-follow keeps the newest block in view.
  Scrolling up pauses following, shows a “↓ N new messages” pill, and returning
  to the bottom re-locks it.
- **Your own messages** appear immediately on Enter (optimistic) and are
  right-aligned; agent messages stay left-aligned.

### Changed
- **Faster session list and statistics.** Session usage comes from opencode v2's
  precomputed `session_v2` cost/token columns instead of parsing 61k message
  bodies; the model/day statistics read a new compact `msg_usage` table filled
  by the background indexer, with short-lived result caching.
- **Fewer refreshes.** `session.viewed` no longer triggers a session-list
  refresh, the client debounce is 800 ms, and overlapping refreshes collapse
  into one request.
- **Search/usage index** rebuild runs in larger background batches (one-time
  rebuild after upgrading).
- `index.html` is served with `Cache-Control: no-cache` so a hashed bundle
  update can't leave a stale page.

### Fixed
- **"Unable to open database file" on startup.** The database is located by
  finding `opencode.db`, not merely a directory that happens to exist; a missing
  database prints a clear message instead of a stack trace.
- **SSE "disconnected" badge.** The event proxy now sends an initial
  `: connected` frame, pings every 15 s, returns a retryable stream instead of a
  fatal 502 while opencode boots, and the client recreates a closed EventSource.
- **Streaming client disconnects could terminate the process.** Aborted SSE
  requests are cancelled cleanly and per-request failures are caught.
- **Transcript jumping to the oldest message** when messages loaded
  asynchronously, or when the finder auto-jumped while typing; opening a session
  now reliably lands on the newest message, and content growth keeps the view
  pinned while following.
- **Agent/model catalogue stuck on "build"** when fetched before opencode had
  finished booting; catalogues retry and are refreshed when the event stream
  connects.
- **Chat mode on v2.** v2 removed `opencode attach` and its TUI does not stay
  attached through the PTY bridge, so v2 sessions use the structured web chat;
  Settings marks terminal chat as *opencode v1 only*.

### Known limitations with opencode v2
- **Terminal chat** is v1-only (see above).
- Session **sharing** and the **todo** list have no v2 equivalents; those UI
  actions report "unsupported" and the todo panel stays empty.
- **Archive** is written directly to `session_v2.time_archived` (v2 has no
  archive endpoint), so opencode's own UI may not reflect it until it reloads.
- v2 replaced interactive **questions** with forms. aiman maps simple forms
  (string/number/boolean/multiselect) onto its question prompt.
- Background shell sessions (`/api/shell`) are not surfaced as their own panel.

## [1.7.1] - 2026-10-09

### Fixed
- **Uploaded files didn't appear in the file manager.** They're saved to a
  hidden `.aiman-uploads/` folder, which the tree walk filtered out; that folder
  is now included.
- **Paste / drag-drop files into the terminal did nothing.** xterm stops
  propagation of its textarea's paste event, so the previous React handlers
  never fired. The native terminal now uses native, capture-phase listeners on
  the pane, so dropping or pasting images/PDF/etc. works in the in-app session
  and in pop-out windows. (The vendored pyxtermjs page already used native
  listeners.)

## [1.7.0] - 2026-10-09

### Added
- **Paste or drag & drop files into a session terminal** (native terminal and
  the vendored pyxtermjs): images, PDFs and any readable file are uploaded and
  their path is typed into the terminal so opencode can read them. Works in the
  in-app session tab and in pop-out windows.
- **Quick file editor tab in the session header** (`files`): lists the session
  folder's files with filter, open/edit/save, upload and delete.
- Server endpoints: `POST /api/upload`, `DELETE /api/file`.

### Fixed
- **Couldn't switch back to a plain theme (e.g. Aiman Dark) after Windows
  XP/98.** Now every theme variable is cleared on switch and any injected
  xp.css/98.css stylesheet is always detached, so its global element styles
  can't leak into other themes.

## [1.6.0] - 2026-10-09

### Added
- **Self-restart on update.** Applying an update now restarts aiman
  automatically (exits and lets systemd/launchd bring it back, or relaunches
  detached when run from a terminal), so new code takes effect without a manual
  restart. Added a **Restart aiman** button and `POST /api/restart`.
- **Install as a background service from Settings.** A new *Background service*
  section installs/uninstalls and reports status for **systemd** (Linux, system
  or user unit), **launchd** (macOS LaunchAgent) and **Task Scheduler**
  (Windows). Endpoints: `GET /api/service`, `POST /api/service/install`,
  `POST /api/service/uninstall`.

## [1.5.5] - 2026-10-09

### Fixed
- **Switching provider profiles didn't take effect in running sessions.**
  opencode caches provider auth in per-directory instances, so a runtime
  `PUT /auth` updated `auth.json` but existing instances kept the old key
  (e.g. you'd still get the old key's "Insufficient Balance"). Profile
  activation now disposes the affected opencode instances so the next request
  re-reads the new keys.

## [1.5.4] - 2026-10-09

### Changed
- **Treemap auto-loads file contents.** Instead of only fetching when a cell is
  large, the visualizer now auto-loads every text file up to **200 KB** (using a
  binary *blocklist* so any language/config file counts, not a hand-written
  allowlist), so contents are ready and render as soon as a cell is big enough.
  Images render automatically straight from `/api/raw` as soon as the cell is a
  usable thumbnail, with no fetch/open step. Concurrency-limited to 6 requests.

## [1.5.3] - 2026-10-09

### Fixed
- **Windows: "opencode is not recognized" in session terminals.** Session
  terminals now launch opencode by its **absolute path** (resolved server-side
  and exposed as `opencodeBin` in `/api/config`), so they no longer depend on
  the PTY's PATH. On Windows the TUI is started via PowerShell (robust quoting)
  instead of cmd. This also stops the follow-on `PUT /oc/pty/{id}` 404s, which
  happened because the PTY had already exited.

## [1.5.2] - 2026-10-09

### Added
- **Copy on select** in the terminal (native xterm pane and the vendored
  pyxtermjs page): selecting text copies it to the clipboard, with a fallback
  for non-secure contexts.

## [1.5.1] - 2026-10-09

### Fixed
- **Windows: `spawn … opencode.cmd EINVAL`.** The launcher now spawns npm
  `.cmd`/`.bat` shims through the shell (with quoting), and no longer crashes if
  `opencode` fails to start — aiman keeps running and prints a hint.

## [1.5.0] - 2026-10-09

### Added
- **Update checks from GitHub Releases.** On WebUI load the server checks the
  latest release (cached for an hour) and notifies you if a newer version is
  available. Settings → **Updates** shows installed vs latest and has
  *Check for updates* and, for admins, *Update now* — which downloads the
  release tarball and overlays the app files (user data in `AIMAN_HOME` is
  untouched), then asks you to restart.
- New endpoints: `GET /api/update`, `POST /api/update/apply`.

### Fixed
- **Diff now lists changed files even when opencode reports none.** opencode's
  per-session diff is empty for projects it doesn't track, so the diff view
  falls back to the files touched by the session's `edit`/`write`/`patch` tool
  calls, shown as a scrollable list.

## [1.4.1] - 2026-10-09

### Fixed
- **"Changed files: none" when using diff.** The client expected
  `{ files: [...] }` but opencode's `/session/{id}/diff` returns an array of
  `{ file, patch, additions, deletions }`; the response is now normalised and
  the session's directory is passed so opencode resolves the right project.
  (opencode only reports files it tracked for the session — sessions whose
  directory isn't a tracked project legitimately return an empty diff.)
- **Pop-out windows now show the session title** in the window/tab title
  (`<session title> · aiman`).

## [1.4.0] - 2026-10-09

### Added
- **Themes.** A theme picker in Settings (and the onboarding wizard) with eight
  skins that restyle the entire app — chrome, sessions, chat, terminal (xterm
  colours follow the theme), code map, overlays and scrollbars:
  *Aiman Dark* (default), *Aiman Light*, **Windows XP** and **Windows 98**
  (using the real [xp.css](https://botoxparty.github.io/XP.css/) /
  [98.css](https://jdan.github.io/98.css/) skins, loaded lazily only while
  active), *Skeuomorphic* (Winamp-style brushed metal with green LED glow),
  *macOS Aqua*, *Nord* and *Phosphor CRT*. The choice is remembered per browser.
- **Pop-out session windows.** Every session row and the session header have an
  "open in new window" (⇗) action that opens `/sessions/<id>?popout=1` in a
  chrome-less browser window, so you can move sessions into their own windows
  and arrange them side by side.

## [1.3.5] - 2026-10-09

### Fixed
- **Blank terminal / `assignment to undeclared variable i` in the terminal pane.**
  The bundled xterm.js 6.x renderer produced that runtime error under some
  browsers, leaving the terminal empty. Pinned `@xterm/xterm` to the stable
  `5.5.0` (with `@xterm/addon-fit@0.10.0`), which minifies cleanly.

## [1.3.4] - 2026-10-09

### Changed
- **Treemap cells now render in screen space.** Text and borders keep a constant
  pixel size at any zoom, so zooming into a file reveals more of its source at a
  readable size (instead of magnifying a few lines and fattening the borders).
- **Effectively infinite zoom** (up to 8000×) so you can fill the view with a
  single file and read a full page without opening the editor. Labels and icons
  stay small while the file content expands to fill the cell.
- Off-screen cells are culled while panning/zooming to keep it smooth.

## [1.3.3] - 2026-10-09

### Fixed
- **Treemap only rendered file code after opening and closing a file.** The
  size-tracking effect that gates the on-screen preview threshold only re-ran
  when the editor toggled, so on first load (before the tree/container mounted)
  it bailed and never observed the map size — file rectangles stayed empty until
  a forced remount. It now also re-runs when the tree loads.

## [1.3.2] - 2026-10-09

### Fixed
- **Treemap crash / black page** (`Cannot read properties of null (reading 'tx')`).
  The pan handler read `drag.current` inside the `setView` updater, which React
  runs after the pointer has already been released. The drag values are now
  captured locally.
- Added a React **error boundary** around the codebase visualizer and the
  terminal so a component fault shows an inline message instead of a blank page.

## [1.3.1] - 2026-10-09

### Fixed
- **Terminal didn't open behind Apache** (showed *"session ended — reopen to
  reconnect"*). The `/ptyws/` WebSocket bridge needs an explicit `ws://`
  ProxyPass; a plain `ProxyPass /` uses `mod_proxy_http` and does not tunnel
  WebSocket upgrades. Added [`deploy/apache-aiman.conf`](deploy/apache-aiman.conf)
  and a README note. Standalone `aiman` was never affected.

### Changed
- **Treemap now renders recursively.** Directories contain their children, so
  files nested inside folders are shown (depth-first, deep nesting included), and
  file rectangles render their actual code (or image) once they are large enough
  on screen.
- **Pan / zoom in the treemap.** Mouse wheel zooms toward the cursor, the
  **middle mouse button** drags to pan, clicking a folder zooms to fit it,
  *fit* resets the view, and double-clicking a file opens the editor.

## [1.3.0] - 2026-10-09

### Added
- **Per-user / per-profile statistics.** Sessions are attributed to the user who
  creates or first opens them, and to their active config profile. The Stats view
  can be filtered by user, by profile, or any combination.
- **Per-session statistics.** A `stats` panel in the session header (available in
  both chat modes) shows tokens, cost, user-message count and per-model usage.
- **Fork here.** Every message in the web chat has a *Fork here* action that
  creates a new session from that point (`POST /session/{id}/fork`).
- **Onboarding.** New and first-run users get a short wizard covering security
  (password) and preferences (chat mode). Completion is stored per user.
- **Codebase explorer.** Opening a folder (or directory) in the sidebar splits
  the view: the session list stays on the left, and a **CodeCharta-style treemap**
  of the codebase appears on the right. It has a 2D/3D toggle, click-to-zoom
  directories, inline code/image previews inside file rectangles, and a full
  editor (`double-click` a file) with save support. Files are read/written
  through the manager with path-escape protection and sensible ignores
  (`node_modules`, `.git`, `dist`, …).
- New endpoints: `/api/stats?user=&profile=`, `/api/stats/filters`,
  `/api/sessions/{id}/claim`, `/api/tree`, `/api/file` (GET/PUT), `/api/raw`,
  `/api/me/onboarded`, `/api/me/password`.

### Changed
- Installers continue to install `opencode` **only when it is not already
  present** (and likewise for Bun).

## [1.2.0] - 2026-10-09

### Added
- **Terminal chat (default).** Sessions can now open directly as the opencode
  TUI embedded in the browser. Opening a session launches
  `opencode attach <server> --session <id>` inside an xterm.js terminal, with
  live streaming, tools and slash commands in one view.
- **Native PTY backend — pyxtermjs is no longer required.** The terminal is
  powered by opencode's own PTY API and a WebSocket bridge in the manager
  (`/ptyws/{id}`), so it works on Linux, macOS and Windows with no Python or
  external terminal server. xterm.js is bundled into the web build.
- **Settings view** (`/settings`) to choose the chat mode: *Terminal chat*
  (default) or *Web chat*. The choice is stored per browser and the backend
  reports PTY availability.
- The generic **Terminal** tab now uses the native PTY too.

### Changed
- Installers are now self-contained: they install **Bun** and **opencode**
  (`opencode-ai`) when missing, and Linux/macOS installs prefer the prebuilt
  release tarball (which already contains the built UI) so no toolchain is
  needed.
- App config exposes `platform`; terminal commands are wrapped per-OS because
  spawning the opencode binary directly as a PTY leader aborts.

## [1.1.0] - 2026-10-09

### Added
- **URL routing (handles).** Every place has a stable path — `/sessions`,
  `/search`, `/stats`, `/terminal`, `/users`, `/profiles` — and individual
  sessions get a deep link at `/sessions/<id>`. The browser URL updates as you
  navigate, and back/forward buttons work. `?session=<id>` is still supported
  for backwards compatibility.
- **Cross-platform configuration.** All paths are now resolved per-platform and
  overridable via environment variables (`AIMAN_HOME`, `OPENCODE_DB`,
  `OPENCODE_AUTH`, `DIST`, `PORT`, `HOST`, `OPENCODE_URL`, `TERMINAL_URL`).
  Data defaults to the OS data directory (`~/.local/share/aiman` on Linux,
  `~/Library/Application Support/aiman` on macOS, `%APPDATA%\aiman` on Windows).
- **`aiman` launcher CLI** (`bin/aiman.mjs`) that starts the manager, optionally
  boots an `opencode serve` instance, can rebuild the UI, and opens the browser.
- **Installers** for Linux/macOS (`scripts/install.sh`) and Windows
  (`scripts/install.ps1`) that install Bun, build the UI and add an `aiman`
  command.
- **Docker support** (`Dockerfile`, `docker-compose.yml`).
- **CI and release workflows** (`.github/workflows/`) that build the UI and
  publish tagged releases.
- **Graceful terminal fallback.** `/terminal` is proxied to a configurable
  pyxtermjs backend; when it is not running the panel shows setup instructions
  instead of failing.

### Fixed
- **Sidebar navigation from other tabs.** Clicking **All sessions**, **Pinned**,
  **Archived**, a folder, a directory, or **New session** while viewing Search,
  Stats, Terminal, Users or Profiles now correctly switches back to the sessions
  view instead of leaving the screen unchanged.

### Changed
- Project relicensed and published as an open-source repository at
  <https://github.com/spacewalkingninja/aiman>.

## [1.0.0] - 2026-10-07

### Added
- Initial self-hosted opencode sessions manager: session browsing, folders,
  pinning/archiving, full-text search, usage statistics, user management,
  provider config profiles, live event streaming and an embedded terminal.
