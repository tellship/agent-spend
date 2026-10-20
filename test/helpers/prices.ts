import type { ModelPrice, PriceTable } from "../../src/pricing.js";

/**
 * Pinned rates (USD per million tokens) so tests do not move when prices.json is edited. Every rate of a
 * model differs, so a mixed-up rate shows in the result. Opus is 10x sonnet; haiku has an over-100k tier.
 */
const sonnet = { input: 1, output: 2, cacheWrite5m: 3, cacheWrite1h: 4, cacheRead: 5 };
const times = (n: number) => Object.fromEntries(Object.entries(sonnet).map(([k, v]) => [k, v * n])) as typeof sonnet;

export const TEST_PRICES: PriceTable = new Map<string, ModelPrice>([
  ["claude-sonnet-5-5", sonnet],
  ["claude-opus-5-5", times(10)],
  ["claude-haiku-5-5", { ...times(0.1), over100k: times(1) }],
]);
