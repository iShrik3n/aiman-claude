import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { CLAUDE_CONFIG_DIR } from "./config";
import { findClaude, MODELS } from "./live";

/** Cheap and fast; used when the caller does not pick a model. */
export const DEFAULT_ONESHOT_MODEL = "claude-haiku-5-5";

export const knownModel = (id: string | undefined): string | undefined =>
  MODELS.some((m) => m.id === id) ? id : undefined;

/**
 * One text-in, text-out call to Claude. No tools, no user settings or hooks, no
 * CLAUDE.md, nothing written to ~/.claude/projects, a single turn: used for
 * side questions and classification, never for work on the user's files.
 * Uses the user's own Claude login like the rest of the app, so each call is a
 * real request on their account.
 */
export async function oneShot(
  prompt: string,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 120_000);
  const stderr: string[] = [];
  const exe = findClaude();
  try {
    const q = query({
      prompt,
      options: {
        cwd: tmpdir(),
        abortController: abort,
        persistSession: false,
        settingSources: [],
        tools: [],
        maxTurns: 1,
        permissionMode: "default",
        canUseTool: async () => ({ behavior: "deny", message: "Tools are disabled for this request." }),
        model: knownModel(opts.model) ?? DEFAULT_ONESHOT_MODEL,
        ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
        env: { ...process.env, CLAUDE_CONFIG_DIR } as Record<string, string>,
        stderr: (d) => {
          stderr.push(d);
          if (stderr.length > 20) stderr.shift();
        },
      },
    });
    let text = "";
    let failure = "";
    for await (const msg of q) {
      if (msg.type === "assistant") {
        for (const b of msg.message.content) if (b.type === "text") text += b.text;
      } else if (msg.type === "result") {
        if (msg.is_error) failure = ("result" in msg && typeof msg.result === "string" && msg.result) || msg.subtype;
        else if (!text && "result" in msg && typeof msg.result === "string") text = msg.result;
      }
    }
    if (failure) throw new Error(failure);
    if (!text.trim()) {
      throw new Error(stderr.join("").trim().split("\n").slice(-3).join("\n") || "no answer");
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
