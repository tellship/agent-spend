import { advisorWithoutUsageLines, costWarningLines, unfinalizedLines, versionLines, warningLines } from "./diagnostics.js";
import { addCost, callsOf, callCost, formatRowCost, formatTotalCost, rankByCost, totalCost, weight, ZERO_COST } from "./pricing.js";
import { cutSessionLabel, sessionLabel } from "./sessionLabel.js";
import { DEFAULT_WIDTH, printable, renderTable } from "./table.js";
import { addUsage, ZERO_USAGE } from "./usage.js";
const HEADER = ["Task", "Agent", "Requests", "Input", "Output", "Cache read", "Cache write", "Est. cost"];
const NO_DESCRIPTION = "(no description)";
// Narrowest the cut columns may get; below these the table is allowed to run past the terminal width.
const DESCRIPTION_FLOOR = 8;
const AGENT_FLOOR = 6;
/** One row per transcript file: a subagent invocation, or a session's lead. Advisor tokens stay with the row whose line carried them. */
export function rowsByTask(requests, prices) {
    const rows = new Map();
    for (const request of requests) {
        const row = rows.get(request.task.id) ?? { task: request.task, agent: request.agent, requests: 0, usage: ZERO_USAGE, cost: ZERO_COST };
        const usage = request.advisor.reduce(addUsage, addUsage(row.usage, request.usage));
        const cost = callsOf(request).reduce((sum, call) => addCost(sum, callCost(call, prices)), row.cost);
        rows.set(request.task.id, { ...row, requests: row.requests + 1, usage, cost });
    }
    return [...rows.values()];
}
function tableCells(first, agent, requests, u, costText) {
    return [first, agent, requests, u.input, u.output, u.cacheRead, u.cacheWrite].map(String).concat(costText);
}
export function formatTaskReport(projectDir, requests, findings, prices, sessions, options) {
    // Every lead task belongs to a session that loadProject listed.
    const sessionsById = new Map(sessions.map((s) => [s.id, s]));
    const label = (task) => (task.isLead ? sessionLabel(sessionsById.get(task.session)) : printable(task.description ?? "") || NO_DESCRIPTION);
    const rows = rowsByTask(requests, prices);
    const byCost = rankByCost(rows);
    rows.sort((a, b) => weight(b, byCost) - weight(a, byCost) || label(a.task).localeCompare(label(b.task)));
    const shown = rows.slice(0, options.top);
    const hidden = rows.length - shown.length;
    const hiddenCost = rows.slice(shown.length).reduce((sum, r) => addCost(sum, r.cost), ZERO_COST);
    const total = tableCells("TOTAL", "-", rows.reduce((n, r) => n + r.requests, 0), rows.reduce((u, r) => addUsage(u, r.usage), ZERO_USAGE), formatTotalCost(totalCost(requests, prices)));
    const lines = [
        `Project: ${projectDir}`,
        ...versionLines(findings.maxVersion),
        byCost
            ? "Sorted by Est. cost, highest first."
            : "Sorted by total tokens (input + output + cache read + cache write). Est. cost cannot rank the rows while some are unpriced.",
        "",
        ...renderTable(HEADER, [...shown.map((r) => tableCells(label(r.task), printable(r.agent), r.requests, r.usage, formatRowCost(r.cost))), total], {
            maxWidth: options.width ?? DEFAULT_WIDTH,
            // Only a lead label ends in the session id; a description is cut like any other text.
            cut: (row, width) => (shown[row].task.isLead ? cutSessionLabel(label(shown[row].task), width) : undefined),
            // The agent gives up width first: the description is what the user came for.
            shrink: [
                { column: 1, floor: AGENT_FLOOR },
                { column: 0, floor: DESCRIPTION_FLOOR },
            ],
        }),
        ...(hidden > 0 ? [`+${hidden} more, ${formatRowCost(hiddenCost)} (included in TOTAL)`] : []),
        ...costWarningLines(requests, prices),
        ...unfinalizedLines(requests),
        ...advisorWithoutUsageLines(requests),
        ...warningLines(findings),
    ];
    return lines.join("\n") + "\n";
}
