import { expect, test } from "bun:test";
import { messageCost, priceKnown } from "../src/pricing";

const zero = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

test("bills each token class at its own rate", () => {
  // Sonnet 5.5: $2 in, $10 out, $0.20 cache read, 5m write 1.25x, 1h write 2x
  const usd = messageCost("claude-sonnet-5-5", {
    input: 1_000_000,
    output: 500_000,
    reasoning: 500_000,
    cacheRead: 1_000_000,
    cacheWrite5m: 1_000_000,
    cacheWrite1h: 1_000_000,
  });
  expect(usd).toBeCloseTo(2 + 10 + 0.2 + 2.5 + 4, 6);
});

test("thinking tokens are billed as output", () => {
  const a = messageCost("claude-opus-5-5", { ...zero, output: 1_000_000 });
  const b = messageCost("claude-opus-5-5", { ...zero, reasoning: 1_000_000 });
  expect(a).toBeCloseTo(20, 6);
  expect(b).toBeCloseTo(20, 6);
});

test("opus 5.5 cache reads are cheaper than the 10% default", () => {
  expect(messageCost("claude-opus-5-5", { ...zero, cacheRead: 1_000_000 })).toBeCloseTo(0.2, 6);
  expect(messageCost("claude-opus-4-8", { ...zero, cacheRead: 1_000_000 })).toBeCloseTo(0.5, 6);
});

test("haiku 5.5 switches to the long-prompt rate above 100K prompt tokens", () => {
  const small = messageCost("claude-haiku-5-5", { ...zero, input: 100_000, output: 1_000_000 });
  const big = messageCost("claude-haiku-5-5", { ...zero, input: 100_001, output: 1_000_000 });
  expect(small).toBeCloseTo(0.01 + 0.5, 6);
  expect(big).toBeCloseTo(0.050001 + 2.5, 5);
});

test("fast mode doubles opus 5.5 only", () => {
  const u = { ...zero, output: 1_000_000 };
  expect(messageCost("claude-opus-5-5", u, true)).toBeCloseTo(40, 6);
  expect(messageCost("claude-sonnet-5-5", u, true)).toBeCloseTo(10, 6);
});

test("model ids with a date suffix or provider prefix are recognised; unknown cost 0", () => {
  expect(priceKnown("claude-sonnet-5-5-20261001")).toBe(true);
  expect(priceKnown("anthropic.claude-opus-5-5")).toBe(true);
  expect(priceKnown("some-other-model")).toBe(false);
  expect(messageCost("some-other-model", { ...zero, input: 1e9 })).toBe(0);
  expect(messageCost(undefined, { ...zero, input: 1e9 })).toBe(0);
});
