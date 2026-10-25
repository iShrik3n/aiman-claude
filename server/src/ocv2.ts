import { existsSync } from "node:fs";
import { OPENCODE_PASSWORD } from "./config";
import { distinctDirectories, sessionDirectory } from "./manager";
import { getSessionEntries } from "./messages";
import { streamV1Events } from "./events";
import { ocData, ocFetch, ocJson, locationParams } from "./ocClient";
import { answersToForm, formToQuestion, type FormInfo } from "./forms";

/**
 * Compatibility layer between the aiman web UI (which speaks opencode v1) and
 * opencode v2's `/api/*` routes.
 */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const noContent = () => new Response(null, { status: 204 });

async function readBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function queryFor(sessionId?: string | null): URLSearchParams {
  const dir = sessionId ? sessionDirectory(sessionId) : null;
  return locationParams(dir && existsSync(dir) ? dir : null);
}

/** Run fn over items with bounded concurrency. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Form/permission listings are location-scoped in v2. Collect them across every
 * directory that has sessions, cached briefly because the UI asks on each open.
 */
let pendingCache: { at: number; forms: FormInfo[]; permissions: any[] } | null = null;
async function pendingLists(): Promise<{ forms: FormInfo[]; permissions: any[] }> {
  if (pendingCache && Date.now() - pendingCache.at < 1500) return pendingCache;

  const dirs = distinctDirectories();
  const results = await pool(dirs, 6, async (dir) => {
    const q = locationParams(dir);
    const [forms, perms] = await Promise.all([
      ocData<FormInfo[]>("/api/form", {}, q).catch(() => []),
      ocData<any[]>("/api/permission/request", {}, q).catch(() => []),
    ]);
    return { forms: forms ?? [], permissions: perms ?? [] };
  });

  const forms = new Map<string, FormInfo>();
  const permissions = new Map<string, any>();
  for (const r of results) {
    for (const f of r.forms) if (f?.id) forms.set(f.id, f);
    for (const p of r.permissions) if (p?.id) permissions.set(p.id, p);
  }
  pendingCache = { at: Date.now(), forms: [...forms.values()], permissions: [...permissions.values()] };
  return pendingCache;
}

function toPermission(p: any) {
  return {
    id: p.id,
    sessionID: p.sessionID,
    permission: p.action,
    patterns: p.resources ?? [],
    metadata: p.metadata ?? {},
    always: p.save ?? [],
    tool: p.source ? { messageID: p.source.messageID, callID: p.source.id } : undefined,
  };
}

function textFromParts(parts: any[]): string {
  return (parts ?? [])
    .filter((p) => p && (p.type === "text" || p.type === undefined) && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n\n");
}

function filesFromParts(parts: any[]): { uri: string; name?: string }[] {
  return (parts ?? [])
    .filter((p) => p && p.type === "file" && (p.url || p.uri))
    .map((p) => ({ uri: String(p.url ?? p.uri), name: p.filename ?? p.name }));
}

async function setSessionModel(sessionId: string, model: any) {
  if (!model?.providerID || !model?.modelID) return;
  await ocData(
    `/api/session/${encodeURIComponent(sessionId)}/model`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: { providerID: model.providerID, id: model.modelID } }),
    },
    queryFor(sessionId),
  ).catch((e) => console.warn("[oc] could not switch model:", String(e?.message ?? e)));
}

async function setSessionAgent(sessionId: string, agent?: string) {
  if (!agent) return;
  await ocData(
    `/api/session/${encodeURIComponent(sessionId)}/agent`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent }),
    },
    queryFor(sessionId),
  ).catch((e) => console.warn("[oc] could not switch agent:", String(e?.message ?? e)));
}

