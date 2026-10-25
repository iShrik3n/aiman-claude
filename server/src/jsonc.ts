/**
 * Tiny JSONC (JSON with comments + trailing commas) helpers used to persist
 * extension settings back into opencode's config file.
 *
 * Bun can parse JSONC, but it has no API for editing it without losing the
 * user's comments. We only need to replace one top-level value (`mcp` or
 * `plugins`), so a small scanner keeps the rest of the file byte-for-byte
 * intact. Values we replace are re-serialized as plain JSON; comments inside
 * those two containers are not preserved.
 */

type ValueKind = "object" | "array" | "string" | "primitive";

export type JsoncProp = {
  key: string;
  keyStart: number;
  valueStart: number;
  valueEnd: number;
  kind: ValueKind;
};

export type JsoncRoot = {
  rootOpen: number;
  rootClose: number;
  props: JsoncProp[];
};

const isWs = (c: string | undefined) =>
  c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\ufeff";

export function parseJsonc(text: string): any {
  const bun = (globalThis as any).Bun;
  if (bun?.JSONC?.parse) return bun.JSONC.parse(text);
  // Fallback for Bun versions that predate Bun.JSONC.
  return JSON.parse(stripJsonc(text));
}

/** Remove comments and trailing commas while preserving string contents. */
function stripJsonc(text: string): string {
  let noComments = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      noComments += text.slice(start, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(text.length, i + 2);
      continue;
    }
    noComments += c;
    i++;
  }

  let out = "";
  let inString = false;
  let escaped = false;
  for (let j = 0; j < noComments.length; j++) {
    const c = noComments[j]!;
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let k = j + 1;
      while (k < noComments.length && isWs(noComments[k])) k++;
      if (noComments[k] === "}" || noComments[k] === "]") continue;
    }
    out += c;
  }
  return out.replace(/^\ufeff/, "");
}

function skipTrivia(text: string, start: number): number {
  let i = start;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < len && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < len && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(len, i + 2);
      continue;
    }
    break;
  }
  return i;
}

function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"') return i + 1;
    i++;
  }
  throw new Error("unterminated string in config");
}

function valueEnd(text: string, start: number): number {
  let i = skipTrivia(text, start);
  const c = text[i];
  if (c === '"') return stringEnd(text, i);
  if (c === "{" || c === "[") {
    const stack: string[] = [];
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        i = stringEnd(text, i);
        continue;
      }
      if (ch === "/" && text[i + 1] === "/") {
        i += 2;
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (ch === "/" && text[i + 1] === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i = Math.min(text.length, i + 2);
        continue;
      }
      if (ch === "{" || ch === "[") {
        stack.push(ch);
        i++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        const open = stack.pop();
        if (!open) throw new Error("unbalanced config value");
        i++;
        if (!stack.length) return i;
        continue;
      }
      i++;
    }
    throw new Error("unterminated object/array in config");
  }

  // Primitive (true/false/null/number). Stop at a delimiter, whitespace or a
  // comment. Trailing whitespace is trimmed so replacements keep formatting.
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "," || ch === "}" || ch === "]" || isWs(ch)) break;
    if (ch === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) break;
    i++;
  }
  return i;
}

/** Locate the top-level properties of a JSONC document's root object. */
export function scanRoot(text: string): JsoncRoot {
  const rootOpen = skipTrivia(text, 0);
  if (text[rootOpen] !== "{") throw new Error("config root is not an object");
  const props: JsoncProp[] = [];
  let i = rootOpen + 1;
  while (i < text.length) {
    i = skipTrivia(text, i);
    const c = text[i];
    if (c === "}") return { rootOpen, rootClose: i, props };
    if (c === ",") {
      i++;
      continue;
    }
    if (c !== '"') throw new Error("expected a config key");
    const keyStart = i;
    const keyEnd = stringEnd(text, i);
    let key: string;
    try {
      key = JSON.parse(text.slice(keyStart, keyEnd));
    } catch {
      throw new Error("invalid config key");
    }
    i = skipTrivia(text, keyEnd);
    if (text[i] !== ":") throw new Error(`expected ':' after ${key}`);
    const valueStart = skipTrivia(text, i + 1);
    const end = valueEnd(text, valueStart);
    const first = text[valueStart];
    props.push({
      key,
      keyStart,
      valueStart,
      valueEnd: end,
      kind: first === "{" ? "object" : first === "[" ? "array" : first === '"' ? "string" : "primitive",
    });
    i = skipTrivia(text, end);
  }
  throw new Error("unterminated config root");
}

function lineStart(text: string, pos: number): number {
  const n = text.lastIndexOf("\n", Math.max(0, pos - 1));
  return n < 0 ? 0 : n + 1;
}

function lineIndent(text: string, pos: number): string {
  const start = lineStart(text, pos);
  let i = start;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  return text.slice(start, i);
}

/**
 * Serialize `value` so it can follow `"key": ` on a line indented by `indent`.
 * JSON.stringify's own two-space indentation is relative to the property line.
 */
function serializeValue(value: unknown, indent: string): string {
  const raw = JSON.stringify(value, null, 2);
  if (raw == null) return "null";
  if (!raw.includes("\n")) return raw;
  return raw
    .split("\n")
    .map((line, i) => (i === 0 ? line : indent + line))
    .join("\n");
}

/**
 * Set (or insert) a top-level property. The rest of the document — including
 * comments, trailing commas and indentation — is left untouched.
 */
export function setRootValue(text: string, key: string, value: unknown): string {
  const root = scanRoot(text);
  const existing = root.props.find((p) => p.key === key);
  if (existing) {
    const indent = lineIndent(text, existing.valueStart);
    const replacement = serializeValue(value, indent);
    return text.slice(0, existing.valueStart) + replacement + text.slice(existing.valueEnd);
  }

  const first = root.props[0];
  const indent = first ? lineIndent(text, first.keyStart) : lineIndent(text, root.rootOpen) + "  ";
  const serialized = serializeValue(value, indent);
  const next = `"${key}": ${serialized}`;

  if (!root.props.length) {
    const insertAt = root.rootOpen + 1;
    return text.slice(0, insertAt) + `\n${indent}${next}` + text.slice(insertAt);
  }

  const last = root.props[root.props.length - 1]!;
  let insertAt = last.valueEnd;
  const after = skipTrivia(text, insertAt);
  if (text[after] === ",") {
    insertAt = after + 1;
    return text.slice(0, insertAt) + `\n${indent}${next}` + text.slice(insertAt);
  }
  return text.slice(0, insertAt) + `,\n${indent}${next}` + text.slice(insertAt);
}
