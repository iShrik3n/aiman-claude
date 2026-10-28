import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// claude.ts opens the index DB on import; keep it away from the real one.
process.env.AIMAN_HOME = mkdtempSync(join(tmpdir(), "aiman-test-"));
const { parseTranscript } = await import("../src/claude");

const L = (o: unknown) => JSON.stringify(o);
const usage = (o: Record<string, unknown>) => ({
  input_tokens: 10,
  cache_creation_input_tokens: 1000,
  cache_read_input_tokens: 5000,
  output_tokens: 100,
  output_tokens_details: { thinking_tokens: 40 },
  cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 0 },
  ...o,
});

const transcript = [
  L({ type: "file-history-snapshot", messageId: "x" }),
  L({ type: "user", uuid: "u1", cwd: "/work/proj", timestamp: "2026-10-01T10:00:00Z", message: { role: "user", content: "fix the bug please" } }),
  L({ type: "attachment", attachment: { type: "x" } }),
  // one API response split over two lines: usage repeats, output grows
  L({ type: "assistant", uuid: "a1", timestamp: "2026-10-01T10:00:02Z", message: { id: "msg_1", model: "claude-sonnet-5-5", role: "assistant", content: [{ type: "text", text: "On it." }], usage: usage({ output_tokens: 60 }) } }),
  L({ type: "assistant", uuid: "a2", timestamp: "2026-10-01T10:00:03Z", message: { id: "msg_1", model: "claude-sonnet-5-5", role: "assistant", stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } }], usage: usage({}) } }),
  L({ type: "user", uuid: "u2", timestamp: "2026-10-01T10:00:04Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "a.txt\nb.txt" }] } }),
  L({ type: "assistant", uuid: "a3", timestamp: "2026-10-01T10:00:05Z", message: { id: "msg_2", model: "claude-sonnet-5-5", role: "assistant", content: [{ type: "text", text: "Done." }], usage: usage({ output_tokens: 20, output_tokens_details: { thinking_tokens: 0 } }) } }),
  L({ type: "ai-title", aiTitle: "Fix the bug" }),
  "not json at all",
].join("\n");

test("merges a split response and counts its tokens once", () => {
  const s = parseTranscript("sess-1", transcript)!;
  const assistants = s.messages.filter((m) => m.data.role === "assistant");
  expect(assistants).toHaveLength(2);
  const first = assistants[0]!;
  expect(first.data.tokens.input).toBe(10);
  expect(first.data.tokens.output).toBe(60); // 100 total - 40 thinking
  expect(first.data.tokens.reasoning).toBe(40);
  expect(first.data.tokens.cache.read).toBe(5000);
  expect(first.data.tokens.cache.write1h).toBe(1000);
});

test("estimates cost from list prices, with the 1h cache write rate", () => {
  const s = parseTranscript("sess-1", transcript)!;
  const first = s.messages.filter((m) => m.data.role === "assistant")[0]!;
  // sonnet 5.5: 10*2 + (60+40)*10 + 5000*0.2 + 1000*2*2 = 20+1000+1000+4000 per million
  expect(first.data.cost).toBeCloseTo((20 + 1000 + 1000 + 4000) / 1e6, 9);
});

test("attaches tool results to their call and skips bookkeeping lines", () => {
  const s = parseTranscript("sess-1", transcript)!;
  const tool = s.messages.flatMap((m) => m.parts).find((p) => p.data.type === "tool")!;
  expect(tool.data.tool).toBe("bash");
  expect(tool.data.state.status).toBe("completed");
  expect(tool.data.state.output).toBe("a.txt\nb.txt");
  // the tool_result line is not a user turn
  expect(s.messages.filter((m) => m.data.role === "user")).toHaveLength(1);
});

test("takes directory and title from the transcript", () => {
  const s = parseTranscript("sess-1", transcript)!;
  expect(s.directory).toBe("/work/proj");
  expect(s.title).toBe("Fix the bug");
});

test("falls back to the first prompt for the title and returns null when empty", () => {
  const noTitle = transcript.split("\n").filter((l) => !l.includes("ai-title")).join("\n");
  expect(parseTranscript("s", noTitle)!.title).toBe("fix the bug please");
  expect(parseTranscript("s", L({ type: "attachment" }))).toBeNull();
});
