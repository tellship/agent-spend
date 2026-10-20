import { describe, expect, it } from "vitest";
import { callCost, loadPrices, parsePrices } from "../../src/pricing.js";
import type { ModelUsage } from "../../src/usage.js";
import { TEST_PRICES } from "../helpers/prices.js";

const M = 1_000_000;
const rates = { input: 1, output: 2, cacheWrite5m: 3, cacheWrite1h: 4, cacheRead: 5 };

function call(model: string, usage: Partial<ModelUsage>): ModelUsage {
  return { model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...usage };
}

describe("parsePrices", () => {
  it("keeps fully priced models with their over100k tier and drops models with a null or missing rate", () => {
    const table = parsePrices({
      models: {
        full: { ...rates, over100k: { ...rates, input: 9 } },
        nullRate: { ...rates, cacheRead: null },
        missingRate: { input: 1, output: 2 },
        badTier: { ...rates, over100k: { ...rates, output: null } },
      },
    });

    expect([...table.keys()]).toEqual(["full"]);
    expect(table.get("full")?.over100k?.input).toBe(9);
  });

  it("reads nothing from a document without a models object", () => {
    for (const raw of [null, 5, "x", {}, { models: 3 }]) expect(parsePrices(raw).size).toBe(0);
  });
});

describe("shipped prices.json", () => {
  it("prices the three known models, and only haiku has an over-100k tier", () => {
    const table = loadPrices();

    expect([...table.keys()].sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(table.get("claude-haiku-5-5")?.over100k).toEqual({ input: 0.5, output: 2.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05 });
    expect(table.get("claude-sonnet-5-5")?.over100k).toBeUndefined();
    expect(table.get("claude-opus-5-5")?.over100k).toBeUndefined();
  });
});

describe("callCost", () => {
  it("prices input, output, cache read and the 5m and 1h cache writes at their own rates", () => {
    const usage = call("claude-sonnet-5-5", { input: M, output: M, cacheRead: M, cacheWrite: 2 * M, cacheWrite5m: M, cacheWrite1h: M });

    expect(callCost(usage, TEST_PRICES)).toEqual({ usd: 1 + 2 + 5 + 3 + 4, pricedCalls: 1, unpricedCalls: 0 });
  });

  it("prices cache writes that the tiers do not account for at the 5m rate", () => {
    const usage = call("claude-sonnet-5-5", { cacheWrite: 3 * M, cacheWrite5m: M, cacheWrite1h: M });

    expect(callCost(usage, TEST_PRICES).usd).toBeCloseTo(3 + 4 + 3);
  });

  it("never prices more cache-write tokens than the call recorded", () => {
    const usage = call("claude-sonnet-5-5", { cacheWrite: M, cacheWrite1h: 3 * M });

    expect(callCost(usage, TEST_PRICES).usd).toBeCloseTo(4);
  });

  it("leaves a call of a model that is not in the table unpriced, with no cost", () => {
    expect(callCost(call("claude-mystery-9", { input: M }), TEST_PRICES)).toEqual({ usd: 0, pricedCalls: 0, unpricedCalls: 1 });
  });

  it("switches haiku to the over-100k rates only when the prompt is longer than 100,000 tokens", () => {
    const at = call("claude-haiku-5-5", { input: 100_000 });
    const over = call("claude-haiku-5-5", { input: 100_001 });
    const summed = call("claude-haiku-5-5", { input: 50_000, cacheRead: 30_000, cacheWrite: 20_001, cacheWrite5m: 20_001 });

    expect(callCost(at, TEST_PRICES).usd).toBeCloseTo(0.01);
    expect(callCost(over, TEST_PRICES).usd).toBeCloseTo(0.100001);
    expect(callCost(summed, TEST_PRICES).usd).toBeCloseTo(0.05 + 0.15 + 0.060003);
  });

  it("never switches tier for a model without an over100k block", () => {
    expect(callCost(call("claude-sonnet-5-5", { input: 200_000 }), TEST_PRICES).usd).toBeCloseTo(0.2);
  });
});
