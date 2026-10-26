/**
 * Switchable opencode server profiles.
 *
 * A profile carries the HTTP endpoint plus the local data/credentials paths the
 * manager should read for that endpoint. Only one profile is active at a time;
 * changing it requires a manager restart because the SQLite connection and
 * event stream are opened at boot.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  AIMAN_HOME,
  OPENCODE_AUTH,
  OPENCODE_DB,
  OPENCODE_PASSWORD,
  OPENCODE_URL,
  SERVERS_FILE,
  type OpenCodeServerProfile,
  type OpenCodeServersFile,
} from "./config";

export type ServerView = {
  id: string;
  name: string;
  url: string;
  db: string;
  auth: string;
  hasPassword: boolean;
  active: boolean;
};

function atomic(path: string, text: string): void {
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
  }
}

export function readServers(): OpenCodeServersFile {
  try {
    const parsed = JSON.parse(readFileSync(SERVERS_FILE, "utf8"));
    if (parsed && Array.isArray(parsed.servers)) {
      return {
        activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
        servers: parsed.servers.filter(
          (item: any) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.url === "string",
        ),
      };
    }
  } catch {}
  return { activeId: null, servers: [] };
}

export function defaultServer(): OpenCodeServerProfile {
  return {
    id: "default",
    name: "Local opencode",
    url: OPENCODE_URL,
    ...(OPENCODE_PASSWORD ? { password: OPENCODE_PASSWORD } : {}),
    db: OPENCODE_DB,
    auth: OPENCODE_AUTH,
  };
}

export function resolvedServers(): OpenCodeServersFile {
  const file = readServers();
  if (!file.servers.length) {
    return { activeId: "default", servers: [defaultServer()] };
  }
  return file;
}

export function listServers(): {
  activeId: string;
  servers: ServerView[];
  envOverrides: string[];
  file: string;
} {
  const data = resolvedServers();
  const activeId = data.activeId && data.servers.some((item) => item.id === data.activeId)
    ? data.activeId
    : data.servers[0]!.id;
  const envOverrides: string[] = [];
  if (process.env.OPENCODE_URL) envOverrides.push("OPENCODE_URL");
  if (process.env.OPENCODE_PASSWORD || process.env.OPENCODE_SERVER_PASSWORD) {
    envOverrides.push("OPENCODE_PASSWORD");
  }
  if (process.env.OPENCODE_DB) envOverrides.push("OPENCODE_DB");
  if (process.env.OPENCODE_AUTH) envOverrides.push("OPENCODE_AUTH");
  return {
    activeId,
    file: SERVERS_FILE,
    envOverrides,
    servers: data.servers.map((server) => ({
      id: server.id,
      name: server.name,
      url: server.url,
      db: server.db ?? "",
      auth: server.auth ?? "",
      hasPassword: !!server.password,
      active: server.id === activeId,
    })),
  };
}

function validateUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("server URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("server URL must use http or https");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function cleanName(name: unknown): string {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("server name is required");
  return clean.slice(0, 80);
}

function writeServers(data: OpenCodeServersFile): void {
  atomic(SERVERS_FILE, JSON.stringify(data, null, 2) + "\n");
}

export function createServer(body: any): ServerView {
  const data = resolvedServers();
  const id = `srv_${crypto.randomUUID()}`;
  const server: OpenCodeServerProfile = {
    id,
    name: cleanName(body.name),
    url: validateUrl(String(body.url ?? "")),
    ...(String(body.password ?? "") ? { password: String(body.password) } : {}),
    ...(String(body.db ?? "").trim() ? { db: String(body.db).trim() } : {}),
    ...(String(body.auth ?? "").trim() ? { auth: String(body.auth).trim() } : {}),
  };
  data.servers.push(server);
  if (!data.activeId) data.activeId = id;
  writeServers(data);
  return toView(server, data.activeId === id);
}

export function updateServer(id: string, body: any): ServerView {
  const data = resolvedServers();
  const index = data.servers.findIndex((server) => server.id === id);
  if (index < 0) throw new Error("server profile not found");
  const old = data.servers[index]!;
  const next: OpenCodeServerProfile = {
    ...old,
    name: body.name !== undefined ? cleanName(body.name) : old.name,
    url: body.url !== undefined ? validateUrl(String(body.url)) : old.url,
  };
  if (body.password !== undefined && String(body.password)) next.password = String(body.password);
  if (body.db !== undefined) {
    if (String(body.db).trim()) next.db = String(body.db).trim();
    else delete next.db;
  }
  if (body.auth !== undefined) {
    if (String(body.auth).trim()) next.auth = String(body.auth).trim();
    else delete next.auth;
  }
  data.servers[index] = next;
  writeServers(data);
  return toView(next, data.activeId === id);
}

export function deleteServer(id: string): void {
  const data = resolvedServers();
  if (data.servers.length <= 1) throw new Error("at least one server profile is required");
  const next = data.servers.filter((server) => server.id !== id);
  if (next.length === data.servers.length) throw new Error("server profile not found");
  if (data.activeId === id) throw new Error("activate another server before deleting this one");
  data.servers = next;
  writeServers(data);
}

export function activateServer(id: string): ServerView {
  const data = resolvedServers();
  const server = data.servers.find((item) => item.id === id);
  if (!server) throw new Error("server profile not found");
  data.activeId = id;
  writeServers(data);
  return toView(server, true);
}

function toView(server: OpenCodeServerProfile, active: boolean): ServerView {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    db: server.db ?? "",
    auth: server.auth ?? "",
    hasPassword: !!server.password,
    active,
  };
}

export function serversFilePath(): string {
  return SERVERS_FILE;
}

export function managerHome(): string {
  return AIMAN_HOME;
}
