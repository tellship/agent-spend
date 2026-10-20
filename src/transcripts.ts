import fs from "node:fs";
import path from "node:path";
import { readModelUsage, totalTokens, type ModelUsage } from "./usage.js";
import { maxVersion } from "./version.js";

export const LEAD = "lead";
/** How many characters of a session id identify it in the reports. */
export const SESSION_ID_CHARS = 8;
export const UNKNOWN_AGENT = "(unknown agent)";

/** The transcript file a response came from: the lead's session file or one subagent invocation. */
export interface TaskRef {
  /** The session id, for the lead and for each of its subagents. */
  session: string;
  /** Lead: the session id. Subagent: `<session id>/<agent file name>`. Unique per transcript file. */
  id: string;
  isLead: boolean;
  /** Free text the lead wrote into meta.json; undefined when meta.json is missing or has no string description. */
  description: string | undefined;
}

/** One deduplicated API response, attributed to the agent whose transcript file carried it. */
export interface ApiRequest {
  agent: string;
  task: TaskRef;
  usage: ModelUsage;
  /** One entry per usage.iterations item of type advisor_message, each at its own model. */
  advisor: ModelUsage[];
  /** False when the kept line has no stop_reason: a streaming snapshot written before the response finished, whose output_tokens is a lower bound. */
  finalized: boolean;
  /** Ids of the advisor calls (server_tool_use blocks named advisor) on ALL lines of the response, not just the kept one. */
  advisorCallIds: Set<string>;
}

export interface Findings {
  /** Lines that were not valid JSON, e.g. the half-written last line of a live session. */
  incompleteLines: number;
  /** Assistant lines whose usage did not have the expected shape; these are not counted. */
  malformedUsage: number;
  /** Highest Claude Code version stamped on any line. */
  maxVersion: string | undefined;
}

/** What a session's own file says about the session itself; subagent files carry none of it. */
export interface LeadFacts {
  /** The total cost of the session's last cost-state line, when there is a usable one. */
  recordedCostUSD: number | undefined;
  /** The text of the session's last ai-title line. */
  title: string | undefined;
  /** The timestamp of the first line that has one, as written (ISO-8601, UTC). */
  startedAt: string | undefined;
  /** The git branch of the first line that names one. */
  gitBranch: string | undefined;
}

/** A session and what its lead file says about it. */
export interface SessionInfo extends LeadFacts {
  id: string;
}

const ISO_STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d/;
const NO_FACTS: LeadFacts = { recordedCostUSD: undefined, title: undefined, startedAt: undefined, gitBranch: undefined };

export interface ProjectTranscripts {
  fileCount: number;
  requests: ApiRequest[];
  sessions: SessionInfo[];
  findings: Findings;
}

type DedupeMap = Map<string, ApiRequest>;

function readAdvisorUsage(iterations: unknown): ModelUsage[] | undefined {
  if (iterations === undefined || iterations === null) return [];
  if (!Array.isArray(iterations)) return undefined;
  const advisor: ModelUsage[] = [];
  for (const item of iterations) {
    if (item?.type !== "advisor_message") continue;
    const usage = readModelUsage(item, item.model);
    if (!usage) return undefined;
    advisor.push(usage);
  }
  return advisor;
}

/** Only the type, name and id of a content block are read, never what the block says. */
function readAdvisorCallIds(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block?.type === "server_tool_use" && block.name === "advisor" && typeof block.id === "string").map((block) => block.id);
}

/**
 * Adds one file's responses to the session's dedupe map: the last line per key wins.
 * Returns the facts a lead file states about its session (subagent files state none).
 */
