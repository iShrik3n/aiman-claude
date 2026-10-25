import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Part } from "./api";
import DiffView, { synthWriteDiff } from "./DiffView";
import { fmtFull, fmtTime } from "./time";

function md(text: string) {
  const html = marked.parse(text ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html);
}

/**
 * Highlight occurrences of `query` inside rendered markdown. The markdown
 * container is React-managed only via `dangerouslySetInnerHTML`, so wrapping
 * its text nodes with <mark> is safe; previous marks are unwrapped first.
 */
function useMark(query?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll("mark.find-mark").forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent ?? ""));
    });
    root.normalize();
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    for (const node of nodes) {
      const text = node.nodeValue ?? "";
      const lower = text.toLowerCase();
      let idx = lower.indexOf(q);
      if (idx < 0) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      while (idx >= 0) {
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
        const mark = document.createElement("mark");
        mark.className = "find-mark";
        mark.textContent = text.slice(idx, idx + q.length);
        frag.appendChild(mark);
        last = idx + q.length;
        idx = lower.indexOf(q, last);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
  }, [query]);
  return ref;
}

function Markdown({ text, query }: { text: string; query?: string }) {
  const ref = useMark(query);
  return <div className="markdown" ref={ref} dangerouslySetInnerHTML={{ __html: md(text) }} />;
}

function Collapse({
  head,
  children,
  className = "",
  defaultOpen = false,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"card " + className}>
      <div className="card-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"}</span>
        {head}
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

export default function PartView({
  part,
  query,
  thinkingOpen = true,
  messageTime,
}: {
  part: Part;
  query?: string;
  thinkingOpen?: boolean;
  messageTime?: number;
}) {
  const when = part.time?.created ?? part.state?.time?.start ?? messageTime;

  function Time() {
    const label = fmtTime(when);
    if (!label) return null;
    return (
      <span className="part-time" title={fmtFull(when)}>
        {label}
      </span>
    );
  }

  switch (part.type) {
    case "text": {
      if (part.ignored || part.synthetic) return null;
      return <Markdown text={part.text ?? ""} query={query} />;
    }
    case "reasoning": {
      return (
        <Collapse
          key={thinkingOpen ? "thinking-open" : "thinking-closed"}
          className="thinking"
          head={
            <>
              <span className="name">Thinking</span>
              <Time />
            </>
          }
          defaultOpen={thinkingOpen}
        >
          <Markdown text={part.text ?? ""} query={query} />
        </Collapse>
      );
    }
    case "tool": {
      const st = part.state ?? {};
      const status = st.status ?? "pending";
      const meta = st.metadata ?? {};
      const inp = st.input ?? {};
      const filePath: string | undefined = inp.filePath ?? inp.path ?? meta.filepath;
      const output = st.output ?? st.error ?? "";

      let diffText: string | null = null;
      if (typeof meta.diff === "string" && meta.diff.trim()) diffText = meta.diff;
      else if (part.tool === "write" && typeof inp.content === "string")
        diffText = synthWriteDiff(filePath ?? "file", inp.content);

      if (diffText) {
        const base = filePath ? filePath.split("/").slice(-1)[0] : "";
        return (
          <Collapse
            className="tool"
            defaultOpen={status !== "error"}
            head={
              <>
                <span className="name">{part.tool}</span>
                <span className={"badge " + status}>{status}</span>
                <span className="muted small" title={filePath}>
                  {base || st.title || ""}
                </span>
                <Time />
              </>
            }
          >
            <DiffView diff={diffText} path={filePath} />
            {st.error && output && <pre style={{ marginTop: 8 }}>{output}</pre>}
          </Collapse>
        );
      }

      const input = st.input ? JSON.stringify(st.input, null, 2) : "";
      return (
        <Collapse
          className="tool"
          defaultOpen={status === "running" || status === "error"}
          head={
            <>
              <span className="name">{part.tool}</span>
              <span className={"badge " + status}>{status}</span>
              {st.title && <span className="muted small">{st.title}</span>}
              <Time />
            </>
          }
        >
          {input && (
            <>
              <div className="small muted">input</div>
              <pre>{input}</pre>
            </>
          )}
          {output && (
            <>
              <div className="small muted" style={{ marginTop: 8 }}>
                {st.error ? "error" : "output"}
              </div>
              <pre>{output}</pre>
            </>
          )}
        </Collapse>
      );
    }
    case "file": {
      if (part.mime?.startsWith("image/"))
        return <img src={part.url} alt={part.filename ?? ""} style={{ maxWidth: 420, borderRadius: 8 }} />;
      return (
        <div className="small">
          <a href={part.url} target="_blank" rel="noreferrer">
            📎 {part.filename ?? part.url}
          </a>
        </div>
      );
    }
    case "patch": {
      return (
        <Collapse head={<span className="name">patch · {(part.files ?? []).length} files</span>}>
          <pre>{(part.files ?? []).join("\n")}</pre>
        </Collapse>
      );
    }
    case "step-finish": {
      const tk = part.tokens ?? {};
      return (
        <div className="step">
          step · {part.reason} · in {tk.input ?? 0} / out {tk.output ?? 0} / reason {tk.reasoning ?? 0}
          {typeof part.cost === "number" && part.cost > 0 ? ` · $${part.cost.toFixed(4)}` : ""}
        </div>
      );
    }
    case "step-start":
      return null;
    case "agent":
      return <div className="step">agent: {part.name}</div>;
    case "subtask":
      return (
        <Collapse head={<span className="name">subtask · {part.agent}</span>}>
          <div className="small muted">{part.description}</div>
          <pre>{part.prompt}</pre>
        </Collapse>
      );
    case "compaction":
      return <div className="step">— context compacted —</div>;
    default:
      return null;
  }
}
