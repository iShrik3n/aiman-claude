// Preloaded before every test file: config.ts reads these once per process, so
// all files share one throwaway data dir and Claude config dir.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "aiman-test-"));
process.env.AIMAN_HOME = join(root, "home");
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
mkdirSync(join(process.env.CLAUDE_CONFIG_DIR, "projects"), { recursive: true });
