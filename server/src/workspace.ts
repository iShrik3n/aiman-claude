/**
 * OpenCode workspace management.
 *
 * This module is the configuration/resource counterpart to the session UI. It
 * deliberately writes through the same JSONC-preserving helpers as the MCP /
 * plugin editor, keeps backups next to every mutated file, and validates every
 * user supplied name before it becomes a path.
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { AIMAN_HOME, OPENCODE_AUTH, OPENCODE_URL } from "./config";
import { getSetting, isV2, mgr, setSetting } from "./db";
import { parseJsonc, setRootValue } from "./jsonc";
import { locationParams, ocData } from "./ocClient";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readRequest(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}

function safeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name);
}

function requireName(name: string): string {
  const clean = String(name ?? "").trim();
  if (!safeName(clean)) {
    throw new WorkspaceError(
      "name may only contain letters, numbers, dots, dashes and underscores",
    );
  }
  return clean;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return (
    !!rel &&
    rel !== ".." &&
    !rel.startsWith("../") &&
    !rel.startsWith("..\\") &&
    !/^[A-Za-z]:/.test(rel)
  );
}

function localDate(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (existsSync(path)) copyFileSync(path, path + ".aiman.bak");
  } catch {}
  const temp = path + ".aiman.tmp";
  writeFileSync(temp, text, "utf8");
  try {
    renameSync(temp, path);
  } catch {
    writeFileSync(path, text, "utf8");
    try {
      unlinkSync(temp);
    } catch {}
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function removeIfEmpty(path: string): void {
  try {
    if (existsSync(path) && statSync(path).isDirectory() && !readdirSync(path).length) {
      rmSync(path, { recursive: true, force: true });
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// paths

export function globalConfigDir(): string {
  const direct = process.env.OPENCODE_CONFIG?.trim();
  if (direct) {
    try {
      return statSync(direct).isDirectory() ? resolve(direct) : dirname(resolve(direct));
    } catch {
      // It may be a file that has not been created yet.
      if (/\.(json|jsonc)$/i.test(direct)) return dirname(resolve(direct));
      return resolve(direct);
    }
  }
  const candidates: string[] = [];
  if (process.env.XDG_CONFIG_HOME) candidates.push(join(process.env.XDG_CONFIG_HOME, "opencode"));
  candidates.push(join(homedir(), ".config", "opencode"));
  if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "opencode"));
  if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "opencode"));
  candidates.push(join(homedir(), "Library", "Application Support", "opencode"));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function globalConfigFile(): string {
  const dir = globalConfigDir();
  return ["opencode.jsonc", "opencode.json", "config.json"]
    .map((name) => join(dir, name))
    .find((path) => existsSync(path)) ?? join(dir, "opencode.json");
}

function projectConfigFiles(directory: string): string[] {
  if (!directory) return [];
  return [
    join(directory, "opencode.jsonc"),
    join(directory, "opencode.json"),
    join(directory, ".opencode", "opencode.jsonc"),
    join(directory, ".opencode", "opencode.json"),
  ].filter((path) => existsSync(path));
}

function allowedConfigPath(path: string, directory: string): boolean {
  const abs = resolve(path);
  const global = globalConfigDir();
  if (isInside(global, abs) && /^(opencode|config)\.jsonc?$/.test(basename(abs))) return true;
  if (!directory) return false;
  const root = resolve(directory);
  const rel = relative(root, abs).replace(/\\/g, "/");
  return (
    /^(opencode\.jsonc?|\.opencode\/opencode\.jsonc?)$/.test(rel)
  );
}

function configLabel(path: string, directory: string): string {
  const abs = resolve(path);
  const file = basename(abs);
  if (isInside(globalConfigDir(), abs)) return `global · ${file}`;
  if (directory && isInside(directory, abs)) {
    const rel = relative(directory, abs).replace(/\\/g, "/");
    return `project · ${rel}`;
  }
  return file;
}

function configScope(path: string, directory: string): "global" | "project" | "other" {
  const abs = resolve(path);
  if (isInside(globalConfigDir(), abs)) return "global";
  if (directory && isInside(directory, abs)) return "project";
  return "other";
}

export type ConfigDocument = {
  path: string;
  label: string;
  scope: "global" | "project" | "other";
  exists: boolean;
  text: string;
  data: any;
  revision: string;
  error?: string;
};

async function loadConfigDocuments(directory?: string | null): Promise<ConfigDocument[]> {
  const paths = new Map<string, string>();
  const add = (path: string) => {
    if (!path) return;
    const abs = resolve(path);
    if (!paths.has(abs)) paths.set(abs, abs);
  };

  // opencode v2 knows all active document layers, including the project file.
  try {
    const entries = await ocData<any[]>("/api/config", {}, locationParams(directory));
    for (const entry of entries ?? []) {
      if (entry?.type === "document" && typeof entry.path === "string") add(entry.path);
    }
  } catch {}

  add(globalConfigFile());
  for (const path of projectConfigFiles(directory ?? "")) add(path);

  const docs: ConfigDocument[] = [];
  for (const path of paths.values()) {
    const text = readText(path) ?? "{\n}\n";
    let data: any = null;
    let error: string | undefined;
    try {
      data = parseJsonc(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        error = "config root must be an object";
        data = null;
      }
    } catch (e: any) {
      error = String(e?.message ?? e);
    }
    docs.push({
      path,
      label: configLabel(path, directory ?? ""),
      scope: configScope(path, directory ?? ""),
      exists: existsSync(path),
      text,
      data,
      revision: hash(text),
      error,
    });
  }
  docs.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "global" ? -1 : b.scope === "global" ? 1 : 0;
    return a.label.localeCompare(b.label);
  });
  return docs;
}

async function selectedDocument(
  directory?: string | null,
  requested?: string | null,
): Promise<{ docs: ConfigDocument[]; doc: ConfigDocument }> {
  const docs = await loadConfigDocuments(directory);
  const doc =
    (requested ? docs.find((d) => resolve(d.path) === resolve(requested)) : undefined) ??
    docs.find((d) => d.exists) ??
    docs[0];
  if (!doc) throw new WorkspaceError("no opencode config document found", 404);
  return { docs, doc };
}

async function writeConfig(
  path: string,
  text: string,
  directory: string | null | undefined,
  revision?: string | null,
): Promise<{ revision: string; path: string }> {
  if (!allowedConfigPath(path, directory ?? "")) {
    throw new WorkspaceError("path is not an allowed opencode config document", 403);
  }
  const current = readText(path);
  if (revision && current != null && hash(current) !== revision) {
    throw new WorkspaceError("config changed on disk; reload before saving", 409);
  }
  let data: any;
  try {
    data = parseJsonc(text);
  } catch (e: any) {
    throw new WorkspaceError(`invalid JSONC: ${e?.message ?? e}`, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new WorkspaceError("config root must be an object", 400);
  }
  writeAtomic(path, text);
  scheduleGithubAutoSync(directory ?? undefined);
  return { revision: hash(text), path };
}

const CONFIG_SECTIONS = new Set([
  "provider",
  "model",
  "small_model",
  "permission",
  "permissions",
  "lsp",
  "formatter",
  "agent",
  "agents",
  "command",
  "commands",
  "mcp",
  "plugins",
  "plugin",
  "instructions",
  "theme",
  "share",
  "keybinds",
  "disabled_providers",
  "enabled_providers",
]);

async function updateSections(
  path: string,
  directory: string | null | undefined,
  sections: Record<string, unknown>,
  revision?: string | null,
): Promise<{ revision: string; config: any; path: string }> {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    throw new WorkspaceError("sections must be an object", 400);
  }
  const current = readText(path);
  if (current == null) throw new WorkspaceError("config document not found", 404);
  if (revision && hash(current) !== revision) {
    throw new WorkspaceError("config changed on disk; reload before saving", 409);
  }
  let next = current;
  for (const [key, value] of Object.entries(sections)) {
    if (!CONFIG_SECTIONS.has(key)) throw new WorkspaceError(`unsupported config section: ${key}`);
    next = setRootValue(next, key, value);
  }
  const data = parseJsonc(next);
  const written = await writeConfig(path, next, directory, revision);
  return { ...written, config: data };
}

// ---------------------------------------------------------------------------
// CLI config / prompt / rules

function cliConfigPath(): string {
  return join(globalConfigDir(), "cli.json");
}

function cliConfig(): { path: string; exists: boolean; content: string; revision: string } {
  const path = cliConfigPath();
  const content = readText(path) ?? "{\n}\n";
  return { path, exists: existsSync(path), content, revision: hash(content) };
}

function saveCliConfig(content: string, revision?: string | null): { revision: string } {
  const path = cliConfigPath();
  const current = readText(path);
  if (revision && current != null && hash(current) !== revision) {
    throw new WorkspaceError("cli.json changed on disk; reload before saving", 409);
  }
  let data: any;
  try {
    data = JSON.parse(content);
  } catch (e: any) {
    throw new WorkspaceError(`invalid JSON: ${e?.message ?? e}`, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new WorkspaceError("cli.json root must be an object", 400);
  }
  writeAtomic(path, JSON.stringify(data, null, 2) + "\n");
  scheduleGithubAutoSync();
  return { revision: hash(JSON.stringify(data, null, 2) + "\n") };
}

function promptPath(): string {
  return join(globalConfigDir(), "AGENTS.md");
}

function promptFile(): { path: string; exists: boolean; content: string } {
  const path = promptPath();
  return { path, exists: existsSync(path), content: readText(path) ?? "" };
}

function rulesFile(directory: string): { path: string; source: string; exists: boolean; content: string } {
  if (!directory) throw new WorkspaceError("directory required", 400);
  const agents = join(directory, "AGENTS.md");
  const claude = join(directory, "CLAUDE.md");
  const path = existsSync(agents) ? agents : existsSync(claude) ? claude : agents;
  return {
    path,
    source: basename(path),
    exists: existsSync(path),
    content: readText(path) ?? "",
  };
}

function saveRules(directory: string, content: string, source?: string): { path: string } {
  const target = source === "CLAUDE.md" ? join(directory, "CLAUDE.md") : join(directory, "AGENTS.md");
  if (!isInside(directory, target)) throw new WorkspaceError("invalid rules path", 403);
  writeAtomic(target, content);
  scheduleGithubAutoSync(directory);
  return { path: target };
}

// ---------------------------------------------------------------------------
// resource discovery

type ResourceKind = "skills" | "commands" | "agents" | "plugins";
type ResourceScope = "global" | "project";

type ResourceRoot = {
  path: string;
  scope: ResourceScope;
  kind: ResourceKind;
  disabled: boolean;
};

const RESOURCE_PLURALS: Record<ResourceKind, string[]> = {
  skills: ["skills", "skill"],
  commands: ["commands", "command"],
  agents: ["agents", "agent"],
  plugins: ["plugins", "plugin"],
};

const RESOURCE_EXTS: Record<Exclude<ResourceKind, "skills">, string[]> = {
  commands: [".md", ".markdown"],
  agents: [".md", ".markdown"],
  plugins: [".js", ".ts", ".mjs", ".cjs"],
};

function resourceRoots(kind: ResourceKind, directory?: string | null): ResourceRoot[] {
  const roots: ResourceRoot[] = [];
  const seen = new Set<string>();
  const add = (path: string, scope: ResourceScope, disabled: boolean) => {
    const abs = resolve(path);
    const key = `${scope}:${abs}:${disabled}`;
    if (seen.has(key)) return;
    seen.add(key);
    roots.push({ path: abs, scope, kind, disabled });
  };
  const global = globalConfigDir();
  for (const plural of RESOURCE_PLURALS[kind]) {
    add(join(global, plural), "global", false);
    add(join(global, plural, ".aiman-disabled"), "global", true);
  }
  if (directory) {
    for (const plural of RESOURCE_PLURALS[kind]) {
      add(join(directory, plural), "project", false);
      add(join(directory, plural, ".aiman-disabled"), "project", true);
      add(join(directory, ".opencode", plural), "project", false);
      add(join(directory, ".opencode", plural, ".aiman-disabled"), "project", true);
    }
  }
  return roots;
}

function primaryRoot(kind: ResourceKind, scope: ResourceScope, directory?: string | null): ResourceRoot {
  const plurals = RESOURCE_PLURALS[kind];
  if (scope === "project") {
    if (!directory) throw new WorkspaceError("directory required for project resources", 400);
    const candidates = [
      ...plurals.map((name) => join(directory, ".opencode", name)),
      ...plurals.map((name) => join(directory, name)),
    ];
    return {
      path: candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!,
      scope: "project",
      kind,
      disabled: false,
    };
  }
  const candidates = plurals.map((name) => join(globalConfigDir(), name));
  return {
    path: candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!,
    scope: "global",
    kind,
    disabled: false,
  };
}

function parseFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return out;
  const lines = match[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (value === ">" || value === "|") {
      const folded: string[] = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]!)) {
        folded.push(lines[++i]!.trim());
      }
      value = folded.join(value === "|" ? "\n" : " ");
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    if (key) out[key] = value;
  }
  return out;
}

function resourceDescription(kind: ResourceKind, content: string, fallback: string): string {
  const meta = parseFrontmatter(content);
  if (meta.description) return meta.description;
  if (meta.prompt) return meta.prompt;
  return fallback;
}

function addSkillFrontmatter(name: string, content: string): string {
  if (/^\s*---\r?\n/.test(content)) return content;
  const first = content.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "") ?? name;
  return `---\ndescription: ${first.slice(0, 180)}\n---\n\n${content}`;
}

export type ResourceItem = {
  kind: ResourceKind;
  name: string;
  scope: ResourceScope | "config";
  path: string;
  enabled: boolean;
  editable: boolean;
  description: string;
  content: string;
  source: string;
};

function listRootResources(root: ResourceRoot): ResourceItem[] {
  if (!existsSync(root.path)) return [];
  const items: ResourceItem[] = [];
  let entries: ReturnType<typeof readdirSync> = [];
  try {
    entries = readdirSync(root.path, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(root.path, entry.name);
    try {
      if (root.kind === "skills") {
        if (entry.isDirectory()) {
          const skillPath = join(full, "SKILL.md");
          const content = readText(skillPath);
          if (content == null) continue;
          items.push({
            kind: root.kind,
            name: entry.name,
            scope: root.scope,
            path: skillPath,
            enabled: !root.disabled,
            editable: true,
            description: resourceDescription(root.kind, content, entry.name),
            content,
            source: root.disabled ? "disabled" : root.scope,
          });
        } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          const content = readText(full);
          if (content == null) continue;
          const name = entry.name.replace(/\.md$/i, "");
          items.push({
            kind: root.kind,
            name,
            scope: root.scope,
            path: full,
            enabled: !root.disabled,
            editable: true,
            description: resourceDescription(root.kind, content, name),
            content,
            source: root.disabled ? "disabled" : root.scope,
          });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!RESOURCE_EXTS[root.kind].includes(ext)) continue;
      const content = readText(full) ?? "";
      const name = entry.name.slice(0, -ext.length);
      items.push({
        kind: root.kind,
        name,
        scope: root.scope,
        path: full,
        enabled: !root.disabled,
        editable: true,
        description: resourceDescription(root.kind, content, name),
        content,
        source: root.disabled ? "disabled" : root.scope,
      });
    } catch {}
  }
  return items;
}

function configResources(
  kind: ResourceKind,
  docs: ConfigDocument[],
): ResourceItem[] {
  if (kind !== "agents" && kind !== "commands") return [];
  const items: ResourceItem[] = [];
  for (const doc of docs) {
    if (!doc.data) continue;
    const map =
      kind === "agents"
        ? (doc.data.agents && typeof doc.data.agents === "object"
            ? doc.data.agents
            : doc.data.agent && typeof doc.data.agent === "object"
              ? doc.data.agent
              : null)
        : doc.data.command && typeof doc.data.command === "object"
          ? doc.data.command
          : doc.data.commands && typeof doc.data.commands === "object"
            ? doc.data.commands
            : null;
    if (!map) continue;
    for (const [name, value] of Object.entries(map)) {
      if (!value || typeof value !== "object") continue;
      const obj = value as any;
      items.push({
        kind,
        name,
        scope: "config",
        path: doc.path,
        enabled: obj.disabled !== true,
        editable: true,
        description: String(obj.description ?? obj.prompt ?? "").slice(0, 240),
        content: JSON.stringify(value, null, 2),
        source: "config",
      });
    }
  }
  return items;
}

export async function listResources(
  kind: ResourceKind,
  directory?: string | null,
): Promise<ResourceItem[]> {
  const items: ResourceItem[] = [];
  for (const root of resourceRoots(kind, directory)) items.push(...listRootResources(root));
  if (kind === "agents" || kind === "commands") {
    const docs = await loadConfigDocuments(directory);
    items.push(...configResources(kind, docs));
  }
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.kind}\0${item.name}\0${item.scope}\0${item.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
}

function findResource(
  items: ResourceItem[],
  kind: ResourceKind,
  name: string,
  scope?: string | null,
  path?: string | null,
): ResourceItem {
  const exact = items.find(
    (item) =>
      item.kind === kind &&
      item.name === name &&
      (!scope || item.scope === scope) &&
      (!path || resolve(item.path) === resolve(path)),
  );
  if (exact) return exact;
  // A toggle may have moved the file since the client last refreshed. Fall back
  // to the stable kind/name/scope identity.
  const fallback = items.find(
    (item) => item.kind === kind && item.name === name && (!scope || item.scope === scope),
  );
  if (!fallback) throw new WorkspaceError(`${kind.slice(0, -1)} not found`, 404);
  return fallback;
}

function findResourceRoot(path: string, kind: ResourceKind, directory?: string | null): ResourceRoot {
  const resolved = resolve(path);
  const roots = resourceRoots(kind, directory).sort((a, b) => b.path.length - a.path.length);
  const root = roots.find((item) => isInside(item.path, resolved));
  if (!root) throw new WorkspaceError("resource is outside the allowed roots", 403);
  return root;
}

async function saveResource(body: any): Promise<ResourceItem> {
  const kind = String(body.kind ?? "") as ResourceKind;
  if (!["skills", "commands", "agents", "plugins"].includes(kind)) {
    throw new WorkspaceError("invalid resource kind");
  }
  const name = requireName(body.name);
  const content = String(body.content ?? "");
  const directory = typeof body.directory === "string" ? body.directory : null;
  const scope: ResourceScope = body.scope === "project" ? "project" : "global";
  const requestedPath = typeof body.path === "string" && body.path ? body.path : null;

  // Config-embedded agents/commands are edited as JSON objects, preserving the
  // rest of the config document.
  if (body.scope === "config") {
    if (kind !== "agents" && kind !== "commands") {
      throw new WorkspaceError("only agents and commands can be config-backed");
    }
    if (!requestedPath || !allowedConfigPath(requestedPath, directory ?? "")) {
      throw new WorkspaceError("invalid config path", 403);
    }
    const docs = await loadConfigDocuments(directory);
    const doc = docs.find((item) => resolve(item.path) === resolve(requestedPath));
    if (!doc || !doc.data) throw new WorkspaceError("config document not found", 404);
    let value: any;
    try {
      value = JSON.parse(content || "{}");
    } catch (e: any) {
      throw new WorkspaceError(`invalid JSON: ${e?.message ?? e}`, 400);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WorkspaceError("config-backed agent/command must be an object", 400);
    }
    const key =
      kind === "agents"
        ? doc.data.agents && typeof doc.data.agents === "object"
          ? "agents"
          : "agent"
        : doc.data.commands && typeof doc.data.commands === "object"
          ? "commands"
          : "command";
    const map = { ...(doc.data[key] && typeof doc.data[key] === "object" ? doc.data[key] : {}) };
    map[name] = value;
    await updateSections(doc.path, directory, { [key]: map }, doc.revision);
    return {
      kind,
      name,
      scope: "config",
      path: doc.path,
      enabled: value.disabled !== true,
      editable: true,
      description: String(value.description ?? value.prompt ?? "").slice(0, 240),
      content: JSON.stringify(value, null, 2),
      source: "config",
    };
  }

  let target = requestedPath;
  let reenable = false;
  if (target) {
    findResourceRoot(target, kind, directory);
  } else {
    const existing = (await listResources(kind, directory)).find(
      (item) => item.kind === kind && item.name === name && item.scope === scope,
    );
    if (existing && existing.editable) {
      target = existing.path;
      reenable = !existing.enabled;
    }
  }

  if (!target) {
    const root = primaryRoot(kind, scope, directory);
    const pluginExt = /^\.(ts|mjs|cjs|js)$/i.test(String(body.extension ?? ""))
      ? String(body.extension).toLowerCase()
      : ".js";
    target =
      kind === "skills"
        ? join(root.path, name, "SKILL.md")
        : join(root.path, name + (kind === "plugins" ? pluginExt : ".md"));
  }

  let text = content;
  if (kind === "skills") text = addSkillFrontmatter(name, content);
  writeAtomic(target, text);
  if (reenable) {
    const toggled = await toggleResource({
      kind,
      name,
      scope,
      path: target,
      directory,
      enabled: true,
    });
    target = toggled.path;
  }
  scheduleGithubAutoSync(directory ?? undefined);

  const root = findResourceRoot(target, kind, directory);
  return {
    kind,
    name,
    scope: root.scope,
    path: target,
    enabled: !root.disabled,
    editable: true,
    description: resourceDescription(kind, text, name),
    content: text,
    source: root.disabled ? "disabled" : root.scope,
  };
}

async function deleteResource(body: any): Promise<{ ok: boolean; path: string }> {
  const kind = String(body.kind ?? "") as ResourceKind;
  if (!["skills", "commands", "agents", "plugins"].includes(kind)) {
    throw new WorkspaceError("invalid resource kind");
  }
  const name = requireName(body.name);
  const directory = typeof body.directory === "string" ? body.directory : null;
  const items = await listResources(kind, directory);
  const item = findResource(items, kind, name, body.scope, body.path);
  if (!item.editable) throw new WorkspaceError("config-backed items must be edited in Raw Config", 400);
  const root = findResourceRoot(item.path, kind, directory);
  let target = item.path;
  if (kind === "skills" && basename(target).toLowerCase() === "skill.md") {
    target = dirname(target);
  }
  if (resolve(target) === resolve(root.path)) throw new WorkspaceError("refusing to delete a root", 400);
  rmSync(target, { recursive: true, force: true });
  if (kind === "skills") removeIfEmpty(dirname(target));
  scheduleGithubAutoSync(directory ?? undefined);
  return { ok: true, path: target };
}

async function toggleResource(body: any): Promise<{ ok: boolean; enabled: boolean; path: string }> {
  const kind = String(body.kind ?? "") as ResourceKind;
  if (!["skills", "commands", "agents", "plugins"].includes(kind)) {
    throw new WorkspaceError("invalid resource kind");
  }
  const name = requireName(body.name);
  const directory = typeof body.directory === "string" ? body.directory : null;
  const items = await listResources(kind, directory);
  const item = findResource(items, kind, name, body.scope, body.path);
  if (!item.editable) throw new WorkspaceError("config-backed items must be edited in Raw Config", 400);
  const targetEnabled = body.enabled !== undefined ? !!body.enabled : !item.enabled;
  if (targetEnabled === item.enabled) return { ok: true, enabled: item.enabled, path: item.path };

  const root = findResourceRoot(item.path, kind, directory);
  let source = item.path;
  if (kind === "skills" && basename(source).toLowerCase() === "skill.md") source = dirname(source);
  const relativePath = relative(root.path, source);
  let destination: string;
  if (targetEnabled) {
    if (!root.disabled) return { ok: true, enabled: item.enabled, path: item.path };
    const normalRoot = dirname(root.path);
    destination = join(normalRoot, relativePath);
  } else {
    destination = join(root.path, ".aiman-disabled", relativePath);
  }
  if (existsSync(destination)) throw new WorkspaceError("a resource with that name already exists", 409);
  mkdirSync(dirname(destination), { recursive: true });
  try {
    renameSync(source, destination);
  } catch {
    writeFileSync(destination, readFileSync(source));
    rmSync(source, { recursive: true, force: true });
  }
  if (kind === "skills") removeIfEmpty(dirname(source));
  scheduleGithubAutoSync(directory ?? undefined);
  return { ok: true, enabled: targetEnabled, path: destination };
}

async function importResources(body: any): Promise<{ imported: ResourceItem[]; errors: string[] }> {
  const kind = String(body.kind ?? "") as ResourceKind;
  if (kind !== "skills" && kind !== "plugins") {
    throw new WorkspaceError("bulk import supports skills and plugins");
  }
  const urls = Array.isArray(body.urls) ? body.urls.map(String).filter(Boolean) : [];
  if (!urls.length) throw new WorkspaceError("urls required");
  if (urls.length > 50) throw new WorkspaceError("maximum 50 urls per import");
  const directory = typeof body.directory === "string" ? body.directory : null;
  const scope: ResourceScope = body.scope === "project" ? "project" : "global";
  const imported: ResourceItem[] = [];
  const errors: string[] = [];
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http(s) urls");
      const res = await fetch(url, { headers: { "user-agent": "aiman-workspace" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).slice(0, 1_000_000);
      let name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
      if (/^skill\.md$/i.test(name)) {
        const parts = url.pathname.split("/").filter(Boolean);
        name = decodeURIComponent(parts[parts.length - 2] ?? "skill");
      }
      name = name.replace(/\.(md|js|ts|mjs|cjs)$/i, "");
      const ext = kind === "plugins" ? (url.pathname.match(/\.(ts|mjs|cjs|js)$/i)?.[0] ?? ".js") : "";
      const item = await saveResource({
        kind,
        name,
        content: text,
        directory,
        scope,
        path: null,
        ...(kind === "plugins" ? { extension: ext } : {}),
      });
      imported.push(item);
    } catch (e: any) {
      errors.push(`${raw}: ${String(e?.message ?? e)}`);
    }
  }
  return { imported, errors };
}

// ---------------------------------------------------------------------------
// presets

export type WorkspacePreset = {
  id: string;
  name: string;
  skills: string[];
  commands: string[];
  agents: string[];
  plugins: string[];
  mcp: string[];
  updatedAt: number;
};

const PROFILES_KEY = "workspace_profiles";

type WorkspaceProfile = {
  id: string;
  name: string;
  createdAt: number;
  backup: BackupData;
};

function readWorkspaceProfiles(): WorkspaceProfile[] {
  try {
    const parsed = JSON.parse(getSetting(PROFILES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkspaceProfiles(profiles: WorkspaceProfile[]): void {
  setSetting(PROFILES_KEY, JSON.stringify(profiles));
}

const PRESETS_KEY = "workspace_presets";

function readPresets(): WorkspacePreset[] {
  try {
    const parsed = JSON.parse(getSetting(PRESETS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(presets: WorkspacePreset[]): void {
  setSetting(PRESETS_KEY, JSON.stringify(presets));
}

function presetPayload(body: any, existing?: WorkspacePreset): WorkspacePreset {
  const list = (value: unknown) =>
    Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  return {
    id: existing?.id ?? `pre_${crypto.randomUUID()}`,
    name: String(body.name ?? existing?.name ?? "preset").trim() || "preset",
    skills: body.skills !== undefined ? list(body.skills) : (existing?.skills ?? []),
    commands: body.commands !== undefined ? list(body.commands) : (existing?.commands ?? []),
    agents: body.agents !== undefined ? list(body.agents) : (existing?.agents ?? []),
    plugins: body.plugins !== undefined ? list(body.plugins) : (existing?.plugins ?? []),
    mcp: body.mcp !== undefined ? list(body.mcp) : (existing?.mcp ?? []),
    updatedAt: Date.now(),
  };
}

async function applyPreset(
  preset: WorkspacePreset,
  mode: "exclusive" | "additive",
  directory?: string | null,
): Promise<{ changed: number; errors: string[] }> {
  const errors: string[] = [];
  let changed = 0;
  const groups: Array<[ResourceKind, string[]]> = [
    ["skills", preset.skills],
    ["commands", preset.commands],
    ["agents", preset.agents],
    ["plugins", preset.plugins],
  ];
  for (const [kind, selected] of groups) {
    const items = await listResources(kind, directory);
    for (const item of items) {
      if (!item.editable) continue;
      const shouldEnable = selected.includes(item.name) || (mode === "additive" && item.enabled);
      if (mode === "exclusive" && !selected.includes(item.name)) {
        if (item.enabled) {
          try {
            await toggleResource({
              kind,
              name: item.name,
              scope: item.scope,
              path: item.path,
              directory,
              enabled: false,
            });
            changed++;
          } catch (e: any) {
            errors.push(`${kind}/${item.name}: ${String(e?.message ?? e)}`);
          }
        }
      } else if (shouldEnable && !item.enabled) {
        try {
          await toggleResource({
            kind,
            name: item.name,
            scope: item.scope,
            path: item.path,
            directory,
            enabled: true,
          });
          changed++;
        } catch (e: any) {
          errors.push(`${kind}/${item.name}: ${String(e?.message ?? e)}`);
        }
      }
    }
  }

  // MCP toggles live in the config document, not as files.
  const docs = await loadConfigDocuments(directory);
  for (const doc of docs) {
    if (!doc.exists || !doc.data?.mcp || typeof doc.data.mcp !== "object") continue;
    const current = doc.data.mcp;
    const nextMcp: Record<string, any> = { ...current };
    const nextMcpEntry: Record<string, any> = {};
    let touched = false;
    const update = (name: string, config: any) => {
      if (!config || typeof config !== "object") return;
      const disabled =
        mode === "exclusive"
          ? !preset.mcp.includes(name)
          : preset.mcp.includes(name)
            ? false
            : config.disabled === true;
      if (config.disabled !== disabled || config.enabled === disabled) {
        nextMcpEntry[name] = { ...config, disabled, enabled: !disabled };
        touched = true;
      }
    };
    if (current.servers && typeof current.servers === "object") {
      for (const [name, config] of Object.entries(current.servers)) update(name, config);
      if (Object.keys(nextMcpEntry).length) nextMcp.servers = { ...current.servers, ...nextMcpEntry };
    } else {
      for (const [name, config] of Object.entries(current)) {
        if (name === "timeout" || name === "servers") continue;
        update(name, config);
      }
      Object.assign(nextMcp, nextMcpEntry);
    }
    if (touched) {
      try {
        const nextText = setRootValue(doc.text, "mcp", nextMcp);
        await writeConfig(doc.path, nextText, directory, doc.revision);
        changed++;
      } catch (e: any) {
        errors.push(`${doc.label}: ${String(e?.message ?? e)}`);
      }
    }
  }
  return { changed, errors };
}

// ---------------------------------------------------------------------------
// backup / restore

export type BackupData = {
  version: 1;
  createdAt: number;
  configs: { path: string; text: string }[];
  cli: { path: string; exists: boolean; content: string };
  prompt: { path: string; exists: boolean; content: string };
  rules: { path: string; source: string; content: string } | null;
  resources: { kind: ResourceKind; name: string; scope: ResourceScope; enabled: boolean; content: string }[];
  presets: WorkspacePreset[];
};

async function makeBackup(directory?: string | null): Promise<BackupData> {
  const docs = await loadConfigDocuments(directory);
  const resources: BackupData["resources"] = [];
  for (const kind of ["skills", "commands", "agents", "plugins"] as ResourceKind[]) {
    for (const item of await listResources(kind, directory)) {
      if (!item.editable) continue;
      resources.push({
        kind,
        name: item.name,
        scope: item.scope as ResourceScope,
        enabled: item.enabled,
        content: item.content,
      });
    }
  }
  return {
    version: 1,
    createdAt: Date.now(),
    configs: docs.filter((doc) => doc.exists).map((doc) => ({ path: doc.path, text: doc.text })),
    cli: cliConfig(),
    prompt: promptFile(),
    rules: directory ? rulesFile(directory) : null,
    resources,
    presets: readPresets(),
  };
}

async function restoreBackup(body: any): Promise<{ restored: number; skipped: string[] }> {
  const directory = typeof body.directory === "string" ? body.directory : null;
  const data = body.backup as BackupData;
  if (!data || data.version !== 1) throw new WorkspaceError("unsupported backup format", 400);
  let restored = 0;
  const skipped: string[] = [];

  for (const doc of Array.isArray(data.configs) ? data.configs : []) {
    try {
      if (!allowedConfigPath(doc.path, directory ?? "")) {
        skipped.push(`${doc.path}: not an allowed config path`);
        continue;
      }
      const data = parseJsonc(doc.text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        skipped.push(`${doc.path}: config root must be an object`);
        continue;
      }
      writeAtomic(doc.path, doc.text);
      restored++;
    } catch (e: any) {
      skipped.push(`${doc.path}: ${String(e?.message ?? e)}`);
    }
  }
  if (data.cli?.exists && data.cli.content) {
    try {
      const parsed = JSON.parse(data.cli.content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("cli.json root must be an object");
      }
      writeAtomic(cliConfigPath(), data.cli.content);
      restored++;
    } catch (e: any) {
      skipped.push(`cli.json: ${String(e?.message ?? e)}`);
    }
  }
  if (data.prompt?.exists !== false && data.prompt?.content) {
    try {
      writeAtomic(promptPath(), data.prompt.content);
      restored++;
    } catch (e: any) {
      skipped.push(`AGENTS.md: ${String(e?.message ?? e)}`);
    }
  }
  if (directory && data.rules?.content) {
    try {
      writeAtomic(join(directory, data.rules.source === "CLAUDE.md" ? "CLAUDE.md" : "AGENTS.md"), data.rules.content);
      restored++;
    } catch (e: any) {
      skipped.push(`rules: ${String(e?.message ?? e)}`);
    }
  }
  for (const item of Array.isArray(data.resources) ? data.resources : []) {
    try {
      if (!["skills", "commands", "agents", "plugins"].includes(item.kind)) {
        skipped.push(`${item.kind}/${item.name}: invalid kind`);
        continue;
      }
      const saved = await saveResource({
        kind: item.kind,
        name: item.name,
        content: item.content,
        scope: item.scope,
        directory,
      });
      if (item.enabled === false) {
        await toggleResource({
          kind: saved.kind,
          name: saved.name,
          scope: saved.scope,
          path: saved.path,
          directory,
          enabled: false,
        });
      }
      restored++;
    } catch (e: any) {
      skipped.push(`${item.kind}/${item.name}: ${String(e?.message ?? e)}`);
    }
  }
  if (Array.isArray(data.presets)) writePresets(data.presets);
  scheduleGithubAutoSync(directory ?? undefined);
  return { restored, skipped };
}

// ---------------------------------------------------------------------------
// GitHub sync

type GithubConfig = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  autoSync: boolean;
};

const GITHUB_KEY = "workspace_github";

function githubConfig(): GithubConfig {
  let parsed: any = {};
  try {
    parsed = JSON.parse(getSetting(GITHUB_KEY) ?? "{}");
  } catch {}
  return {
    owner: String(parsed.owner ?? ""),
    repo: String(parsed.repo ?? ""),
    branch: String(parsed.branch ?? "main"),
    path: String(parsed.path ?? "aiman-workspace-backup.json"),
    autoSync: !!parsed.autoSync,
  };
}

function saveGithubConfig(patch: any): GithubConfig {
  const next = { ...githubConfig(), ...patch };
  setSetting(GITHUB_KEY, JSON.stringify(next));
  return next;
}

function gh(args: string[]): { ok: boolean; out: string } {
  try {
    const proc = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
    return {
      ok: proc.success,
      out: (proc.stdout?.toString() ?? "") + (proc.stderr?.toString() ?? ""),
    };
  } catch (e) {
    return { ok: false, out: String(e) };
  }
}

function githubStatus(): any {
  const version = gh(["--version"]);
  if (!version.ok) return { installed: false, authenticated: false, error: version.out.trim() };
  const auth = gh(["auth", "status"]);
  const user = auth.ok ? gh(["api", "user", "--jq", ".login"]) : { ok: false, out: "" };
  return {
    installed: true,
    authenticated: auth.ok,
    user: user.ok ? user.out.trim() : null,
    detail: auth.out.trim(),
    config: githubConfig(),
  };
}

async function githubToken(): Promise<string> {
  const result = gh(["auth", "token"]);
  if (!result.ok) throw new WorkspaceError("gh is not authenticated; run `gh auth login`", 400);
  return result.out.trim();
}

function githubHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "aiman-workspace",
  };
}

async function githubPush(directory?: string | null): Promise<any> {
  const config = githubConfig();
  if (!config.owner || !config.repo) throw new WorkspaceError("GitHub owner and repo are required", 400);
  const token = await githubToken();
  const backup = await makeBackup(directory);
  const content = Buffer.from(JSON.stringify(backup, null, 2)).toString("base64");
  const apiPath = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  let sha: string | undefined;
  const existing = await fetch(`${apiPath}?ref=${encodeURIComponent(config.branch)}`, {
    headers: githubHeaders(token),
  });
  if (existing.ok) {
    const body: any = await existing.json().catch(() => null);
    sha = body?.sha;
  } else if (existing.status !== 404) {
    throw new WorkspaceError(`GitHub read failed: ${existing.status} ${await existing.text()}`, 502);
  }
  const res = await fetch(apiPath, {
    method: "PUT",
    headers: { ...githubHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      message: `AiMAN workspace backup ${localDate()}`,
      content,
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new WorkspaceError(`GitHub push failed: ${res.status} ${await res.text()}`, 502);
  const body: any = await res.json().catch(() => null);
  return { ok: true, url: body?.content?.html_url ?? null };
}

async function githubPull(directory?: string | null): Promise<any> {
  const config = githubConfig();
  if (!config.owner || !config.repo) throw new WorkspaceError("GitHub owner and repo are required", 400);
  const token = await githubToken();
  const apiPath = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(config.branch)}`;
  const res = await fetch(apiPath, { headers: githubHeaders(token) });
  if (!res.ok) throw new WorkspaceError(`GitHub pull failed: ${res.status} ${await res.text()}`, 502);
  const body: any = await res.json();
  const text = Buffer.from(String(body.content ?? "").replace(/\s/g, ""), "base64").toString("utf8");
  const backup = JSON.parse(text);
  const result = await restoreBackup({ directory, backup });
  return { ok: true, ...result, url: body.html_url ?? null };
}

let githubTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleGithubAutoSync(directory?: string): void {
  const config = githubConfig();
  if (!config.autoSync || !config.owner || !config.repo) return;
  if (githubTimer) clearTimeout(githubTimer);
  githubTimer = setTimeout(() => {
    githubTimer = null;
    void githubPush(directory).catch((e) => console.warn("[workspace] auto-sync failed:", String(e)));
  }, 4000);
}

// ---------------------------------------------------------------------------
// provider credentials

function readAuthFile(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(OPENCODE_AUTH, "utf8"));
  } catch {
    return {};
  }
}

function authProviders(): any[] {
  const auth = readAuthFile();
  return Object.entries(auth).map(([id, value]) => {
    const entry = value as any;
    const key = String(entry?.key ?? "");
    return {
      id,
      name: id,
      type: entry?.type ?? (key ? "api" : "oauth"),
      hasAuth: !!(key || entry),
      hint: key ? `••••${key.slice(-4)}` : entry?.type === "oauth" ? "OAuth" : "(set)",
    };
  });
}

function writeAuthEntry(provider: string, entry: any): void {
  const auth = readAuthFile();
  auth[provider] = entry;
  writeAtomic(OPENCODE_AUTH, JSON.stringify(auth, null, 2) + "\n");
  // Best-effort runtime update; release/restart applies the file regardless.
  void (async () => {
    try {
      await fetch(`${OPENCODE_URL}/auth/${encodeURIComponent(provider)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch {}
  })();
}

function deleteAuthEntry(provider: string): void {
  const auth = readAuthFile();
  delete auth[provider];
  writeAtomic(OPENCODE_AUTH, JSON.stringify(auth, null, 2) + "\n");
  void (async () => {
    try {
      await fetch(`${OPENCODE_URL}/auth/${encodeURIComponent(provider)}`, { method: "DELETE" });
    } catch {}
  })();
}

// ---------------------------------------------------------------------------
// HTTP surface

export async function handleWorkspace(req: Request, url: URL): Promise<Response> {
  const method = req.method.toUpperCase();
  const path = url.pathname;

  try {
    if (path === "/api/workspace" && method === "GET") {
      const directory = url.searchParams.get("directory");
      const docs = await loadConfigDocuments(directory);
      const counts: Record<string, number> = {};
      for (const kind of ["skills", "commands", "agents", "plugins"] as ResourceKind[]) {
        counts[kind] = (await listResources(kind, directory)).length;
      }
      return json({
        v2: isV2(),
        paths: {
          globalConfig: globalConfigFile(),
          configDir: globalConfigDir(),
          cli: cliConfigPath(),
          prompt: promptPath(),
          auth: OPENCODE_AUTH,
          home: AIMAN_HOME,
        },
        configs: docs.map((doc) => ({
          path: doc.path,
          label: doc.label,
          scope: doc.scope,
          exists: doc.exists,
          revision: doc.revision,
          error: doc.error,
        })),
        counts,
        github: githubStatus(),
      });
    }

    if (path === "/api/workspace/config" && method === "GET") {
      const directory = url.searchParams.get("directory");
      const requested = url.searchParams.get("path");
      const { docs, doc } = await selectedDocument(directory, requested);
      return json({
        docs: docs.map((item) => ({
          path: item.path,
          label: item.label,
          scope: item.scope,
          exists: item.exists,
          revision: item.revision,
          error: item.error,
        })),
        selected: doc,
      });
    }

    if (path === "/api/workspace/config" && method === "PUT") {
      const body = await readRequest(req);
      const written = await writeConfig(
        String(body.path ?? ""),
        String(body.content ?? ""),
        typeof body.directory === "string" ? body.directory : null,
        typeof body.revision === "string" ? body.revision : undefined,
      );
      return json({ ok: true, ...written });
    }

    if (path === "/api/workspace/config/sections" && method === "PUT") {
      const body = await readRequest(req);
      const written = await updateSections(
        String(body.path ?? ""),
        typeof body.directory === "string" ? body.directory : null,
        body.sections,
        typeof body.revision === "string" ? body.revision : undefined,
      );
      return json({ ok: true, ...written });
    }

    if (path === "/api/workspace/cli" && method === "GET") return json(cliConfig());
    if (path === "/api/workspace/cli" && method === "PUT") {
      const body = await readRequest(req);
      return json({ ok: true, ...saveCliConfig(String(body.content ?? ""), body.revision) });
    }

    if (path === "/api/workspace/prompt" && method === "GET") return json(promptFile());
    if (path === "/api/workspace/prompt" && method === "PUT") {
      const body = await readRequest(req);
      writeAtomic(promptPath(), String(body.content ?? ""));
      scheduleGithubAutoSync();
      return json({ ok: true, path: promptPath() });
    }

    if (path === "/api/workspace/rules" && method === "GET") {
      return json(rulesFile(String(url.searchParams.get("directory") ?? "")));
    }
    if (path === "/api/workspace/rules" && method === "PUT") {
      const body = await readRequest(req);
      const directory = String(body.directory ?? "");
      if (!directory) throw new WorkspaceError("directory required");
      return json({
        ok: true,
        ...saveRules(directory, String(body.content ?? ""), body.source),
      });
    }

    if (path === "/api/workspace/resources" && method === "GET") {
      const directory = url.searchParams.get("directory");
      const requested = url.searchParams.get("kind");
      const kinds = requested
        ? [requested as ResourceKind]
        : (["skills", "commands", "agents", "plugins"] as ResourceKind[]);
      const out: Record<string, ResourceItem[]> = {};
      for (const kind of kinds) {
        if (!["skills", "commands", "agents", "plugins"].includes(kind)) {
          throw new WorkspaceError("invalid resource kind");
        }
        out[kind] = await listResources(kind, directory);
      }
      return json({ resources: out });
    }

    if (path === "/api/workspace/resource" && method === "POST") {
      const body = await readRequest(req);
      return json({ ok: true, item: await saveResource(body) });
    }
    if (path === "/api/workspace/resource" && method === "DELETE") {
      const body = await readRequest(req);
      return json(await deleteResource(body));
    }
    if (path === "/api/workspace/resource/toggle" && method === "POST") {
      return json(await toggleResource(await readRequest(req)));
    }
    if (path === "/api/workspace/resources/import" && method === "POST") {
      return json({ ok: true, ...(await importResources(await readRequest(req))) });
    }

    if (path === "/api/workspace/presets" && method === "GET") {
      return json({ presets: readPresets() });
    }
    if (path === "/api/workspace/presets" && method === "POST") {
      const body = await readRequest(req);
      const presets = readPresets();
      const preset = presetPayload(body);
      presets.push(preset);
      writePresets(presets);
      return json({ ok: true, preset }, 201);
    }
    let presetMatch = path.match(/^\/api\/workspace\/presets\/([^/]+)$/);
    if (presetMatch) {
      const id = decodeURIComponent(presetMatch[1]!);
      const presets = readPresets();
      const index = presets.findIndex((preset) => preset.id === id);
      if (index < 0) throw new WorkspaceError("preset not found", 404);
      if (method === "PUT") {
        const next = presetPayload(await readRequest(req), presets[index]);
        presets[index] = next;
        writePresets(presets);
        return json({ ok: true, preset: next });
      }
      if (method === "DELETE") {
        presets.splice(index, 1);
        writePresets(presets);
        return json({ ok: true });
      }
    }
    presetMatch = path.match(/^\/api\/workspace\/presets\/([^/]+)\/apply$/);
    if (presetMatch && method === "POST") {
      const id = decodeURIComponent(presetMatch[1]!);
      const preset = readPresets().find((item) => item.id === id);
      if (!preset) throw new WorkspaceError("preset not found", 404);
      const body = await readRequest(req);
      const mode = body.mode === "exclusive" ? "exclusive" : "additive";
      return json({
        ok: true,
        ...(await applyPreset(preset, mode, typeof body.directory === "string" ? body.directory : null)),
      });
    }

    if (path === "/api/workspace/profiles" && method === "GET") {
      return json({
        profiles: readWorkspaceProfiles().map((profile) => ({
          id: profile.id,
          name: profile.name,
          createdAt: profile.createdAt,
          counts: {
            configs: profile.backup.configs?.length ?? 0,
            resources: profile.backup.resources?.length ?? 0,
          },
        })),
      });
    }
    if (path === "/api/workspace/profiles" && method === "POST") {
      const body = await readRequest(req);
      const name = String(body.name ?? "").trim();
      if (!name) throw new WorkspaceError("profile name is required");
      const backup = await makeBackup(typeof body.directory === "string" ? body.directory : null);
      const profile: WorkspaceProfile = {
        id: `wsp_${crypto.randomUUID()}`,
        name,
        createdAt: Date.now(),
        backup,
      };
      const profiles = readWorkspaceProfiles();
      profiles.push(profile);
      writeWorkspaceProfiles(profiles);
      return json({ ok: true, profile: { id: profile.id, name: profile.name, createdAt: profile.createdAt } }, 201);
    }
    let workspaceProfile = path.match(/^\/api\/workspace\/profiles\/([^/]+)$/);
    if (workspaceProfile) {
      const id = decodeURIComponent(workspaceProfile[1]!);
      const profiles = readWorkspaceProfiles();
      const index = profiles.findIndex((profile) => profile.id === id);
      if (index < 0) throw new WorkspaceError("profile not found", 404);
      if (method === "DELETE") {
        profiles.splice(index, 1);
        writeWorkspaceProfiles(profiles);
        return json({ ok: true });
      }
    }
    workspaceProfile = path.match(/^\/api\/workspace\/profiles\/([^/]+)\/apply$/);
    if (workspaceProfile && method === "POST") {
      const id = decodeURIComponent(workspaceProfile[1]!);
      const profile = readWorkspaceProfiles().find((item) => item.id === id);
      if (!profile) throw new WorkspaceError("profile not found", 404);
      const body = await readRequest(req);
      return json({
        ok: true,
        ...(await restoreBackup({
          backup: profile.backup,
          directory: typeof body.directory === "string" ? body.directory : null,
        })),
      });
    }

    if (path === "/api/workspace/backup" && method === "GET") {
      const directory = url.searchParams.get("directory");
      return json(await makeBackup(directory));
    }
    if (path === "/api/workspace/restore" && method === "POST") {
      const body = await readRequest(req);
      return json({ ok: true, ...(await restoreBackup(body)) });
    }

    if (path === "/api/workspace/github" && method === "GET") {
      return json(githubStatus());
    }
    if (path === "/api/workspace/github" && method === "PUT") {
      return json({ ok: true, config: saveGithubConfig(await readRequest(req)) });
    }
    if (path === "/api/workspace/github/push" && method === "POST") {
      const body = await readRequest(req);
      return json(await githubPush(typeof body.directory === "string" ? body.directory : null));
    }
    if (path === "/api/workspace/github/pull" && method === "POST") {
      const body = await readRequest(req);
      return json(await githubPull(typeof body.directory === "string" ? body.directory : null));
    }

    if (path === "/api/workspace/auth" && method === "GET") {
      return json({ providers: authProviders(), authPath: OPENCODE_AUTH });
    }
    if (path === "/api/workspace/auth" && method === "PUT") {
      const body = await readRequest(req);
      const provider = String(body.provider ?? "").trim();
      if (!provider) throw new WorkspaceError("provider required");
      if (body.type === "oauth") writeAuthEntry(provider, { type: "oauth", ...(body.auth ?? {}) });
      else {
        const key = String(body.key ?? "").trim();
        if (!key) throw new WorkspaceError("key required");
        writeAuthEntry(provider, { type: "api", key });
      }
      return json({ ok: true, providers: authProviders() });
    }
    if (path === "/api/workspace/auth" && method === "DELETE") {
      const provider = String(url.searchParams.get("provider") ?? "").trim();
      if (!provider) throw new WorkspaceError("provider required");
      deleteAuthEntry(provider);
      return json({ ok: true, providers: authProviders() });
    }

    return json({ error: "not found" }, 404);
  } catch (e: any) {
    if (e instanceof WorkspaceError) return json({ error: e.message }, e.status);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
