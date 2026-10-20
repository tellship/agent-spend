import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Synthetic transcript builders. Never copy real transcripts into fixtures.

export interface AssistantOptions {
  id: string;
  requestId?: string;
  uuid?: string;
  model?: string;
  version?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** The 5m / 1h split of cache writes; emitted as usage.cache_creation only when one of them is given. */
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  iterations?: unknown[];
  text?: string;
  /** Content blocks written after the text block, e.g. an advisor server_tool_use. */
  extraContent?: unknown[];
  /** message.stop_reason: "end_turn" when omitted, null for a streaming snapshot written before the response finished. */
  stopReason?: string | null;
  /** Leaves stop_reason out of the line altogether. */
  noStopReason?: boolean;
  /** ISO-8601 timestamp of the line; left out when omitted. */
  timestamp?: string;
  /** The git branch the session was on; left out when omitted. */
  gitBranch?: string;
}

/** The optional timestamp and gitBranch fields that every user and assistant line can carry. */
function lineContext(o: { timestamp?: string; gitBranch?: string }): Record<string, string> {
  return { ...(o.timestamp === undefined ? {} : { timestamp: o.timestamp }), ...(o.gitBranch === undefined ? {} : { gitBranch: o.gitBranch }) };
}

export function assistantLine(o: AssistantOptions): string {
  const usage: Record<string, unknown> = {
    input_tokens: o.input ?? 0,
    output_tokens: o.output ?? 0,
    cache_read_input_tokens: o.cacheRead ?? 0,
    cache_creation_input_tokens: o.cacheWrite ?? 0,
  };
  if (o.cacheWrite5m !== undefined || o.cacheWrite1h !== undefined) {
    usage.cache_creation = { ephemeral_5m_input_tokens: o.cacheWrite5m ?? 0, ephemeral_1h_input_tokens: o.cacheWrite1h ?? 0 };
  }
  if (o.iterations) usage.iterations = o.iterations;
  const stopReason = o.noStopReason ? {} : { stop_reason: o.stopReason === undefined ? "end_turn" : o.stopReason };
  return JSON.stringify({
    type: "assistant",
    uuid: o.uuid ?? `uuid-${o.id}-${o.output ?? 0}`,
    requestId: o.requestId,
    version: o.version ?? "2.1.296",
    ...lineContext(o),
    message: {
      id: o.id,
      model: o.model ?? "claude-sonnet-5-5",
      content: [{ type: "text", text: o.text ?? "synthetic" }, ...(o.extraContent ?? [])],
      ...stopReason,
      usage,
    },
  });
}

/** The content block Claude Code writes when the model calls the advisor; `input` is the call's free-text payload. */
export function advisorCall(id: string, input: unknown = {}): unknown {
  return { type: "server_tool_use", id, name: "advisor", input };
}

/** The session-wide cost Claude Code records; later lines of a session supersede earlier ones. */
export function costStateLine(totalCostUSD: unknown): string {
  return JSON.stringify({ type: "cost-state", totalCostUSD, modelUsage: {}, hasUnknownModelCost: false });
}

export function userLine(text = "synthetic prompt", context: { timestamp?: string; gitBranch?: string } = {}): string {
  return JSON.stringify({ type: "user", ...lineContext(context), message: { role: "user", content: text } });
}

/** The line Claude Code writes when it titles a session; `title` is unknown so tests can write a malformed one. */
export function aiTitleLine(title: unknown, sessionId = "synthetic-session"): string {
  return JSON.stringify({ type: "ai-title", aiTitle: title, sessionId });
}

export function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "spend-report-")));
}

/** Writes lines to <home>/.claude/projects/<projectDir>/<relPath>. */
export function writeTranscript(home: string, projectDir: string, relPath: string, lines: string[]): void {
  const file = path.join(home, ".claude", "projects", projectDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

/** Writes <session>/subagents/agent-<agentId>.meta.json; description is free text written by the lead. */
export function writeMeta(home: string, projectDir: string, session: string, agentId: string, meta: object): void {
  const file = path.join(home, ".claude", "projects", projectDir, session, "subagents", `agent-${agentId}.meta.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(meta));
}
