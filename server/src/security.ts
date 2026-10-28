import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { HOST } from "./config";
import { distinctDirectories } from "./manager";

/**
 * Live control means an HTTP POST can make Claude Code run tools on this
 * machine, so the server is stricter than a pure viewer:
 *
 *  - Host header allow-list when bound to loopback (stops DNS rebinding).
 *  - Same-origin check on state-changing requests (stops cross-site POSTs from
 *    any page open in the same browser).
 *  - Live control only when bound to loopback, unless explicitly enabled.
 *  - File endpoints only reach directories of known sessions (symlinks resolved).
 *  - A one-time setup token when the first admin could be created remotely.
 *  - Failed logins are throttled.
 */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const isLoopback = (h: string) => LOOPBACK.has(h) || h.startsWith("127.");

/** Extra Host names allowed behind a reverse proxy (comma separated). */
const EXTRA_HOSTS = new Set(
  (process.env.AIMAN_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

export const REMOTE_CONTROL_OPT_IN = process.env.AIMAN_ALLOW_REMOTE_CONTROL === "1";
export const LIVE_ENABLED = isLoopback(HOST) || REMOTE_CONTROL_OPT_IN;

const hostname = (hostHeader: string) =>
  hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.split(":")[0]!.toLowerCase();

const deny = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Returns a rejection response, or null if the request may proceed. */
export function guardRequest(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  if (isLoopback(HOST) && !isLoopback(hostname(host)) && !EXTRA_HOSTS.has(hostname(host))) {
    return deny(421, "unexpected Host header (set AIMAN_ALLOWED_HOSTS to allow it)");
  }
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (!originHost || originHost.toLowerCase() !== host.toLowerCase()) {
        return deny(403, "cross-origin request refused");
      }
    }
  }
  return null;
}

/**
 * WebSocket upgrades are GETs, so guardRequest skips their Origin check. A
 * terminal socket must come from our own pages.
 */
export function guardUpgrade(req: Request): Response | null {
  const bad = guardRequest(req);
  if (bad) return bad;
  const origin = req.headers.get("origin");
  if (!origin) return deny(403, "origin required");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {}
  return originHost.toLowerCase() === (req.headers.get("host") ?? "").toLowerCase()
    ? null
    : deny(403, "cross-origin request refused");
}

// ---------- first-run setup token ----------

/**
 * The first visitor creates the admin account. That is only safe when nobody
 * else can reach the port, so with a non-loopback bind, or behind a reverse
 * proxy (every request then looks local), creating it needs a token that is
 * printed on the server console. Never decided from X-Forwarded-For: clients
 * control it.
 */
export const setupTokenRequired = (host: string = HOST, proxiedHosts: number = EXTRA_HOSTS.size) =>
  !isLoopback(host) || proxiedHosts > 0;

export const SETUP_TOKEN = process.env.AIMAN_SETUP_TOKEN?.trim() || randomBytes(12).toString("hex");

export function checkSetupToken(given: unknown, expected: string = SETUP_TOKEN): boolean {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- failed-login throttle ----------

type Attempts = { fails: number; until: number; last: number };
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, Attempts>();

/**
 * In-memory, keyed by username (or "setup"): there is no trustworthy client IP
 * behind a proxy. After 5 failures the key is locked, doubling from 30 s up to
 * 15 min. A locked username can be used to lock out its owner; acceptable for
 * a single-user tool, and the lock expires.
 */
export const throttle = {
  /** Seconds to wait before the key may try again, or 0. */
  wait(key: string, now = Date.now()): number {
    const a = attempts.get(key);
    if (!a) return 0;
    if (now - a.last > WINDOW_MS) {
      attempts.delete(key);
      return 0;
    }
    return a.until > now ? Math.ceil((a.until - now) / 1000) : 0;
  },
  fail(key: string, now = Date.now()): void {
    if (attempts.size > 5000) attempts.clear();
    const a = attempts.get(key) ?? { fails: 0, until: 0, last: now };
    a.fails++;
    a.last = now;
    if (a.fails >= 5) a.until = now + Math.min(WINDOW_MS, 30_000 * 2 ** (a.fails - 5));
    attempts.set(key, a);
  },
  ok(key: string): void {
    attempts.delete(key);
  },
};

export const tooMany = (seconds: number) =>
  new Response(JSON.stringify({ error: `too many attempts, try again in ${seconds}s` }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(seconds) },
  });

// ---------- file access ----------

const inside = (root: string, p: string) => {
  const r = relative(root, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** realpath of `p`, or of its nearest existing ancestor plus the missing tail. */
function realish(p: string): string | null {
  let cur = resolve(p);
  const tail: string[] = [];
  for (;;) {
    if (existsSync(cur)) {
      try {
        return resolve(realpathSync(cur), ...tail.reverse());
      } catch {
        return null;
      }
    }
    const up = dirname(cur);
    if (up === cur) return null;
    tail.push(cur.slice(up.length + 1));
    cur = up;
  }
}

/** Real path of `directory` if it is, or is inside, a directory of a known session. */
export function projectRoot(directory: string): string | null {
  if (!directory || !isAbsolute(directory)) return null;
  const real = realish(directory);
  if (!real || !existsSync(real)) return null;
  for (const d of distinctDirectories()) {
    const rd = realish(d);
    if (rd && existsSync(rd) && inside(rd, real)) return real;
  }
  return null;
}

/**
 * Absolute path of `rel` inside a project directory, or null when the
 * directory is not a known project or the path leaves it (`..` or a symlink).
 */
export function projectPath(directory: string, rel: string): string | null {
  const root = projectRoot(directory);
  if (!root) return null;
  const abs = resolve(root, rel || ".");
  if (!inside(root, abs)) return null;
  const real = realish(abs);
  return real && inside(root, real) ? abs : null;
}
