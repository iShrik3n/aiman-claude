import { useEffect, useMemo, useRef, useState } from "react";
import { api, type BtwItem } from "./api";
import { toast } from "./store";
import Icon from "./Icon";
import { Markdown } from "./PartView";

function when(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

/**
 * /btw side questions. Each question runs in an isolated child session and the
 * answer is saved here for later review. The main transcript is never touched.
 */
export default function BtwPanel({
  sessionId,
  request,
  onClose,
}: {
  sessionId: string;
  /** Set by /btw or the header button. `nonce` re-triggers the same question. */
  request: { question: string; nonce: number } | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BtwItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const lastRequest = useRef<number>(0);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  async function ask(question: string) {
    const text = question.trim();
    if (!text || asking) return;
    setAsking(true);
    setInput("");
    try {
      const result = await api.btwAsk(sessionId, text);
      setItems((prev) => [result.item, ...prev.filter((item) => item.id !== result.item.id)]);
      setSelectedId(result.item.id);
    } catch (e) {
      toast(`BTW failed: ${e}`);
    } finally {
      setAsking(false);
    }
  }

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const result = await api.btwHistory(sessionId);
        if (!alive) return;
        setItems(result.items);
        setSelectedId((current) =>
          current && result.items.some((item) => item.id === current)
            ? current
            : (result.items[0]?.id ?? null),
        );
      } catch {}
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!request || request.nonce === lastRequest.current) return;
    lastRequest.current = request.nonce;
    if (request.question.trim()) void ask(request.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function remove(item: BtwItem) {
    if (!confirm("Delete this BTW answer from history?")) return;
    try {
      await api.btwDelete(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setSelectedId((current) => (current === item.id ? null : current));
    } catch (e) {
      toast(`Could not delete: ${e}`);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box btw-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title btw-head">
          <span>
            <Icon name="chat" /> BTW
          </span>
          <span className="muted small">
            side questions · saved for this session
          </span>
          <div className="spacer" />
          <button className="btn sm" onClick={onClose}>
            <Icon name="close" /> close
          </button>
        </div>

        <div className="btw-ask">
          <input
            className="input"
            autoFocus
            value={input}
            placeholder="Ask a quick side question… (the main session keeps running)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
          />
          <button
            className="btn primary"
            disabled={!input.trim() || asking}
            onClick={() => void ask(input)}
          >
            <Icon name="send" /> {asking ? "Asking…" : "Ask"}
          </button>
        </div>

        <div className="btw-split">
          <div className="btw-list">
            {items.length === 0 && (
              <div className="muted small" style={{ padding: 10 }}>
                No side questions yet. Use <code>/btw question</code> or ask above.
              </div>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={"btw-item" + (selected?.id === item.id ? " active" : "")}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="btw-item-q">{item.question}</span>
                <span className="btw-item-meta">
                  {item.status === "pending" ? (
                    <span className="badge running">thinking…</span>
                  ) : item.status === "failed" ? (
                    <span className="badge">failed</span>
                  ) : (
                    <span className="badge completed">answered</span>
                  )}
                  <span className="muted">{when(item.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="btw-detail">
            {!selected ? (
              <div className="empty">
                Ask a side question without adding anything to the main transcript.
              </div>
            ) : (
              <>
                <div className="btw-detail-head">
                  <div className="btw-detail-q">{selected.question}</div>
                  <button
                    className="btn ghost sm"
                    title="Delete from history"
                    onClick={() => void remove(selected)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <div className="btw-item-meta">
                  <span className="muted">{when(selected.createdAt)}</span>
                  {selected.completedAt && (
                    <span className="muted">· {when(selected.completedAt)}</span>
                  )}
                </div>
                {selected.status === "pending" ? (
                  <div className="btw-thinking">
                    <span className="running-dot" />
                    <span>Thinking about this side question…</span>
                    <span className="muted">
                      The main session is still running normally.
                    </span>
                  </div>
                ) : selected.status === "failed" ? (
                  <div className="btw-error">{selected.error || "No answer returned."}</div>
                ) : (
                  <div className="btw-answer">
                    <Markdown text={selected.answer ?? ""} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
