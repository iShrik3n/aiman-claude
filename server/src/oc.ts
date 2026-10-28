import { getSessionEntries } from "./messages";
import {
  abortSession,
  agents,
  createSession,
  eventStream,
  listPermissions,
  listQuestions,
  LiveError,
  providers,
  replyPermission,
  replyQuestion,
  startPrompt,
} from "./live";
import { createPty, deletePty, listPtys, PtyError, resizePty } from "./pty";
import { LIVE_ENABLED } from "./security";

/**
 * The `/oc/*` surface the web UI was written against (opencode's HTTP API),
 * backed by the Claude Code index and the Agent SDK runner in live.ts.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function promptText(b: any): { text: string; hasFiles: boolean } {
  const parts: any[] = Array.isArray(b.parts) ? b.parts : [];
  const text = parts
    .filter((p) => p?.type === "text")
    .map((p) => String(p.text ?? ""))
    .join("\n");
  return { text: text || String(b.text ?? ""), hasFiles: parts.some((p) => p?.type === "file") };
}

export async function handleOc(req: Request, url: URL): Promise<Response> {
  const p = url.pathname.replace(/^\/oc/, "") || "/";
  const method = req.method.toUpperCase();

  try {
    if ((p === "/global/event" || p === "/event") && method === "GET") return eventStream(req);

    if (method === "GET") {
      const m = p.match(/^\/session\/([^/]+)\/message$/);
      if (m) return json(getSessionEntries(decodeURIComponent(m[1]!)));
      if (/^\/session\/[^/]+\/todo$/.test(p)) return json([]);
      if (p === "/permission") return json(listPermissions());
      if (p === "/question") return json(listQuestions());
      if (p === "/pty") return json(listPtys());
      if (p === "/command") return json([]);
      if (p === "/agent") return json(agents());
      if (p === "/config/providers") return json(providers());
    }

    if (method !== "GET" && LIVE_ENABLED) {
      if (p === "/pty" && method === "POST") {
        const b = await body(req);
        return json(
          createPty({
            cwd: typeof b.cwd === "string" ? b.cwd : undefined,
            title: typeof b.title === "string" ? b.title : undefined,
            resume: typeof b.resume === "string" ? b.resume : undefined,
            rows: b.rows,
            cols: b.cols,
          }),
        );
      }
      const pm = p.match(/^\/pty\/([^/]+)$/);
      if (pm && method === "PUT") {
        const b = await body(req);
        return resizePty(pm[1]!, b.size?.rows, b.size?.cols, typeof b.title === "string" ? b.title : undefined)
          ? json(true)
          : json({ error: "not found" }, 404);
      }
      if (pm && method === "DELETE") return deletePty(pm[1]!) ? json(true) : json({ error: "not found" }, 404);
      if (method !== "POST") return json({ error: "not_implemented" }, 501);

      if (p === "/session") {
        const b = await body(req);
        return json(createSession(url.searchParams.get("directory") ?? "", b.title));
      }

      let m = p.match(/^\/session\/([^/]+)\/prompt_async$/);
      if (m) {
        const b = await body(req);
        const { text, hasFiles } = promptText(b);
        if (hasFiles) return json({ error: "attachments are not supported yet" }, 400);
        startPrompt(decodeURIComponent(m[1]!), text, {
          model: typeof b.model?.modelID === "string" ? b.model.modelID : undefined,
          variant: typeof b.variant === "string" ? b.variant : undefined,
        });
        return new Response(null, { status: 204 });
      }

      m = p.match(/^\/session\/([^/]+)\/abort$/);
      if (m) {
        await abortSession(decodeURIComponent(m[1]!));
        return json(true);
      }

      m = p.match(/^\/permission\/([^/]+)\/reply$/);
      if (m) {
        const b = await body(req);
        return replyPermission(decodeURIComponent(m[1]!), String(b.reply ?? "reject"))
          ? json(true)
          : json({ error: "permission request not found" }, 404);
      }

      m = p.match(/^\/question\/([^/]+)\/(reply|reject)$/);
      if (m) {
        const b = m[2] === "reply" ? await body(req) : {};
        const answers = m[2] === "reply" && Array.isArray(b.answers) ? b.answers : null;
        return replyQuestion(decodeURIComponent(m[1]!), answers)
          ? json(true)
          : json({ error: "question not found" }, 404);
      }
    } else if (method !== "GET") {
      return json({ error: "live_control_disabled", detail: "Live control is off: the server is not bound to loopback (set AIMAN_ALLOW_REMOTE_CONTROL=1 to enable it)." }, 403);
    }
  } catch (e) {
    if (e instanceof LiveError || e instanceof PtyError) return json({ error: e.message }, e.status);
    console.error("[oc] request failed:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }

  return json({ error: "not_implemented", detail: "not available in aiman-claude yet" }, 501);
}
