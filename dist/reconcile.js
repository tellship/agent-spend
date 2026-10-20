import { formatUsd, totalCost } from "./pricing.js";
import { cutSessionLabel, sessionLabel } from "./sessionLabel.js";
// A small gap is expected; only a bigger one is worth a line.
const TOLERANCE_PERCENT = 5;
/**
 * Compares our estimate of each session (its lead, subagents and advisor together, as cost-state is
 * session-wide) with the cost Claude Code recorded. Gaps are informational and never change the exit code.
 */
export function reconcileLines(sessions, requests, prices, width) {
    // One unpriced call anywhere makes every estimate partial, so nothing is compared.
    if (totalCost(requests, prices).unpricedCalls > 0)
        return ["Coverage: n/a (prices unverified)"];
    const estimated = new Map();
    for (const request of requests) {
        estimated.set(request.task.session, (estimated.get(request.task.session) ?? 0) + totalCost([request], prices).usd);
    }
    const compared = sessions.flatMap((s) => (s.recordedCostUSD === undefined ? [] : [{ session: s, estimate: estimated.get(s.id) ?? 0, recorded: s.recordedCostUSD }]));
    const skipped = sessions.length - compared.length;
    const skippedNote = skipped > 0 ? [`${skipped} session(s) skipped: no usable cost-state line`] : [];
    if (compared.length === 0)
        return ["Coverage: n/a (no session has a cost-state line)", ...skippedNote];
    const estimateSum = compared.reduce((sum, s) => sum + s.estimate, 0);
    const recordedSum = compared.reduce((sum, s) => sum + s.recorded, 0);
    const coverage = `Coverage: transcripts account for ${((estimateSum / recordedSum) * 100).toFixed(1)}% of recorded session cost (${formatUsd(estimateSum)} estimated, ${formatUsd(recordedSum)} recorded, ${compared.length} session(s)).`;
    const gaps = compared.flatMap((s) => {
        const percent = ((s.estimate - s.recorded) / s.recorded) * 100;
        if (Math.abs(percent) <= TOLERANCE_PERCENT)
            return [];
        const sign = percent > 0 ? "+" : "";
        const before = "Warning: session ";
        const after = ` estimated ${formatUsd(s.estimate)} vs recorded ${formatUsd(s.recorded)} (${sign}${percent.toFixed(1)}%).`;
        // The line must not wrap: a label too long for what the rest of the line leaves is cut, its id kept.
        const label = sessionLabel(s.session);
        const room = width - before.length - after.length;
        return [before + (Array.from(label).length > room ? (cutSessionLabel(label, room) ?? label) : label) + after];
    });
    return [coverage, ...gaps, ...skippedNote];
}
