import { getSessionEntries } from "./messages";

/**
 * Stand-in for the `/oc/*` surface the web UI uses to talk to opencode.
 *
 * Phase 1 is read-only: transcripts come from the Claude Code index, and
 * everything that would drive a live agent (prompting, permissions, PTY, …)
 * answers 501 so the UI shows an error instead of hanging.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** An SSE stream that stays open but never carries events. */
function idleEventStream(req: Request): Response {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": connected\n\n"));
      timer = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          clearInterval(timer);
        }
      }, 15_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

export function handleOcReadonly(req: Request, url: URL): Response {
  const p = url.pathname.replace(/^\/oc/, "") || "/";
  const method = req.method.toUpperCase();

  if ((p === "/global/event" || p === "/event") && method === "GET") {
    return idleEventStream(req);
  }

  if (method === "GET") {
    const m = p.match(/^\/session\/([^/]+)\/message$/);
    if (m) return json(getSessionEntries(decodeURIComponent(m[1]!)));
    if (/^\/session\/[^/]+\/todo$/.test(p)) return json([]);
    if (p === "/permission" || p === "/question" || p === "/pty") return json([]);
    if (p === "/agent" || p === "/command") return json([]);
    if (p === "/config/providers") return json({ providers: [], default: {} });
  }

  return json(
    { error: "read_only", detail: "aiman-claude is read-only in this version (live control is not implemented yet)" },
    501,
  );
}
