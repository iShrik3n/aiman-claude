import { OPENCODE_URL } from "./config";
import { formToQuestion, type FormInfo } from "./forms";
import { ocAuthHeaders } from "./ocClient";

/**
 * Translate opencode v2's granular event stream into the v1 events the aiman
 * web UI listens for.
 *
 * v2 emits e.g. `session.text.delta`, `session.tool.success`, `session.step.ended`;
 * v1 (and the frontend) expects `message.part.updated`, `message.part.delta`,
 * `message.updated`, `session.idle`, …
 */

const textPart = (d: any) => `prt_${d.assistantMessageID}_text_${d.ordinal}`;
const reasoningPart = (d: any) => `prt_${d.assistantMessageID}_reasoning_${d.ordinal}`;

/** Remember tool names so later lifecycle events can carry them. */
const toolNames = new Map<string, string>();
function rememberTool(id: string, name?: string) {
  if (!id || !name) return;
  if (toolNames.size > 2000) toolNames.clear();
  toolNames.set(id, name);
}

function errMessage(err: any): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return String(err.message ?? err.data?.message ?? err.type ?? "");
}

function legacyError(err: any): any {
  if (!err) return undefined;
  return { name: err.type ?? err.name ?? "error", data: { message: errMessage(err) } };
}

function contentText(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!c) return "";
      if (c.type === "text") return String(c.text ?? "");
      if (c.type === "file") return String(c.name ?? c.uri ?? "");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

type V1Event = { type: string; properties: any };

const partUpdated = (part: any): V1Event => ({ type: "message.part.updated", properties: { part } });
const deltaEvent = (d: any, partID: string, field: string): V1Event => ({
  type: "message.part.delta",
  properties: {
    sessionID: d.sessionID,
    messageID: d.assistantMessageID,
    partID,
    field,
    delta: String(d.delta ?? ""),
  },
});

const textPartOf = (d: any, text: string): any => ({
  id: textPart(d),
  sessionID: d.sessionID,
  messageID: d.assistantMessageID,
  type: "text",
  text,
});

const reasoningPartOf = (d: any, text: string, created?: number): any => ({
  id: reasoningPart(d),
  sessionID: d.sessionID,
  messageID: d.assistantMessageID,
  type: "reasoning",
  text,
  ...(created ? { time: { created } } : {}),
});

const toolPartOf = (d: any, state: any, created?: number): any => ({
  id: d.id,
  sessionID: d.sessionID,
  messageID: d.assistantMessageID,
  type: "tool",
  tool: toolNames.get(d.id),
  callID: d.id,
  state,
  ...(created ? { time: { created } } : {}),
});

const assistantInfo = (d: any, evt: any): any => ({
  id: d.assistantMessageID,
  sessionID: d.sessionID,
  role: "assistant",
  time: { created: d.started ?? evt.created },
  agentID: d.agent,
  modelID: d.model?.id,
  providerID: d.model?.providerID,
  variant: d.model?.variant,
});

