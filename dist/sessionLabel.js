import { printable } from "./table.js";
import { SESSION_ID_CHARS } from "./transcripts.js";
/** Fewer characters of a title than this say nothing; the bare id is shown instead. */
const MIN_HEAD = 8;
/** Splits a label into its head and its "(id)" tail. */
const WITH_ID = /^(.*) \(([^()]*)\)$/su;
const pad2 = (n) => String(n).padStart(2, "0");
/** The user's own clock, so an evening session is not dated tomorrow. */
function localStamp(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** How a session is named in the reports: its title, else its start and branch, then its short id. */
export function sessionLabel(session) {
    const id = session.id.slice(0, SESSION_ID_CHARS);
    // The title and the branch are text from the transcript: untrusted terminal input.
    const title = printable(session.title ?? "");
    if (title)
        return `${title} (${id})`;
    const when = session.startedAt ? localStamp(session.startedAt) : "";
    const where = [when, printable(session.gitBranch ?? "")].filter(Boolean).join(" \u00b7 ");
    return where ? `${where} (${id})` : id;
}
/** Fits a label into a column: the head is cut with an ellipsis, the id is the part that must survive. Undefined leaves a label without an id tail to the plain cut. */
export function cutSessionLabel(label, width) {
    const parts = WITH_ID.exec(label);
    if (!parts)
        return undefined;
    const [, head, id] = parts;
    const tail = ` (${id})`;
    const room = width - tail.length - 1;
    if (room < MIN_HEAD)
        return id;
    return Array.from(head).slice(0, room).join("") + "\u2026" + tail;
}
