import fs from "node:fs";
import { totalTokens } from "./usage.js";
const PER_MILLION = 1_000_000;
const OVER_TIER_PROMPT = 100_000;
const RATE_KEYS = ["input", "output", "cacheWrite5m", "cacheWrite1h", "cacheRead"];
export const ZERO_COST = { usd: 0, pricedCalls: 0, unpricedCalls: 0 };
export function addCost(a, b) {
    return { usd: a.usd + b.usd, pricedCalls: a.pricedCalls + b.pricedCalls, unpricedCalls: a.unpricedCalls + b.unpricedCalls };
}
/** All five rates as numbers, else undefined: one null rate leaves the whole model unpriced. */
function parseRates(raw) {
    if (typeof raw !== "object" || raw === null)
        return undefined;
    const r = raw;
    if (!RATE_KEYS.every((key) => typeof r[key] === "number" && Number.isFinite(r[key]) && r[key] >= 0))
        return undefined;
    return { input: r.input, output: r.output, cacheWrite5m: r.cacheWrite5m, cacheWrite1h: r.cacheWrite1h, cacheRead: r.cacheRead };
}
/** Models with a complete rate set; an over100k block that is present but incomplete drops the model rather than price long prompts wrongly. */
export function parsePrices(raw) {
    const table = new Map();
    const models = raw?.models;
    if (typeof models !== "object" || models === null)
        return table;
    for (const [name, entry] of Object.entries(models)) {
        const rates = parseRates(entry);
        if (!rates)
            continue;
        const tier = entry.over100k;
        const over100k = tier === undefined ? undefined : parseRates(tier);
        if (tier !== undefined && !over100k)
            continue;
        table.set(name, over100k ? { ...rates, over100k } : rates);
    }
    return table;
}
/** prices.json sits at the project root, one level above both src/ and dist/. */
export function loadPrices() {
    return parsePrices(JSON.parse(fs.readFileSync(new URL("../prices.json", import.meta.url), "utf8")));
}
/** The 5m / 1h tiers never claim more tokens than the call's cache writes; whatever they leave over is "unsplit". */
function splitCacheWrites(call) {
    const h1 = Math.min(call.cacheWrite1h, call.cacheWrite);
    const m5 = Math.min(call.cacheWrite5m, call.cacheWrite - h1);
    return { m5, h1, unsplit: call.cacheWrite - h1 - m5 };
}
/** True when the 5m and 1h tiers do not add up to the cache writes, so part of the price rests on the 5m rate. */
export function hasCacheSplitMismatch(call) {
    return call.cacheWrite5m + call.cacheWrite1h !== call.cacheWrite;
}
/** Cost of one call: tokens x the per-model rates. The prompt length (input + cache read + cache write) picks the rate tier. */
export function callCost(call, prices) {
    const price = prices.get(call.model);
    if (!price)
        return { usd: 0, pricedCalls: 0, unpricedCalls: 1 };
    const rates = price.over100k && call.input + call.cacheRead + call.cacheWrite > OVER_TIER_PROMPT ? price.over100k : price;
    const { m5, h1, unsplit } = splitCacheWrites(call);
    const perMillion = call.input * rates.input + call.output * rates.output + call.cacheRead * rates.cacheRead + (m5 + unsplit) * rates.cacheWrite5m + h1 * rates.cacheWrite1h;
    return { usd: perMillion / PER_MILLION, pricedCalls: 1, unpricedCalls: 0 };
}
/** The response itself, then each advisor iteration; every one is priced at its own model. */
export function callsOf(request) {
    return [request.usage, ...request.advisor];
}
/** Calls are summed in request order, so every view that calls this over the same requests gets the identical total. */
export function totalCost(requests, prices) {
    return requests.flatMap(callsOf).reduce((sum, call) => addCost(sum, callCost(call, prices)), ZERO_COST);
}
const UNPRICED = "unpriced";
/** The one dollar format of every table and line. */
export function formatUsd(amount) {
    return `$${amount.toFixed(2)}`;
}
/** A row holding any unpriced call shows "unpriced": its priced part would read as the whole. */
export function formatRowCost(cost) {
    return cost.unpricedCalls > 0 ? UNPRICED : formatUsd(cost.usd);
}
/** TOTAL sums the priced calls only; it reads "unpriced" just when there are none. */
export function formatTotalCost(cost) {
    return cost.pricedCalls === 0 && cost.unpricedCalls > 0 ? UNPRICED : formatUsd(cost.usd);
}
/** Rows rank and share by cost only when every row is priced; one unpriced row puts all of them on tokens. */
export function rankByCost(rows) {
    return rows.every((row) => row.cost.unpricedCalls === 0);
}
export function weight(row, byCost) {
    return byCost ? row.cost.usd : totalTokens(row.usage);
}
