# aiman-claude

A fork of [AiMAN](https://github.com/spacewalkingninja/aiman) (MIT, © 2026
spacewalkingninja) that manages **Claude Code** sessions instead of opencode
sessions. The original author's licence and credits are kept as is.

## Status: phase 2 — live chat

Works:

- Session list, rename (stored in the index only), pin, archive, folders
- Full-text search across every message and tool call
- Token statistics with an **estimated cost**: transcripts carry no price, so cost
  is computed from list prices (`server/src/pricing.ts`, 1-hour cache writes at
  2x). It is what the tokens would cost on the API, not what a subscription
  bills; models missing from the table count as 0
- Transcript view (text, tool calls with output, Edit diffs)
- **Prompting**: new sessions, continue existing ones, abort, model and effort
  selection, through the Claude Agent SDK
- **Permission prompts** and `AskUserQuestion` answered in the browser
- **Terminal**: a shell (or `claude --resume <id>` for a session) in the browser,
  on Bun's built-in PTY. Needs live control; the server picks the command, the
  browser only names a known project directory

Not implemented yet (endpoints answer 501 or the buttons are hidden):
attachments, fork, undo, deferred queue, `/btw`, auto-organize,
extensions, profiles, self-update.

## Security

A POST to this server can make Claude Code run tools on your machine.

- Live control is **only on when the server is bound to loopback** (the
  default). With `HOST=0.0.0.0` (e.g. the Docker image) it is read-only unless
  you set `AIMAN_ALLOW_REMOTE_CONTROL=1`; do that only behind your own auth.
- Requests need a login, a loopback `Host` header (add reverse-proxy names with
  `AIMAN_ALLOWED_HOSTS=a.example,b.example`) and, for POSTs, a same-origin
  `Origin`.
- **Keep it on localhost.** For remote use, tunnel (`ssh -L 4197:127.0.0.1:4197`
  or Tailscale) instead of exposing the port: transcripts contain everything
  you and Claude have done.
- The file explorer endpoints (`/api/tree`, `/api/file`, `/api/raw`,
  `/api/upload`) only reach directories of sessions aiman knows about, with
  `..` and symlinks resolved. Editing, deleting and uploading additionally need
  live control to be on. If you ever ran `claude` from `~`, then `~` counts as a
  project directory.
- Creating the first admin needs a setup token (printed on the server console,
  or `AIMAN_SETUP_TOKEN`) whenever the server is not bound to loopback or
  `AIMAN_ALLOWED_HOSTS` is set. On plain loopback it is not needed.
- After 5 failed logins for a username it is locked for 30 s, doubling up to
  15 min (in memory, per username). Someone who knows your username can
  therefore lock you out for that long.
- Runs use permission mode `default` and never `bypassPermissions`; your normal
  Claude Code settings (allow rules, `defaultMode`, CLAUDE.md) are loaded, so
  tools you already auto-allow are not asked about here either.
- It drives the `claude` binary on your `PATH` (or `CLAUDE_BIN`) with your own
  login. Check Anthropic's current terms before offering it to other people.
- Do not continue a session in aiman and in a terminal at the same time: two
  writers on one transcript will interleave.

## How it works

Claude Code stores each session as `~/.claude/projects/<dir>/<id>.jsonl`.
`server/src/claude.ts` parses those files into opencode's v1 `session` /
`message` / `part` shapes and keeps them in a derived SQLite index
(`$AIMAN_HOME/claude-index.db`), so the original server and web UI code keeps
working unchanged. Claude Code's files are only ever read. Sessions whose
transcript Claude Code later deletes stay in the index.

Note: `claude-index.db` also holds manual renames, archive flags and sessions whose
transcript Claude Code later pruned, so do not delete it casually.

Run it: `bun install --cwd web && bun install --cwd server && bun run build && bun run start`
(default port 4197, data in `~/.local/share/aiman-claude`).

Upstream is tracked as the `upstream` git remote. Current base: AiMAN 1.11.0
(merged in 1.2.0). To update: `git fetch upstream && git merge upstream/main`,
then resolve conflicts in `package.json`, `CHANGELOG.md` and `server/src/config.ts`
(keep our side), and switch off any new opencode-only route or screen the same way
the workspace and server profiles are (501 on the server, `features.workspace` in
the UI). A successful `bun build` does not catch missing identifiers, so start the
server and call a few endpoints after a merge.

## Not adapted yet

The OpenCode workspace, Integrations and server profiles from upstream 1.10+ are
present but disabled: they configure opencode, which this fork does not use.

`scripts/install.*`, the Dockerfile, `deploy/` and the desktop app are still
upstream's and target the opencode version (the installers download upstream
releases). Run from source as above.