export async function handleOcV2(req: Request, url: URL): Promise<Response> {
  const p = url.pathname.replace(/^\/oc/, "") || "/";
  const method = req.method.toUpperCase();

  try {
    // ---------- live events ----------
    if ((p === "/global/event" || p === "/event") && method === "GET") {
      return streamV1Events(req);
    }

    // ---------- messages ----------
    let m = p.match(/^\/session\/([^/]+)\/message$/);
    if (m && method === "GET") {
      return json(getSessionEntries(m[1]!));
    }

    // ---------- prompt ----------
    m = p.match(/^\/session\/([^/]+)\/prompt_async$/);
    if (m && method === "POST") {
      const sessionId = m[1]!;
      const b = await readBody(req);
      // Switch the agent first: selecting an agent can reset the model, so the
      // explicit model choice must be applied last.
      await setSessionAgent(sessionId, b.agent);
      await setSessionModel(sessionId, b.model);
      const text = textFromParts(b.parts) || String(b.text ?? "");
      const files = filesFromParts(b.parts);
      await ocData(
        `/api/session/${encodeURIComponent(sessionId)}/prompt`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, ...(files.length ? { files } : {}) }),
        },
        queryFor(sessionId),
      );
      return noContent();
    }

    // v2 stores model/agent on the session instead of per prompt.
    m = p.match(/^\/session\/([^/]+)\/model$/);
    if (m && method === "POST") {
      const b = await readBody(req);
      await setSessionModel(m[1]!, b.model ?? b);
      return json(true);
    }

    m = p.match(/^\/session\/([^/]+)\/agent$/);
    if (m && method === "POST") {
      const b = await readBody(req);
      await setSessionAgent(m[1]!, b.agent ?? b.name);
      return json(true);
    }

    m = p.match(/^\/session\/([^/]+)\/abort$/);
    if (m && method === "POST") {
      await ocData(
        `/api/session/${encodeURIComponent(m[1]!)}/interrupt`,
        { method: "POST" },
        queryFor(m[1]!),
      );
      return json(true);
    }

    // ---------- create session ----------
    if (p === "/session" && method === "POST") {
      const b = await readBody(req);
      const directory = url.searchParams.get("directory");
      const created = await ocData<any>("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: b.title ?? null,
          ...(directory ? { location: { directory } } : {}),
          ...(b.parentID ? { parentID: b.parentID } : {}),
        }),
      });
      return json({
        id: created?.id,
        title: created?.title ?? b.title ?? "",
        directory: created?.location?.directory ?? directory ?? "",
      });
    }

    // ---------- catalogues ----------
    if (p === "/config/providers" && method === "GET") {
      const q = locationParams(url.searchParams.get("directory"));
      const [providers, models] = await Promise.all([
        ocData<any[]>("/api/provider", {}, q).catch(() => []),
        ocData<any[]>("/api/model", {}, q).catch(() => []),
      ]);
      const byProvider = new Map<string, any[]>();
      for (const model of models ?? []) {
        const list = byProvider.get(model.providerID) ?? [];
        list.push(model);
        byProvider.set(model.providerID, list);
      }
      const result = (providers ?? []).map((prov) => {
        const list = byProvider.get(prov.id) ?? [];
        const map: Record<string, any> = {};
        for (const model of list) {
          map[model.id] = {
            id: model.id,
            name: model.name ?? model.id,
            reasoning: Boolean(model.capabilities?.reasoning),
            tool_call: model.capabilities?.tools !== false,
          };
        }
        return { id: prov.id, name: prov.name ?? prov.id, models: map };
      });
      return json({ providers: result.filter((x) => Object.keys(x.models).length > 0) });
    }

    if (p === "/agent" && method === "GET") {
      const agents = await ocData<any[]>("/api/agent").catch(() => []);
      return json(
        (agents ?? []).map((a) => ({ name: a.id, description: a.description ?? "", mode: a.mode })),
      );
    }

    if (p === "/command" && method === "GET") {
      const commands = await ocData<any[]>("/api/command").catch(() => []);
      return json(
        (commands ?? []).map((c) => ({
          name: c.name,
          description: c.description ?? "",
          agent: c.agent,
        })),
      );
    }

    m = p.match(/^\/session\/([^/]+)\/command$/);
    if (m && method === "POST") {
      const sessionId = m[1]!;
      const b = await readBody(req);
      // Composer sends `{ command, arguments, agent, model }`; the model is a
      // combined "provider/model" key.
      if (b.model && typeof b.model === "string" && b.model.includes("/")) {
        const [providerID, ...rest] = b.model.split("/");
        await setSessionModel(sessionId, { providerID, modelID: rest.join("/") });
      }
      await setSessionAgent(sessionId, b.agent);
      await ocData(
        `/api/session/${encodeURIComponent(sessionId)}/command`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: b.command, text: b.arguments ?? "" }),
        },
        queryFor(sessionId),
      );
      return json(true);
    }

    // ---------- session operations ----------
    m = p.match(/^\/session\/([^/]+)\/diff$/);
    if (m && method === "GET") {
      const data = await ocData<any[]>(
        `/api/session/${encodeURIComponent(m[1]!)}/diff`,
        {},
        queryFor(m[1]!),
      );
      return json(data ?? []);
    }

    m = p.match(/^\/session\/([^/]+)\/fork$/);
    if (m && method === "POST") {
      const sessionId = m[1]!;
      const b = await readBody(req);
      const forked = await ocData<any>(
        `/api/session/${encodeURIComponent(sessionId)}/fork`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ before: b.messageID ?? null }),
        },
        queryFor(sessionId),
      );
      return json({ id: forked?.id, title: forked?.title ?? "" });
    }

    m = p.match(/^\/session\/([^/]+)\/revert$/);
    if (m && method === "POST") {
      const sessionId = m[1]!;
      const b = await readBody(req);
      const q = queryFor(sessionId);
      await ocData(
        `/api/session/${encodeURIComponent(sessionId)}/revert/stage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageID: b.messageID }),
        },
        q,
      );
      await ocData(`/api/session/${encodeURIComponent(sessionId)}/revert/commit`, { method: "POST" }, q);
      return json(true);
    }

    m = p.match(/^\/session\/([^/]+)\/unrevert$/);
    if (m && method === "POST") {
      await ocData(
        `/api/session/${encodeURIComponent(m[1]!)}/revert`,
        { method: "DELETE" },
        queryFor(m[1]!),
      );
      return json(true);
    }

    m = p.match(/^\/session\/([^/]+)\/summarize$/);
    if (m && method === "POST") {
      await ocData(
        `/api/session/${encodeURIComponent(m[1]!)}/compact`,
        { method: "POST" },
        queryFor(m[1]!),
      );
      return json(true);
    }

    m = p.match(/^\/session\/([^/]+)\/(share|unshare)$/);
    if (m && method === "POST") {
      return json({ error: "opencode v2 has no session sharing", unsupported: true }, 501);
    }

    m = p.match(/^\/session\/([^/]+)\/todo$/);
    if (m && method === "GET") {
      // v2 has no published todo list; the UI degrades to an empty panel.
      return json([]);
    }

    // ---------- permissions ----------
    if (p === "/permission" && method === "GET") {
      const { permissions } = await pendingLists();
      return json(permissions.map(toPermission));
    }

    m = p.match(/^\/permission\/([^/]+)\/reply$/);
    if (m && method === "POST") {
      const b = await readBody(req);
      const requestID = m[1]!;
      const { permissions } = await pendingLists();
      const perm = permissions.find((x) => x.id === requestID);
      if (!perm) return json({ error: "permission request not found" }, 404);
      await ocData(
        `/api/session/${encodeURIComponent(perm.sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: b.reply ?? "reject" }),
        },
        queryFor(perm.sessionID),
      );
      pendingCache = null;
      return json(true);
    }

    // ---------- questions (mapped from v2 forms) ----------
    if (p === "/question" && method === "GET") {
      const { forms } = await pendingLists();
      return json(
        forms.filter((f) => f?.state?.status !== "answered" && f?.state?.status !== "cancelled").map(formToQuestion),
      );
    }

    m = p.match(/^\/question\/([^/]+)\/(reply|reject)$/);
    if (m) {
      const formID = m[1]!;
      const action = m[2]!;
      const { forms } = await pendingLists();
      const form = forms.find((f) => f.id === formID);
      if (!form) return json({ error: "form not found" }, 404);
      if (action === "reject" && method === "POST") {
        await ocData(
          `/api/session/${encodeURIComponent(form.sessionID)}/form/${encodeURIComponent(formID)}`,
          { method: "DELETE" },
          queryFor(form.sessionID),
        );
        pendingCache = null;
        return json(true);
      }
      if (action === "reply" && method === "POST") {
        const b = await readBody(req);
        const answers: string[][] = Array.isArray(b.answers) ? b.answers : [];
        const answer = answersToForm(form, answers);
        await ocData(
          `/api/session/${encodeURIComponent(form.sessionID)}/form/${encodeURIComponent(formID)}/reply`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ answer }),
          },
          queryFor(form.sessionID),
        );
        pendingCache = null;
        return json(true);
      }
    }

    // ---------- pty (terminal) ----------
    if (p === "/pty" && method === "GET") {
      return json(await ocData<any[]>("/api/pty"));
    }
    if (p === "/pty" && method === "POST") {
      const b = await readBody(req);
      const dir = b.cwd && existsSync(b.cwd) ? b.cwd : null;
      // The TUI inside the terminal talks to this same server, so give it the
      // credentials it needs to authenticate.
      const env = { ...(b.env ?? {}), ...(OPENCODE_PASSWORD ? { OPENCODE_SERVER_PASSWORD: OPENCODE_PASSWORD } : {}) };
      return json(
        await ocData(
          "/api/pty",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...b, env }),
          },
          locationParams(dir),
        ),
      );
    }

    m = p.match(/^\/pty\/([^/]+)$/);
    if (m) {
      const id = m[1]!;
      if (method === "GET") return json(await ocData(`/api/pty/${encodeURIComponent(id)}`));
      if (method === "PUT") {
        const b = await readBody(req);
        return json(
          await ocData(`/api/pty/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(b),
          }),
        );
      }
      if (method === "DELETE") {
        await ocFetch(`/api/pty/${encodeURIComponent(id)}`, { method: "DELETE" });
        return json(true);
      }
    }

    return json({ error: "not_supported", path: p }, 404);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 502);
  }
}
