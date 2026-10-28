> **aiman-claude** is a fork of [AiMAN](https://github.com/spacewalkingninja/aiman)
> (MIT) that manages **Claude Code** sessions instead of opencode ones. It is
> read-only for now — see [FORK.md](FORK.md). The rest of this README is
> upstream's and still describes the opencode version.

# AiMAN

A self-hosted web UI and session manager for [opencode](https://opencode.ai).

`AiMAN` turns your opencode session history into a searchable, organisable
workspace: browse conversations, sort them into folders, pin the important ones,
full-text search every message, track token/cost usage, manage users and switch
provider API keys — all from the browser, with a live event stream while
opencode is working.

## Features

- **Sessions** — browse, rename, pin, archive and file sessions into colour-coded
  folders. Live "working" badges as opencode streams.
- **Full-text search** — FTS5 index over every message part (text, reasoning,
  tool calls, files).
- **Usage statistics** — tokens, cost, cache and per-model breakdowns, daily
  activity charts and top sessions. Filter by **user**, by **credential set**, by
  project and date range, and drill into **per-session** statistics.
- **Fork anywhere** — fork a new session from any message with *Fork here*.
- **Onboarding** — first-run wizard for security (password) and preferences.
- **Codebase explorer** — select a folder and a CodeCharta-style **treemap** of
  the code appears beside the session list, with a 2D/3D toggle, zoomable
  directories and a built-in editor. It is **lightweight by default**: only
  on-screen cells are read, with configurable size caps for text, image and PDF
  previews (safe media previews stay on by default).
- **About / DeSOTA** — Settings includes the DeSOTA wordmark and link
  ([desota.net](https://desota.net/)), “by DeSOTA” branding and developer credit.
  The Commissioner variable font is bundled with the app, so no external font
  request is made at runtime.
- **/btw side questions** — ask a quick question with `/btw <question>` or the
  session **btw** button. Aiman snapshots recent context into an isolated child
  session, leaves the main transcript untouched, and saves the answer in a
  per-session BTW history for later review. The composer’s selected model and
  effort variant are used and shown with each saved answer.
- **Session model memory** — opening a session sets the composer selector to the
  model most recently used by that session, so free opencode models and direct
  API models are not confused.
- **Deferred messages** — queue a request while the agent is working and Aiman
  delivers it only after the task is fully quiescent: idle, no pending
  questions/permissions, no running shells/tools and no busy subagents. A
  cancellable quiet-window progress bar and full settings control the strict
  gate; the default Enter key still sends immediately.
- **Session terminals** — a **terminal** button in the session toolbar opens a
  small floating shell in the session's working directory, with the same
  minimize/maximize/close controls as subagent windows. Both terminal and
  subagent windows can be dragged by their headers.
- **Terminal chat (default)** — opens each session as the full opencode TUI
  embedded in the browser, attached to that session (streaming, tools and slash
  commands in one view). Switch to the classic structured chat in **Settings**.
- **Web chat** — streamed messages, tool output, todos, permission prompts and
  interactive question prompts. Models with reasoning-effort variants get a
  second selector (none/minimal/…/max), and each assistant message is labelled
  with the model and effort level that produced it. Shell/tool output opens by
  default; turn that off in **Settings** if you prefer compact messages.
- **Undo / redo** — stage or clear opencode's reversible revert boundary; the
  last turn disappears from the transcript and comes back on redo.
- **Context meter** — the composer status bar shows how much of the active
  model's context window the latest turn used, with warning colours near the
  limit.
- **Semantic icon set** — the whole app uses line icons, switching to authentic
  bitmap-era icons in the Windows themes (no emoji as UI chrome).
- **Native terminal** — the embedded terminal runs on opencode's own PTY API and
  xterm.js; no Python or external terminal server, works on Linux, macOS and
  Windows.
- **Users** — first-run admin setup, add/promote/disable/delete users.
- **Integrations (admin)** - manage opencode MCP servers (local or remote) and
  all plugins in one place: add, edit, remove, connect/disconnect, browse MCP
  resources, check/update/remove packages, and create/edit/import local plugin
  files. Changes are written to the active opencode config document, which
  opencode hot-reloads.
- **OpenCode (admin)** - an OpenCode configuration cockpit with a sidebar:
  raw JSONC config editing; providers; live credentials and saved credential
  sets; permissions; system prompt and project rules; LSP/formatter and v2
  `cli.json`; skills, commands and agents; presets; and local/portable/GitHub
  snapshots. Live logs moved to **Settings → System**.
- **Usage filters and export** - date ranges, project filtering, per-user and
  per-credential-set views, CSV export and a PNG snapshot of the dashboard.
- **Credential sets** - named bundles of provider API keys under **OpenCode →
  Providers → Credentials**, with drift detection, capture-live-keys and an
  admin-only apply action. There is no longer a separate top-bar profile switcher.
- **Deep links** — every view has a URL (`/sessions`, `/search`, `/stats`,
  `/integrations`, `/workspace`, …) and each session has its own handle
  (`/sessions/<id>`).
- **Themes & typography** - thirteen app-wide skins including Windows XP and
  Windows 98 (and dark variants of both, via xp.css / 98.css), four alien skins
  (Y2K Winamp chrome, **Alien Grotesque**, **K-Jöfol Xeno4**, and **Xeno 3000**
  with the supplied cockpit stylesheet, reactor palettes, spectrum pod and
  paper-LCD directory matrix), macOS Aqua, Nord and a CRT. Choose custom UI and
  code/terminal font families, set a base font size, or reset to the theme.
- **Switchable opencode servers** - keep multiple opencode URLs with their own
  password, database and auth path, then activate one and restart. Environment
  variables remain the highest-priority override.
- **European languages** - navigation and OpenCode shell translations for most
  European languages alongside English, Simplified Chinese and Korean.
- **Folder tree** — organize sessions into nested folders, with inclusive
  subtree filtering, branch collapse, and subfolder creation.
- **Auto-organize** — one admin click asks opencode to build a folder tree and
  file existing sessions from their titles, paths and contexts. New sessions
  are filed automatically when they reach ten user messages; the internal
  organizer session is archived.
- **Sidebar directories** — sort working directories by latest session, session
  count, or name; collapse the list to show a compact session switcher instead.
- **Pop-out windows** — open any session in its own themed window; it inherits
  the active skin and drops the redundant app toolbar.
- **Compact toolbar** — optionally merge Sessions, Search, Stats, Terminal,
  Settings, Users, Integrations, OpenCode and the live indicator into the desktop
  title bar. Pop-outs then keep only the window controls in their header.
- **Cross-platform** — runs on Linux, macOS and Windows via [Bun](https://bun.sh).

## Requirements

Both are installed automatically by the installer scripts:

- [Bun](https://bun.sh) — the runtime and web build tool.
- [opencode](https://opencode.ai) — the manager reads its SQLite database and
  talks to `opencode serve` / its native PTY.

Both opencode **v1** and **v2** are supported. The manager detects the storage
schema (`session`/`message`/`part` vs `session_v2`/`session_message`) and
translates aiman's API against whichever HTTP surface the server exposes. For
v2 (where every `/api/*` call requires basic auth) the launcher generates a
password and passes it to both processes; if you run your own `opencode serve`,
set `OPENCODE_PASSWORD` to its password.

## Install

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.ps1 | iex
```

### From source

```bash
git clone https://github.com/spacewalkingninja/aiman.git
cd aiman
bun install --cwd web
bun run build
bun run start
```

### Docker

```bash
docker compose up --build
```

## Usage

```bash
aiman                 # start the manager (and opencode serve)
aiman --open          # ...and open the browser
aiman --build         # rebuild the web UI first
aiman --no-opencode   # don't start opencode; use an existing server
aiman --port 5000     # custom port
```

Then open <http://127.0.0.1:4097>. On first visit you'll be asked to create the
administrator account.

### Desktop app

The Electron shell wraps the same server and web UI:

```powershell
cd C:\Users\kristian\Desktop\aiman
bun run desktop
```

The shell reuses an aiman already listening on port 4097; otherwise it starts
the source server itself. To run this source build alongside an existing
installed aiman, give it another port:

```powershell
$env:PORT = "4098"
bun run desktop
```

Or double-click `run-desktop.bat`. It uses port 4098 by default so it can run
beside the installed app; pass a different port as its first argument if needed
(`run-desktop.bat 5000`).

Close any open aiman desktop window first — the shell is single-instance. Build
an installer with `bun run desktop:build`; the output goes to `desktop-dist/`.
Prebuilt Windows installers (`aiman Setup <version>.exe`) are attached to each
GitHub release alongside the server/web archives.

### Updating

- **Server / web installs** — open **Settings → Updates** and choose
  **Check for updates**, or `POST /api/update/apply` as an administrator. The
  updater downloads the latest GitHub release and overlays the runtime files.
  User data in `AIMAN_HOME` is left untouched.
- **Any Linux / macOS server (even an old build)** — run the standalone updater;
  it fetches the latest release and restarts the service:

  ```bash
  curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/update.sh | bash
  ```

  Pin a version with `AIMAN_VERSION=1.9.0`, or target a non-default install with
  `AIMAN_APP_DIR=/path/to/app`. Use `AIMAN_NO_RESTART=1` to skip the restart.
  The same script is included in release archives as `scripts/update.sh`.
- **Desktop app** — download and run the installer from the latest GitHub
  release. The in-app updater refreshes the bundled server and web UI, but it
  cannot replace the running Electron shell.
- **Source checkouts** — `git pull`, then `bun run build` (and
  `bun run desktop:build` if you need a fresh installer). Restart the running
  process afterwards.

## OpenCode

Administrators get an **OpenCode** area that mirrors OpenCode Studio-style
configuration management without leaving AiMAN. A grouped sidebar replaces the
old long tab strip:

- **Raw config** edits `opencode.json` / `opencode.jsonc` with validation,
  comments and unknown-field preservation.
- **Providers → Models** edits endpoints, model limits, costs,
  reasoning/tool-call capabilities and default/small models.
- **Providers → Credentials** is the single provider-auth surface: live API
  keys, OAuth login, saved API-key sets, drift detection and
  “capture live keys”. Applying a set is admin-only and warns about removed
  keys and untouched OAuth credentials.
- **Permissions**, **system prompt**, **project rules** (`AGENTS.md` /
  `CLAUDE.md`), **LSP/formatters** and v2 **`cli.json`**.
- **Skills**, **commands** and **agents** can be created, edited, imported in
  bulk, enabled/disabled and deleted.
- **Presets** save groups of skills, commands, agents, plugins and MCP servers.
- **Snapshots & backups** contains local snapshots plus file/GitHub export and
  restore. Snapshots do not include sessions, chat history or credentials.
- **Integrations** (admin) manages MCP servers, package plugins and local plugin
  files together.
- **Settings → System** contains the live log viewer, updates and the background
  service.
- **OpenCode** forms show an **unsaved** badge and confirm before changing
  section or configuration scope.

## Configuration

Everything is optional and can be set via environment variables:

| Variable        | Default                                   | Description                              |
| --------------- | ----------------------------------------- | ---------------------------------------- |
| `AIMAN_HOME`    | OS data dir `/aiman`                      | aiman's own data (manager.db, backups)   |
| `MANAGER_DB`    | `$AIMAN_HOME/manager.db`                  | explicit SQLite path for aiman's data    |
| `OPENCODE_DB`   | auto-detected opencode data dir           | opencode's SQLite database               |
| `OPENCODE_AUTH` | `<opencode data dir>/auth.json`           | opencode auth file                       |
| `DIST`          | `<repo>/dist`                             | built web UI directory                   |
| `HOST`          | `127.0.0.1`                               | bind host                                |
| `PORT`          | `4097`                                    | HTTP port                                |
| `OPENCODE_URL`  | `http://127.0.0.1:4096`                   | opencode server URL                      |
| `OPENCODE_PASSWORD` | generated by the launcher             | password for `opencode serve` (v2)       |
| `TERMINAL_URL`  | `http://127.0.0.1:4098`                   | legacy pyxtermjs backend (not required)  |

Default data locations by platform:

- **Linux:** `~/.local/share/aiman`
- **macOS:** `~/Library/Application Support/aiman`
- **Windows:** `%APPDATA%\aiman`

## Development

```bash
bun install --cwd web
bun run --cwd web dev     # Vite dev server (proxies to the manager on :4097)
bun run dev               # manager in watch mode on :4097
```

The manager proxies `/oc/*` (including the PTY) to `opencode serve` and bridges
terminals over `/ptyws/*`, so the Vite dev server works without extra CORS setup.

## Chat modes

Open a session and it launches the opencode TUI attached to it inside the
browser (**terminal chat**, the default). Switch to the structured React chat
under **Settings** (`/settings`). The choice is remembered per browser.

opencode v2 dropped `opencode attach`, and its TUI does not remain attached
through the PTY bridge, so **v2 sessions use the structured web chat**; the
terminal option is disabled in Settings for v2 (it stays available on v1).

When running behind a reverse proxy, make sure WebSocket upgrades reach the
manager: the terminal bridge lives at `/ptyws/` and needs a `ws://` ProxyPass
(plain `ProxyPass /` does not tunnel WebSockets). See
[`deploy/apache-aiman.conf`](deploy/apache-aiman.conf). The standalone `aiman`
launcher needs no proxy at all.

The embedded terminal uses opencode's native PTY API:

- `POST /oc/pty` creates a PTY (the manager proxies it to opencode),
- the browser connects to `/ptyws/{id}`, which the manager bridges over a
  WebSocket to `opencode /pty/{id}/connect` (v1) or
  `opencode /api/pty/{id}/connect` with a short-lived ticket (v2),
- xterm.js renders it — all bundled, no external terminal server.

## Codebase explorer

Select a folder (or a directory) in the sidebar and the main view splits in two:
the session list stays on the left, and a treemap of the codebase appears on the
right. Directories are sized by total bytes; click a rectangle to zoom in. When
you zoom into files, each rectangle shows a code snippet, an image preview, or a
file-type icon. Double-click a text file to open it in the built-in editor and
save changes.

Tune the walk with `GET /api/tree?directory=<path>&depth=<n>&max=<n>`; common
build/vendor folders (`node_modules`, `.git`, `dist`, `target`, `.venv`, …) are
skipped. File reads and writes go through `/api/file` (GET/PUT) and `/api/raw`
and are confined to the selected directory.

## Architecture

| Path       | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| `server/`  | Bun HTTP server: REST API, auth, FTS index, opencode + PTY WebSocket proxy |
| `web/`     | React + Vite single-page app (builds to `dist/`)                       |
| `bin/`     | `aiman` launcher                                                       |
| `scripts/` | Installers                                                             |

## License

[MIT](LICENSE)
