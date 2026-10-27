import { HOST } from "./config";

/**
 * Live control means an HTTP POST can make Claude Code run tools on this
 * machine, so the server is stricter than a pure viewer:
 *
 *  - Host header allow-list when bound to loopback (stops DNS rebinding).
 *  - Same-origin check on state-changing requests (stops cross-site POSTs from
 *    any page open in the same browser).
 *  - Live control only when bound to loopback, unless explicitly enabled.
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
