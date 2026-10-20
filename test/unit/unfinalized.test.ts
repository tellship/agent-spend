import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/run.js";
import { assistantLine, makeTempDir, writeMeta, writeTranscript } from "../helpers/fixture.js";
import { TEST_PRICES } from "../helpers/prices.js";

const DIR = "-work-demo";
const CWD = "/work/demo";
const PREFIX = "Warning: ";
const SUFFIX = " were still unfinalized when written (no stop_reason); their output tokens, and so Est. cost, are lower bounds.";

let home: string;
beforeEach(() => {
  home = makeTempDir();
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

const VIEWS: Array<[string, string[]]> = [
  ["--by agent", ["--by", "agent"]],
  ["--by task", ["--by", "task", "--top", "1"]],
];

function report(argv: string[]) {
  return run(argv, { home, cwd: CWD, width: 200, prices: TEST_PRICES }).stdout;
}

function warningLine(stdout: string): string | undefined {
  return stdout.split("\n").find((l) => l.includes("unfinalized"));
}

function expectedWarning(sub: string, lead: string) {
  return `${PREFIX}${sub} subagent responses (and ${lead} lead)${SUFFIX}`;
}

describe.each(VIEWS)("unfinalized responses, %s", (_name, argv) => {
  it("counts kept responses without a stop_reason, split into subagent and lead, after the table", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null }),
      assistantLine({ id: "m2", requestId: "r2", output: 1 }),
    ]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m3", requestId: "r3", output: 1, stopReason: null }),
      assistantLine({ id: "m4", requestId: "r4", output: 1, noStopReason: true }),
      assistantLine({ id: "m5", requestId: "r5", output: 1 }),
    ]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Doc" });

    const stdout = report(argv);

    expect(warningLine(stdout)).toBe(expectedWarning("2 of 3", "1 of 2"));
    expect(stdout.indexOf("unfinalized")).toBeGreaterThan(stdout.indexOf("TOTAL"));
  });

  it("prints both parts even when one side has no responses", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null })]);

    expect(warningLine(report(argv))).toBe(expectedWarning("0 of 0", "1 of 1"));
  });

  it("prints no warning when every kept response has a stop_reason", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 1 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", output: 1, stopReason: "tool_use" })]);

    expect(report(argv)).not.toContain("unfinalized");
  });

  it("judges a response by its last line: a snapshot superseded by a finalized line is not counted, the reverse is", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null }),
      assistantLine({ id: "m1", requestId: "r1", output: 9 }),
      assistantLine({ id: "m2", requestId: "r2", output: 9 }),
      assistantLine({ id: "m2", requestId: "r2", output: 1, stopReason: null }),
    ]);

    expect(warningLine(report(argv))).toBe(expectedWarning("0 of 0", "1 of 2"));
  });

  it("counts a response present in both the lead and a subagent file as the subagent's", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 1 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null })]);

    expect(warningLine(report(argv))).toBe(expectedWarning("1 of 1", "0 of 0"));
  });

  it("counts responses, not the advisor iterations they carry", () => {
    const advisor = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null, iterations: [advisor, advisor] })]);

    expect(warningLine(report(argv))).toBe(expectedWarning("0 of 0", "1 of 1"));
  });
});
