export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

export function totalTokens(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Counts that may be absent (null/undefined read as 0) but must be a count when present. */
function optionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return 0;
  return isCount(value) ? value : undefined;
}

/**
 * Shape-based read of a usage object (a message's usage or one of its iterations).
 * Returns undefined when the shape is not the one this tool was tested against.
 */
export function readUsage(raw: unknown): Usage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const cacheRead = optionalCount(r.cache_read_input_tokens);
  const cacheWrite = optionalCount(r.cache_creation_input_tokens);
  if (!isCount(r.input_tokens) || !isCount(r.output_tokens)) return undefined;
  if (cacheRead === undefined || cacheWrite === undefined) return undefined;
  return { input: r.input_tokens, output: r.output_tokens, cacheRead, cacheWrite };
}

export const UNKNOWN_MODEL = "(unknown model)";

/** One priced unit of usage: tokens plus the model that served them and the 5m/1h split of the cache writes. */
export interface ModelUsage extends Usage {
  model: string;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

function tierCount(value: unknown): number {
  return isCount(value) ? value : 0;
}

/**
 * Usage tagged with its model and the 5m/1h split of its cache writes. A missing model is tagged
 * UNKNOWN_MODEL (priced as unpriced) rather than rejected, so the tokens still count. A missing or
 * odd cache_creation split reads as 0/0: those cache writes are then priced at the 5m rate.
 */
export function readModelUsage(raw: unknown, model: unknown): ModelUsage | undefined {
  const usage = readUsage(raw);
  if (!usage) return undefined;
  const tiers = (raw as { cache_creation?: { ephemeral_5m_input_tokens?: unknown; ephemeral_1h_input_tokens?: unknown } | null }).cache_creation;
  return {
    ...usage,
    model: typeof model === "string" ? model : UNKNOWN_MODEL,
    cacheWrite5m: tierCount(tiers?.ephemeral_5m_input_tokens),
    cacheWrite1h: tierCount(tiers?.ephemeral_1h_input_tokens),
  };
}
