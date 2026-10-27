# aiman-claude

A fork of [AiMAN](https://github.com/spacewalkingninja/aiman) (MIT, © 2026
spacewalkingninja) that manages **Claude Code** sessions instead of opencode
sessions. The original author's licence and credits are kept as is.

## Status: phase 1 — read-only

Works:

- Session list, rename (stored in the index only), pin, archive, folders
- Full-text search across every message and tool call
- Token statistics (tokens only; **cost is 0** because transcripts carry no price)
- Read-only transcript view (text, tool calls with output, Edit diffs)

Not implemented yet (the endpoints answer 501): prompting/live chat, permission
prompts, fork, undo, terminal, deferred queue, `/btw`, auto-organize,
extensions, profiles, self-update.

## How it works

Claude Code stores each session as `~/.claude/projects/<dir>/<id>.jsonl`.
`server/src/claude.ts` parses those files into opencode's v1 `session` /
`message` / `part` shapes and keeps them in a derived SQLite index
(`$AIMAN_HOME/claude-index.db`), so the original server and web UI code keeps
working unchanged. Claude Code's files are only ever read. Sessions whose
transcript Claude Code later deletes stay in the index.

Note: `claude-index.db` also holds manual renames, archive flags and sessions whose
transcript Claude Code later pruned, so do not delete it casually.

Run it: `bun install --cwd web && bun run build && bun run start`
(default port 4197, data in `~/.local/share/aiman-claude`).

Upstream is tracked as the `upstream` git remote.
