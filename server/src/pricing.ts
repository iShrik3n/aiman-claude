/**
 * API-equivalent cost of a Claude Code message. Transcripts carry token counts
 * but no price, so this is an estimate at list prices (USD per million tokens;
 * Anthropic's published rates as of 2026-10). It is what the same tokens would
 * cost on the API, not what a subscription bills.
 *
 * Caveats: US-only inference, data-residency and Priority Tier multipliers are
 * not applied, and models missing from the table cost 0.
 */

type Price = {
  input: number;
  output: number;
  /** Cache reads; defaults to 10% of input. */
  cacheRead?: number;
  /** Above this many prompt tokens a request is billed at `long`. */
  longAbove?: number;
  long?: { input: number; output: number };
};

const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    longAbove: 100_000,
    long: { input: 0.5, output: 2.5 },
  },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Fast mode bills Opus 5.5 at twice the standard rate. */
const FAST_MULTIPLIER: Record<string, number> = { "claude-opus-5-5": 2 };

export type Usage = {
  input: number;
  /** Output excluding thinking. */
  output: number;
  reasoning: number;
  cacheRead: number;
  /** Cache writes with the 5-minute TTL (1.25x input). */
  cacheWrite5m: number;
  /** Cache writes with the 1-hour TTL (2x input). Claude Code uses these. */
  cacheWrite1h: number;
};

export const priceKnown = (model: string | undefined) => !!lookup(model);

function lookup(model: string | undefined): Price | null {
  if (!model) return null;
  const id = model.replace(/^anthropic[./]/, "").replace(/-\d{8}$/, "").replace(/\[.*\]$/, "");
  return PRICES[id] ?? null;
}

export function messageCost(model: string | undefined, u: Usage, fast = false): number {
  const p = lookup(model);
  if (!p) return 0;
  const id = model!.replace(/^anthropic[./]/, "").replace(/-\d{8}$/, "").replace(/\[.*\]$/, "");
  const prompt = u.input + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;
  const rate = p.long && p.longAbove && prompt > p.longAbove ? p.long : p;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const usd =
    (u.input * rate.input +
      (u.output + u.reasoning) * rate.output +
      u.cacheRead * cacheRead +
      u.cacheWrite5m * rate.input * 1.25 +
      u.cacheWrite1h * rate.input * 2) /
    1e6;
  return usd * (fast ? (FAST_MULTIPLIER[id] ?? 1) : 1);
}
