# aiman-claude

A fork of [AiMAN](https://github.com/spacewalkingninja/aiman) (MIT, © 2026
spacewalkingninja) that manages **Claude Code** sessions instead of opencode
sessions. The original author's licence and credits are kept as is.

## Status: phase 2 — live chat

Works:

- Session list, rename (stored in the index only), pin, archive, folders
- Full-text search across every message and tool call
- Token statistics (tokens only; **cost is 0** because transcripts carry no price)
- Transcript view (text, tool calls with output, Edit diffs)
- **Prompting**: new sessions, continue existing ones, abort, model and effort
  selection, through the Claude Agent SDK
- **Permission prompts** and `AskUserQuestion` answered in the browser

Not implemented yet (endpoints answer 501 or the buttons are hidden):
attachments, fork, undo, terminal, deferred queue, `/btw`, auto-organize,
extensions, profiles, self-update.

## Security

A POST to this server can make Claude Code run tools on your machine.

- Live control is **only on when the server is bound to loopback** (the
  default). With `HOST=0.0.0.0` (e.g. the Docker image) it is read-only unless
  you set `AIMAN_ALLOW_REMOTE_CONTROL=1`; do that only behind your own auth.
- Requests need a login, a loopback `Host` header (add reverse-proxy names with
  `AIMAN_ALLOWED_HOSTS=a.example,b.example`) and, for POSTs, a same-origin
  `Origin`.
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

Upstream is tracked as the `upstream` git remote.

## Not adapted yet

`scripts/install.*`, the Dockerfile, `deploy/` and the desktop app are still
upstream's and target the opencode version (the installers download upstream
releases). Run from source as above.
