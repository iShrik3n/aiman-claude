import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { isV2 } from "./db";
import { locationParams, ocData } from "./ocClient";
import { parseJsonc, setRootValue } from "./jsonc";

/**
 * opencode extension management (MCP servers + plugins).
 *
 * The v2 API can add/remove MCP servers at runtime, but those changes vanish
 * when opencode restarts. We therefore apply them to the active opencode
 * config document as well. opencode watches that file and reloads it
 * automatically, so edits take effect without restarting the server.
 */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

type McpServerInfo = {
  name: string;
  status: { status: string; error?: string };
  integrationID?: string;
};

type PluginInfo = {
  id?: string;
  source: { type: string; target?: string; version?: string; outdated?: boolean; updating?: boolean; path?: string };
  features?: Record<string, boolean>;
  state?: { status: string; error?: string; ref?: string };
};

type ConfigDocument = {
  path: string;
  text: string;
  data: any;
};

type PluginConfigEntry = {
  target: string;
  array: "plugins" | "plugin";
  entry: any;
  index: number;
  configPath: string;
};

type McpConfigEntry = {
  name: string;
  config: any;
  configPath: string;
};

const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  return norm(a) === norm(b);
}

function selectedDirectory(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    return existsSync(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function readDocument(path: string): Promise<ConfigDocument | null> {
  try {
    if (!existsSync(path)) return null;
    const text = await Bun.file(path).text();
    return { path, text, data: parseJsonc(text) };
  } catch {
    return null;
  }
}

/** Load the document layers opencode uses for a location, lowest first. */
async function loadDocuments(directory: string | null): Promise<ConfigDocument[]> {
  const entries = await ocData<any[]>("/api/config", {}, locationParams(directory));
  const docs: ConfigDocument[] = [];
  for (const entry of entries ?? []) {
    if (entry?.type !== "document" || !entry.path) continue;
    if (!existsSync(entry.path)) {
      // opencode lists the config document even when the file has not been
      // created yet. Keep an empty in-memory document; mutations create it.
      docs.push({ path: entry.path, text: "{\n}\n", data: {} });
      continue;
    }
    const doc = await readDocument(entry.path);
    if (doc) docs.push(doc);
  }
  return docs;
}

function mcpEntries(doc: ConfigDocument): McpConfigEntry[] {
  const mcp = isObject(doc.data?.mcp) ? doc.data.mcp : {};
  const out: McpConfigEntry[] = [];
  // Legacy layout: mcp: { "server-name": { ... } }
  for (const [name, config] of Object.entries(mcp)) {
    if (name === "servers" || name === "timeout" || !isObject(config)) continue;
    out.push({ name, config, configPath: doc.path });
  }
  // Canonical layout: mcp: { servers: { "server-name": { ... } } }
  if (isObject(mcp.servers)) {
    for (const [name, config] of Object.entries(mcp.servers)) {
      if (!isObject(config)) continue;
      const i = out.findIndex((x) => x.name === name);
      const entry = { name, config, configPath: doc.path };
      if (i >= 0) out[i] = entry;
      else out.push(entry);
    }
  }
  return out;
}

/** Strip a version suffix from a package spec, leaving local paths alone. */
function pluginName(spec: string): string {
  const s = spec.trim();
  if (!s) return s;
  if (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || s.startsWith("~/") || s.startsWith("\\\\")) {
    return s;
  }
  if (s.startsWith("@")) {
    const slash = s.indexOf("/");
    if (slash < 0) return s;
    const at = s.indexOf("@", slash);
    return at > 0 ? s.slice(0, at) : s;
  }
  const at = s.lastIndexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

function samePlugin(a: string, b: string): boolean {
  return a === b || pluginName(a) === pluginName(b);
}

function pluginEntries(doc: ConfigDocument): PluginConfigEntry[] {
  const out: PluginConfigEntry[] = [];
  if (Array.isArray(doc.data?.plugins)) {
    doc.data.plugins.forEach((entry: any, index: number) => {
      const target =
        typeof entry === "string" ? entry : isObject(entry) ? String(entry.package ?? "") : "";
      if (target) out.push({ target, array: "plugins", entry, index, configPath: doc.path });
    });
  }
  // Deprecated `plugin` array: ["pkg", ["pkg", { options }]]
  if (Array.isArray(doc.data?.plugin)) {
    doc.data.plugin.forEach((entry: any, index: number) => {
      const target = Array.isArray(entry)
        ? String(entry[0] ?? "")
        : typeof entry === "string"
          ? entry
          : "";
      if (target) out.push({ target, array: "plugin", entry, index, configPath: doc.path });
    });
  }
  return out;
}

function allMcpEntries(docs: ConfigDocument[]): McpConfigEntry[] {
  const byName = new Map<string, McpConfigEntry>();
  for (const doc of docs) for (const entry of mcpEntries(doc)) byName.set(entry.name, entry);
  return [...byName.values()];
}

function allPluginEntries(docs: ConfigDocument[]): PluginConfigEntry[] {
  const seen = new Set<string>();
  const out: PluginConfigEntry[] = [];
  for (const doc of docs) {
    for (const entry of pluginEntries(doc)) {
      const key = `${entry.array}\0${entry.target}\0${doc.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

function pickConfigPath(docs: ConfigDocument[], requested?: string | null): ConfigDocument {
  if (!docs.length) throw new Error("opencode has no config document to edit");
  if (requested) {
    const found = docs.find((d) => samePath(d.path, requested));
    if (!found) throw new Error("config path is not an opencode config document");
    return found;
  }
  // Prefer the global document, which is normally the first layer. If the
  // global document has no extension settings, prefer the first one that does.
  const withExtensions = docs.find(
    (d) => mcpEntries(d).length > 0 || pluginEntries(d).length > 0,
  );
  return withExtensions ?? docs[0]!;
}

function configLabel(path: string): string {
  const file = basename(path);
  const parent = basename(resolve(path, ".."));
  return `${file} (${parent})`;
}

async function writeDocument(doc: ConfigDocument, key: "mcp" | "plugins", value: unknown) {
  const next = setRootValue(doc.text, key, value);
  // Validate before touching the real file, and keep one rollback copy.
  parseJsonc(next);
  try {
    await Bun.write(doc.path + ".aiman.bak", doc.text);
  } catch {}
  // Write next to the target and rename so readers never see a half-written
  // config. (opencode's watcher also sees the rename as a single change.)
  const temp = doc.path + ".aiman.tmp";
  await mkdir(dirname(doc.path), { recursive: true });
  await Bun.write(temp, next);
  try {
    await rename(temp, doc.path);
  } catch {
    await Bun.write(doc.path, next);
    try {
      await unlink(temp);
    } catch {}
  }
  doc.text = next;
  doc.data = parseJsonc(next);
}

function ensureMcpObject(data: any): Record<string, any> {
  if (!isObject(data.mcp)) data.mcp = {};
  return data.mcp;
}

function findMcpContainer(data: any, name: string): { container: Record<string, any>; legacy: boolean } {
  const mcp = ensureMcpObject(data);
  if (isObject(mcp.servers)) {
    if (isObject(mcp.servers[name]) || !isObject(mcp[name])) {
      return { container: mcp.servers, legacy: false };
    }
  }
  return { container: mcp, legacy: true };
}

function mergeMcpConfig(original: any, input: any): any {
  const out: Record<string, any> = isObject(original) ? { ...original } : {};
  const type = input?.type === "remote" ? "remote" : "local";
  const enabled = input?.enabled !== false;
  out.type = type;
  out.enabled = enabled;
  delete out.disabled;

  if (type === "local") {
    delete out.url;
    delete out.headers;
    delete out.oauth;
    out.command = Array.isArray(input?.command) ? input.command.map(String).filter(Boolean) : [];
    if (!out.command.length) throw new Error("command is required for a local MCP server");
    if (input?.cwd) out.cwd = String(input.cwd);
    else delete out.cwd;
    const env = isObject(input?.environment) ? input.environment : {};
    const envKey = isObject(original) && "env" in original && !("environment" in original)
      ? "env"
      : "environment";
    delete out.env;
    delete out.environment;
    if (Object.keys(env).length) out[envKey] = env;
    if (input?.timeout != null && Number(input.timeout) > 0) out.timeout = Number(input.timeout);
    else delete out.timeout;
  } else {
    delete out.command;
    delete out.cwd;
    delete out.env;
    delete out.environment;
    const url = String(input?.url ?? "").trim();
    if (!url) throw new Error("URL is required for a remote MCP server");
    out.url = url;
    const headers = isObject(input?.headers) ? input.headers : {};
    if (Object.keys(headers).length) out.headers = headers;
    else delete out.headers;
  }
  return out;
}

function runtimeMcpConfig(config: any): any {
  if (!isObject(config)) throw new Error("invalid MCP config");
  const enabled = config.enabled !== false && config.disabled !== true;
  const out: Record<string, any> = { type: config.type === "remote" ? "remote" : "local", disabled: !enabled };
  if (out.type === "local") {
    out.command = Array.isArray(config.command) ? config.command : [];
    if (config.cwd) out.cwd = config.cwd;
    const env = isObject(config.environment) ? config.environment : isObject(config.env) ? config.env : null;
    if (env && Object.keys(env).length) out.environment = env;
    if (Number(config.timeout) > 0) {
      const t = Number(config.timeout);
      out.timeout = { startup: t, catalog: t, execution: t };
    }
  } else {
    out.url = config.url;
    if (isObject(config.headers) && Object.keys(config.headers).length) out.headers = config.headers;
    if (config.oauth !== undefined) out.oauth = config.oauth;
  }
  return out;
}

async function runtimeMcp(directory: string | null): Promise<McpServerInfo[]> {
  return (await ocData<McpServerInfo[]>("/api/mcp", {}, locationParams(directory))) ?? [];
}

async function runtimeMcpResources(directory: string | null) {
  try {
    return (
      (await ocData<any>("/api/mcp/resource", {}, locationParams(directory))) ?? {
        resources: [],
        templates: [],
      }
    );
  } catch {
    return { resources: [], templates: [] };
  }
}

async function runtimePlugins(directory: string | null): Promise<PluginInfo[]> {
  return (await ocData<PluginInfo[]>("/api/plugin", {}, locationParams(directory))) ?? [];
}

async function removePlugin(docs: ConfigDocument[], target: string): Promise<string[]> {
  const touched: string[] = [];
  for (const doc of docs) {
    let changed = false;
    if (Array.isArray(doc.data?.plugins)) {
      const next = doc.data.plugins.filter((entry: any) => {
        const t =
          typeof entry === "string" ? entry : isObject(entry) ? String(entry.package ?? "") : "";
        return !samePlugin(t, target);
      });
      if (next.length !== doc.data.plugins.length) {
        doc.data.plugins = next;
        await writeDocument(doc, "plugins", next);
        changed = true;
      }
    }
    if (Array.isArray(doc.data?.plugin)) {
      const next = doc.data.plugin.filter((entry: any) => {
        const t = Array.isArray(entry) ? String(entry[0] ?? "") : typeof entry === "string" ? entry : "";
        return !samePlugin(t, target);
      });
      if (next.length !== doc.data.plugin.length) {
        doc.data.plugin = next;
        await writeDocument(doc, "plugin", next);
        changed = true;
      }
    }
    if (changed) touched.push(doc.path);
  }
  return touched;
}

async function updateMcp(
  docs: ConfigDocument[],
  name: string,
  config: any,
  requestedPath?: string | null,
): Promise<{ paths: string[]; config: any }> {
  const defining = docs.filter((d) => mcpEntries(d).some((e) => e.name === name));
  let target: ConfigDocument;
  if (defining.length) target = defining[defining.length - 1]!;
  else target = pickConfigPath(docs, requestedPath);

  const original = mcpEntries(target).find((e) => e.name === name)?.config;
  const next = mergeMcpConfig(original, config);
  const { container } = findMcpContainer(target.data, name);
  container[name] = next;
  await writeDocument(target, "mcp", target.data.mcp);
  return { paths: [target.path], config: next };
}

async function removeMcp(docs: ConfigDocument[], name: string): Promise<string[]> {
  const touched: string[] = [];
  for (const doc of docs) {
    const entry = mcpEntries(doc).find((e) => e.name === name);
    if (!entry) continue;
    const mcp = ensureMcpObject(doc.data);
    if (isObject(mcp.servers) && isObject(mcp.servers[name])) delete mcp.servers[name];
    if (isObject(mcp[name])) delete mcp[name];
    await writeDocument(doc, "mcp", doc.data.mcp);
    touched.push(doc.path);
  }
  return touched;
}

async function extensionData(directory: string | null, requestedPath?: string | null) {
  const docs = await loadDocuments(directory);
  const config = pickConfigPath(docs, requestedPath);
  const [mcpStatus, mcpResources, plugins] = await Promise.all([
    runtimeMcp(directory).catch(() => [] as McpServerInfo[]),
    runtimeMcpResources(directory),
    runtimePlugins(directory).catch(() => [] as PluginInfo[]),
  ]);

  const statusByName = new Map(mcpStatus.map((s) => [s.name, s]));
  const mcp = allMcpEntries(docs).map((entry) => {
    const runtime = statusByName.get(entry.name);
    return {
      name: entry.name,
      status: runtime?.status ?? { status: "not_loaded" },
      integrationID: runtime?.integrationID,
      config: entry.config,
      configPath: entry.configPath,
      enabled: entry.config.enabled !== false && entry.config.disabled !== true,
      type: entry.config.type === "remote" ? "remote" : "local",
    };
  });

  // Runtime servers that came from a different layer (or were added live).
  for (const runtime of mcpStatus) {
    if (mcp.some((x) => x.name === runtime.name)) continue;
    mcp.push({
      name: runtime.name,
      status: runtime.status,
      integrationID: runtime.integrationID,
      config: null,
      configPath: null,
      enabled: runtime.status?.status !== "disabled",
      type: "unknown",
    });
  }

  const configuredPlugins = allPluginEntries(docs).map((entry) => ({
    target: entry.target,
    array: entry.array,
    configPath: entry.configPath,
    entry: entry.entry,
  }));

  return {
    v2: true,
    directory,
    configs: docs.map((doc) => ({
      path: doc.path,
      label: configLabel(doc.path),
      mcpCount: mcpEntries(doc).length,
      pluginCount: pluginEntries(doc).length,
    })),
    configPath: config.path,
    mcp,
    mcpResources,
    plugins,
    configuredPlugins,
  };
}

async function readRequest(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function handleExtensions(req: Request, url: URL): Promise<Response> {
  if (!isV2()) {
    return json({ error: "opencode v2 is required for extension management", supported: false }, 501);
  }

  const method = req.method.toUpperCase();
  const path = url.pathname;

  try {
    if (path === "/api/extensions" && method === "GET") {
      const directory = selectedDirectory(url.searchParams.get("directory"));
      const configPath = url.searchParams.get("config");
      return json(await extensionData(directory, configPath));
    }

    if (path === "/api/extensions/mcp" && method === "POST") {
      const body = await readRequest(req);
      const directory = selectedDirectory(body.directory);
      const docs = await loadDocuments(directory);
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "name is required" }, 400);
      if (/[\\/\u0000-\u001f]/.test(name)) {
        return json({ error: "name may not contain slashes or control characters" }, 400);
      }
      const result = await updateMcp(docs, name, body.config, body.configPath);
      let runtimeError: string | undefined;
      try {
        await ocData(
          `/api/experimental/mcp/${encodeURIComponent(name)}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ config: runtimeMcpConfig(result.config) }),
          },
          locationParams(directory),
        );
      } catch (e: any) {
        runtimeError = String(e?.message ?? e);
      }
      return json({ ok: true, paths: result.paths, config: result.config, runtimeError });
    }

    let m = path.match(/^\/api\/extensions\/mcp\/([^/]+)$/);
    if (m && method === "DELETE") {
      const name = decodeURIComponent(m[1]!);
      const directory = selectedDirectory(url.searchParams.get("directory"));
      const docs = await loadDocuments(directory);
      const paths = await removeMcp(docs, name);
      let runtimeError: string | undefined;
      try {
        await ocData(
          `/api/experimental/mcp/${encodeURIComponent(name)}`,
          { method: "DELETE" },
          locationParams(directory),
        );
      } catch (e: any) {
        // A runtime-only server may already be gone; don't fail the request.
        runtimeError = String(e?.message ?? e);
      }
      return json({ ok: true, paths, runtimeError });
    }

    m = path.match(/^\/api\/extensions\/mcp\/([^/]+)\/(connect|disconnect)$/);
    if (m && method === "POST") {
      const name = decodeURIComponent(m[1]!);
      const action = m[2]!;
      const body = await readRequest(req);
      const directory = selectedDirectory(body.directory ?? url.searchParams.get("directory"));
      await ocData(
        `/api/experimental/mcp/${encodeURIComponent(name)}/${action}`,
        { method: "POST" },
        locationParams(directory),
      );
      return json({ ok: true });
    }

    if (path === "/api/extensions/plugins" && method === "POST") {
      const body = await readRequest(req);
      const directory = selectedDirectory(body.directory);
      const docs = await loadDocuments(directory);
      const target = String(body.target ?? "").trim();
      if (!target) return json({ error: "plugin package or path is required" }, 400);
      const doc = pickConfigPath(docs, body.configPath);
      let options: any = undefined;
      if (typeof body.options === "string" && body.options.trim()) {
        try {
          options = JSON.parse(body.options);
        } catch (e: any) {
          return json({ error: `options must be valid JSON: ${e?.message ?? e}` }, 400);
        }
      } else if (isObject(body.options)) {
        options = body.options;
      }
      // If the plugin is already configured, treat a supplied options object as
      // an update instead of silently adding it twice.
      const existing = allPluginEntries(docs).find((e) => samePlugin(e.target, target));
      if (existing) {
        if (!options) {
          return json(
            { error: `plugin is already configured in ${existing.configPath}` },
            409,
          );
        }
        const targetDoc = docs.find((d) => samePath(d.path, existing.configPath));
        if (!targetDoc) return json({ error: "plugin config document is no longer available" }, 409);
        if (existing.array === "plugins") {
          const list = Array.isArray(targetDoc.data.plugins) ? targetDoc.data.plugins.slice() : [];
          const i = list.findIndex((x: any) => {
            const t = typeof x === "string" ? x : isObject(x) ? String(x.package ?? "") : "";
            return samePlugin(t, target);
          });
          if (i >= 0) list[i] = isObject(list[i]) ? { ...list[i], package: target, options } : { package: target, options };
          targetDoc.data.plugins = list;
          await writeDocument(targetDoc, "plugins", list);
        } else {
          const list = Array.isArray(targetDoc.data.plugin) ? targetDoc.data.plugin.slice() : [];
          const i = list.findIndex((x: any) => {
            const t = Array.isArray(x) ? String(x[0] ?? "") : typeof x === "string" ? x : "";
            return samePlugin(t, target);
          });
          if (i >= 0) list[i] = [target, options];
          targetDoc.data.plugin = list;
          await writeDocument(targetDoc, "plugin", list);
        }
        return json({ ok: true, path: targetDoc.path, updated: true });
      }

      const entry = options ? { package: target, options } : target;
      const list = Array.isArray(doc.data.plugins) ? doc.data.plugins.slice() : [];
      list.push(entry);
      doc.data.plugins = list;
      await writeDocument(doc, "plugins", list);
      return json({ ok: true, path: doc.path });
    }

    // Prefer a body endpoint: Windows plugin paths contain backslashes, which
    // are awkward in URL path segments (and are sometimes normalized by
    // proxies). Keep DELETE for compatibility with the initial API.
    if (path === "/api/extensions/plugins/remove" && method === "POST") {
      const body = await readRequest(req);
      const target = String(body.target ?? "").trim();
      if (!target) return json({ error: "plugin package or path is required" }, 400);
      const directory = selectedDirectory(body.directory);
      const docs = await loadDocuments(directory);
      const paths = await removePlugin(docs, target);
      return json({ ok: true, paths, removed: paths.length > 0 });
    }

    if (path === "/api/extensions/plugins/check" && method === "POST") {
      const body = await readRequest(req);
      const directory = selectedDirectory(body.directory);
      const target = typeof body.target === "string" && body.target ? body.target : null;
      const plugins =
        (await ocData<PluginInfo[]>(
          "/api/plugin/check",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ target }),
          },
          locationParams(directory),
        )) ?? [];
      return json({ ok: true, plugins });
    }

    if (path === "/api/extensions/plugins/update" && method === "POST") {
      const body = await readRequest(req);
      const directory = selectedDirectory(body.directory);
      const targets = Array.isArray(body.targets) ? body.targets.map(String).filter(Boolean) : [];
      if (!targets.length) return json({ error: "targets are required" }, 400);
      await ocData(
        "/api/plugin/update",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targets }),
        },
        locationParams(directory),
      );
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 502);
  }
}