function ingestFile(file: string, agent: string, task: TaskRef, map: DedupeMap, findings: Findings): LeadFacts {
  const facts = { ...NO_FACTS };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line === "") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      findings.incompleteLines += 1;
      continue;
    }
    findings.maxVersion = maxVersion(findings.maxVersion, entry?.version);
    if (entry?.type === "cost-state" && task.isLead) {
      // A recorded cost can be compared only when it is a positive number.
      const cost = entry.totalCostUSD;
      facts.recordedCostUSD = typeof cost === "number" && Number.isFinite(cost) && cost > 0 ? cost : undefined;
    }
    if (task.isLead) {
      if (entry?.type === "ai-title" && typeof entry.aiTitle === "string") facts.title = entry.aiTitle;
      // The shape check keeps Date from guessing at odd strings; the parse check rejects shapes such as month 13.
      if (typeof entry?.timestamp === "string" && ISO_STAMP.test(entry.timestamp) && !Number.isNaN(Date.parse(entry.timestamp))) facts.startedAt ??= entry.timestamp;
      if (typeof entry?.gitBranch === "string" && entry.gitBranch !== "") facts.gitBranch ??= entry.gitBranch;
    }
    if (entry?.type !== "assistant" || entry.message?.model === "<synthetic>") continue;

    const usage = readModelUsage(entry.message?.usage, entry.message?.model);
    const advisor = readAdvisorUsage(entry.message?.usage?.iterations);
    if (!usage || !advisor || typeof entry.message.id !== "string") {
      findings.malformedUsage += 1;
      continue;
    }
    if (totalTokens(usage) === 0 && advisor.length === 0) continue;

    // The blocks of a streamed response sit on its earlier lines: the ids of every line of the key are kept, the other fields come from the last.
    const key = `${entry.message.id}|${entry.requestId ?? entry.uuid}`;
    const advisorCallIds = new Set([...(map.get(key)?.advisorCallIds ?? []), ...readAdvisorCallIds(entry.message.content)]);
    map.set(key, { agent, task, usage, advisor, finalized: typeof entry.message.stop_reason === "string", advisorCallIds });
  }
  return facts;
}

interface SubagentMeta {
  agentType: string;
  description: string | undefined;
}

function readMeta(file: string): SubagentMeta {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    return {
      agentType: typeof meta.agentType === "string" ? meta.agentType : UNKNOWN_AGENT,
      description: typeof meta.description === "string" ? meta.description : undefined,
    };
  } catch {
    return { agentType: UNKNOWN_AGENT, description: undefined };
  }
}

function subagentFiles(sessionDir: string): string[] {
  const dir = path.join(sessionDir, "subagents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => path.join(dir, name));
}

export function loadProject(projectDir: string): ProjectTranscripts {
  const findings: Findings = { incompleteLines: 0, malformedUsage: 0, maxVersion: undefined };
  const requests: ApiRequest[] = [];
  const sessions: SessionInfo[] = [];
  let fileCount = 0;
  if (!fs.existsSync(projectDir)) return { fileCount, requests, sessions, findings };

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const sessionIds = new Set<string>();
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".jsonl")) sessionIds.add(e.name.slice(0, -".jsonl".length));
    if (e.isDirectory()) sessionIds.add(e.name);
  }

  for (const id of sessionIds) {
    // One map per session: lead first, so a key also present in a subagent file is attributed to the subagent.
    const map: DedupeMap = new Map();
    const filesBefore = fileCount;
    const leadFile = path.join(projectDir, `${id}.jsonl`);
    let facts = NO_FACTS;
    if (fs.existsSync(leadFile)) {
      fileCount += 1;
      facts = ingestFile(leadFile, LEAD, { session: id, id, isLead: true, description: undefined }, map, findings);
    }
    for (const file of subagentFiles(path.join(projectDir, id))) {
      fileCount += 1;
      const meta = readMeta(file);
      const task = { session: id, id: `${id}/${path.basename(file, ".jsonl")}`, isLead: false, description: meta.description };
      ingestFile(file, meta.agentType, task, map, findings);
    }
    requests.push(...map.values());
    // A directory such as memory/ holds no transcripts and is not a session.
    if (fileCount > filesBefore) sessions.push({ id, ...facts });
  }
  return { fileCount, requests, sessions, findings };
}
