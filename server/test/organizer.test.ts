import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The preload (setup.ts) provides the throwaway data dir and Claude config dir.
const projects = join(process.env.CLAUDE_CONFIG_DIR!, "projects", "-work-proj");
mkdirSync(projects, { recursive: true });

const L = (o: unknown) => JSON.stringify(o);
const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
writeFileSync(
  join(projects, "sess-org-1.jsonl"),
  [
    L({ type: "user", uuid: "u1", cwd: "/work/proj", timestamp: "2026-10-01T10:00:00Z", message: { role: "user", content: "add a billing page" } }),
    L({ type: "assistant", uuid: "a1", timestamp: "2026-10-01T10:00:02Z", message: { id: "m1", model: "claude-sonnet-5-5", role: "assistant", content: [{ type: "text", text: "Billing page added." }], usage } }),
  ].join("\n"),
);

const { syncTranscripts } = await import("../src/claude");
const { applyPlan, extractPlan, promptFor, sessionsForOrganizing } = await import("../src/organizer");
const { listFolders, getMetaMap } = await import("../src/manager");

syncTranscripts();

test("the prompt carries title, directory and snippets of the indexed session", () => {
  const sessions = sessionsForOrganizing();
  expect(sessions.map((s) => s.id)).toContain("sess-org-1");
  const prompt = promptFor(sessions);
  expect(prompt).toContain("Claude Code sessions");
  expect(prompt).toContain('id=sess-org-1');
  expect(prompt).toContain('directory="/work/proj"');
  expect(prompt).toContain("add a billing page");
  expect(prompt).toContain("Billing page added.");
});

test("extracts the JSON plan from fenced or chatty answers and rejects non-JSON", () => {
  const plan = { folders: [{ path: ["Work"] }] };
  expect(extractPlan("Sure!\n```json\n" + JSON.stringify(plan) + "\n```")).toEqual(plan);
  expect(() => extractPlan("no json here")).toThrow();
});

test("applies a plan: creates the folders and files the session", () => {
  const stats = applyPlan(
    {
      folders: [{ path: ["Work", "Proj"] }],
      assignments: [{ sessionID: "sess-org-1", folder: ["Work", "Proj"] }],
    },
    { markAll: true },
  );
  expect(stats.assigned).toBe(1);
  expect(stats.foldersCreated).toBe(2);
  const proj = listFolders().find((f) => f.name === "Proj")!;
  expect(getMetaMap().get("sess-org-1")?.folder_id).toBe(proj.id);
});