export function translateEvent(evt: any): V1Event[] {
  const d = evt?.data ?? {};
  switch (evt?.type) {
    case "session.created":
      return [{ type: "session.created", properties: { info: { id: d.sessionID } } }];
    case "session.renamed":
    case "session.archived":
    case "session.unarchived":
    case "session.moved":
    case "session.forked":
    case "session.metadata.updated":
    case "session.permissions":
      return [{ type: "session.updated", properties: { sessionID: d.sessionID } }];
    // `session.viewed` fires constantly while reading; refreshing the whole
    // session list for it made the UI feel sluggish.
    case "session.deleted":
      return [{ type: "session.deleted", properties: { sessionID: d.sessionID } }];

    case "session.status":
      return [{ type: "session.status", properties: { sessionID: d.sessionID, status: d.status } }];
    // Belt and braces: some builds only emit execution lifecycle events.
    case "session.execution.started":
      return [
        {
          type: "session.status",
          properties: { sessionID: d.sessionID, status: { type: "busy" } },
        },
      ];
    case "session.retry.scheduled":
      return [
        {
          type: "session.status",
          properties: {
            sessionID: d.sessionID,
            status: {
              type: "retry",
              attempt: d.attempt,
              message: errMessage(d.error),
              next: d.at,
            },
          },
        },
      ];
    case "session.idle":
      return [{ type: "session.idle", properties: { sessionID: d.sessionID } }];
    case "session.execution.succeeded":
    case "session.execution.interrupted":
      return [{ type: "session.idle", properties: { sessionID: d.sessionID } }];
    case "session.execution.failed":
      return [
        {
          type: "session.error",
          properties: { sessionID: d.sessionID, error: legacyError(d.error) },
        },
        { type: "session.idle", properties: { sessionID: d.sessionID } },
      ];

    case "session.inbox.enqueued": {
      // A prompt enqueued by any client. Mirror it into the transcript so the
      // user's own message shows up immediately (v2 has no message.updated for
      // user messages).
      const item = d.item;
      if (item?.type !== "user" || !item.id) return [];
      const created = item.time?.created ?? evt.created;
      return [
        partUpdated({
          id: `${item.id}:text`,
          sessionID: d.sessionID,
          messageID: item.id,
          type: "text",
          text: String(item.payload?.text ?? ""),
        }),
        {
          type: "message.updated",
          properties: {
            info: {
              id: item.id,
              sessionID: d.sessionID,
              role: "user",
              time: { created },
            },
          },
        },
      ];
    }

    case "session.step.started":
      return [{ type: "message.updated", properties: { info: assistantInfo(d, evt) } }];
    case "session.step.ended":
      return [
        {
          type: "message.updated",
          properties: {
            info: {
              id: d.assistantMessageID,
              sessionID: d.sessionID,
              role: "assistant",
              time: { completed: evt.created },
              ...(d.cost != null ? { cost: d.cost } : {}),
              ...(d.tokens ? { tokens: d.tokens } : {}),
              ...(d.finish ? { finish: d.finish } : {}),
            },
          },
        },
      ];
    case "session.step.failed":
      return [
        {
          type: "message.updated",
          properties: {
            info: {
              id: d.assistantMessageID,
              sessionID: d.sessionID,
              role: "assistant",
              time: { completed: evt.created },
              error: legacyError(d.error),
              ...(d.cost != null ? { cost: d.cost } : {}),
              ...(d.tokens ? { tokens: d.tokens } : {}),
            },
          },
        },
      ];

    case "session.text.started":
      return [partUpdated(textPartOf(d, ""))];
    case "session.text.delta":
      return [deltaEvent(d, textPart(d), "text")];
    case "session.text.ended":
      return [partUpdated(textPartOf(d, String(d.text ?? "")))];

    case "session.reasoning.started":
      return [partUpdated(reasoningPartOf(d, "", evt.created))];
    case "session.reasoning.delta":
      return [deltaEvent(d, reasoningPart(d), "text")];
    case "session.reasoning.ended":
      return [partUpdated(reasoningPartOf(d, String(d.text ?? "")))];

    case "session.tool.input.started":
      rememberTool(d.id, d.name);
      return [
        partUpdated(toolPartOf(d, { status: "pending", input: {}, metadata: {} }, evt.created)),
      ];
    case "session.tool.called":
      return [
        partUpdated(
          toolPartOf(d, {
            status: "running",
            input: d.input ?? {},
            executed: d.executed,
            metadata: {},
          }),
        ),
      ];
    case "session.tool.progress":
      return [partUpdated(toolPartOf(d, { status: "running", metadata: d.metadata ?? {} }))];
    case "session.tool.success":
      return [
        partUpdated(
          toolPartOf(d, {
            status: "completed",
            output: contentText(d.content),
            metadata: d.metadata ?? {},
            executed: d.executed,
          }),
        ),
      ];
    case "session.tool.failed":
      return [
        partUpdated(
          toolPartOf(d, {
            status: "error",
            error: errMessage(d.error),
            output: contentText(d.content),
            metadata: d.metadata ?? {},
            executed: d.executed,
          }),
        ),
      ];

    case "permission.asked":
      return [
        {
          type: "permission.asked",
          properties: {
            id: d.id,
            sessionID: d.sessionID,
            permission: d.action,
            patterns: d.resources ?? [],
            metadata: d.metadata ?? {},
            always: d.save ?? [],
            tool: d.source ? { messageID: d.source.messageID, callID: d.source.id } : undefined,
          },
        },
      ];
    case "permission.replied":
      return [
        {
          type: "permission.replied",
          properties: { sessionID: d.sessionID, requestID: d.requestID ?? d.id, reply: d.reply },
        },
      ];

    case "form.created":
      return d.form ? [{ type: "question.asked", properties: formToQuestion(d.form as FormInfo) }] : [];
    case "form.replied":
      return [
        {
          type: "question.replied",
          properties: { sessionID: d.sessionID, requestID: d.id },
        },
      ];
    case "form.cancelled":
      return [
        {
          type: "question.rejected",
          properties: { sessionID: d.sessionID, requestID: d.id },
        },
      ];

    default:
      return [];
  }
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  "x-accel-buffering": "no",
  connection: "keep-alive",
};

/**
 * A 200 SSE response that immediately ends. EventSource reconnects after the
 * advertised delay; returning 4xx/5xx would make the browser give up for good,
 * which is what left the UI stuck on "disconnected" when aiman came up a moment
 * before opencode.
 */
function retryableStream(detail: string): Response {
  return new Response(`retry: 3000\n: ${detail.replace(/[\r\n]+/g, " ")}\n\n`, {
    status: 200,
    headers: SSE_HEADERS,
  });
}

/** Proxy opencode v2's SSE stream as the v1 envelope the web UI parses. */
export async function streamV1Events(req: Request): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(new URL("/api/event", OPENCODE_URL), {
      headers: { accept: "text/event-stream", ...ocAuthHeaders() },
    });
  } catch (e) {
    return retryableStream(`opencode unreachable: ${String(e)}`);
  }
  if (!upstream.ok || !upstream.body) {
    return retryableStream(`opencode ${upstream.status}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      // Flush headers immediately and give the browser a positive signal.
      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let evt: any;
            try {
              evt = JSON.parse(raw);
            } catch {
              continue;
            }
            for (const v1 of translateEvent(evt)) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ payload: v1 })}\n\n`),
              );
            }
          }
        }
      } catch {
        // client disconnected or upstream closed
      } finally {
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
        try {
          reader.releaseLock();
        } catch {}
      }
    },
    cancel() {
      // The browser closed the EventSource. Stop reading upstream; the abort
      // that this produces is expected and must not escape as an unhandled
      // rejection (Bun would take the whole server down).
      try {
        reader.cancel().catch(() => {});
      } catch {}
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
