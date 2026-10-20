import { advisorWithoutUsageLines, costWarningLines, unfinalizedLines, versionLines, warningLines } from "./diagnostics.js";
import { addCost, callCost, formatRowCost, formatTotalCost, rankByCost, totalCost, weight, ZERO_COST, type Cost, type PriceTable } from "./pricing.js";
import { reconcileLines } from "./reconcile.js";
import { renderTable } from "./table.js";
import { LEAD, type ApiRequest, type Findings, type SessionInfo } from "./transcripts.js";
import { addUsage, ZERO_USAGE, type ModelUsage, type Usage } from "./usage.js";

export const ADVISOR = "advisor";
const HEADER = ["Agent", "Requests", "Input", "Output", "Cache read", "Cache write", "Est. cost", "Share"];

interface AgentRow {
  agent: string;
  requests: number;
  usage: Usage;
  cost: Cost;
}

function addTo(rows: Map<string, AgentRow>, agent: string, call: ModelUsage, prices: PriceTable): void {
  const row = rows.get(agent) ?? { agent, requests: 0, usage: ZERO_USAGE, cost: ZERO_COST };
  rows.set(agent, { agent, requests: row.requests + 1, usage: addUsage(row.usage, call), cost: addCost(row.cost, callCost(call, prices)) });
}

/** One row per agent; advisor_message iterations are counted in their own "advisor" row, never in the agent's. */
export function rowsByAgent(requests: ApiRequest[], prices: PriceTable): AgentRow[] {
  const rows = new Map<string, AgentRow>();
  for (const request of requests) {
    addTo(rows, request.agent, request.usage, prices);
    for (const advisor of request.advisor) addTo(rows, ADVISOR, advisor, prices);
  }
  return [...rows.values()];
}

function tableCells(row: AgentRow, costText: string, share: number): string[] {
  const u = row.usage;
  const shareText = Number.isNaN(share) ? "-" : `${(share * 100).toFixed(1)}%`;
  return [row.agent, row.requests, u.input, u.output, u.cacheRead, u.cacheWrite].map(String).concat(costText, shareText);
}

export function formatAgentReport(projectDir: string, requests: ApiRequest[], findings: Findings, prices: PriceTable, sessions: SessionInfo[], width: number): string {
  const rows = rowsByAgent(requests, prices);
  const byCost = rankByCost(rows);
  rows.sort((a, b) => weight(b, byCost) - weight(a, byCost) || a.agent.localeCompare(b.agent));
  const total: AgentRow = {
    agent: "TOTAL",
    requests: rows.reduce((n, r) => n + r.requests, 0),
    usage: rows.reduce((u, r) => addUsage(u, r.usage), ZERO_USAGE),
    cost: totalCost(requests, prices),
  };
  const grandTotal = weight(total, byCost);
  const share = (row: AgentRow) => (grandTotal === 0 ? NaN : weight(row, byCost) / grandTotal);
  const lines = [
    `Project: ${projectDir}`,
    ...versionLines(findings.maxVersion),
    byCost
      ? "Sorted by Est. cost, highest first; Share is of total cost."
      : "Sorted by total tokens (input + output + cache read + cache write); Share is of total tokens. Est. cost cannot rank the rows while some are unpriced.",
    "",
    ...renderTable(HEADER, [...rows.map((r) => tableCells(r, formatRowCost(r.cost), share(r))), tableCells(total, formatTotalCost(total.cost), share(total))]),
    ...costWarningLines(requests, prices),
    ...unfinalizedLines(requests),
    ...advisorWithoutUsageLines(requests),
    ...reconcileLines(sessions, requests, prices, width),
    ...warningLines(findings),
  ];
  return lines.join("\n") + "\n";
}
