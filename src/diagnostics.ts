import { callCost, callsOf, hasCacheSplitMismatch, type PriceTable } from "./pricing.js";
import { printable } from "./table.js";
import type { ApiRequest, Findings } from "./transcripts.js";
import { TESTED_UP_TO, compareVersions } from "./version.js";

export function versionLines(maxVersion: string | undefined): string[] {
  const seen = maxVersion ?? "none";
  const lines = [`Claude Code version seen (max): ${seen}; tested up to ${TESTED_UP_TO}.`];
  if (maxVersion && compareVersions(maxVersion, TESTED_UP_TO) > 0) {
    lines.push(`Warning: transcripts are from a Claude Code version newer than ${TESTED_UP_TO}; the format may have changed.`);
  }
  return lines;
}

export function warningLines(findings: Findings): string[] {
  const lines: string[] = [];
  if (findings.incompleteLines > 0) {
    const noun = findings.incompleteLines === 1 ? "line" : "lines";
    lines.push(`${findings.incompleteLines} incomplete ${noun} skipped`);
  }
  if (findings.malformedUsage > 0) {
    lines.push(`Warning: ${findings.malformedUsage} assistant line(s) had an unrecognised usage shape and were not counted.`);
  }
  return lines;
}

/** Calls whose model has no price are named; calls whose cache writes the 5m/1h split does not cover are counted. */
export function costWarningLines(requests: ApiRequest[], prices: PriceTable): string[] {
  const calls = requests.flatMap(callsOf);
  const unpriced = calls.filter((call) => callCost(call, prices).unpricedCalls > 0);
  const mismatched = calls.filter(hasCacheSplitMismatch);
  const lines: string[] = [];
  if (unpriced.length > 0) {
    const models = [...new Set(unpriced.map((call) => printable(call.model)))].sort().join(", ");
    lines.push(
      `Warning: no price for ${models}: ${unpriced.length} call(s) are left out of the cost total. A row holding one shows unpriced, TOTAL sums only the priced calls, and rows are ranked by total tokens.`,
    );
  }
  if (mismatched.length > 0) {
    lines.push(`Warning: ${mismatched.length} call(s) had cache writes that their 5m/1h split does not account for; the difference was priced at the 5m rate.`);
  }
  return lines;
}

/** Responses written before they finished carry a partial output_tokens, so output, and the cost that follows from it, is a floor. */
export function unfinalizedLines(requests: ApiRequest[]): string[] {
  const unfinalized = requests.filter((r) => !r.finalized);
  if (unfinalized.length === 0) return [];
  const share = (isLead: boolean) => `${unfinalized.filter((r) => r.task.isLead === isLead).length} of ${requests.filter((r) => r.task.isLead === isLead).length}`;
  return [
    `Warning: ${share(false)} subagent responses (and ${share(true)} lead) were still unfinalized when written (no stop_reason); their output tokens, and so Est. cost, are lower bounds.`,
  ];
}

/** An advisor call with no advisor_message on the kept line has no tokens in the advisor row, so that row is a floor. */
export function advisorWithoutUsageLines(requests: ApiRequest[]): string[] {
  const missing = requests.reduce((n, r) => n + Math.max(0, r.advisorCallIds.size - r.advisor.length), 0);
  return missing === 0 ? [] : [`${missing} advisor calls have no usage record; the advisor row is a lower bound.`];
}
