import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/run.js";
import { advisorCall, assistantLine, makeTempDir, userLine, writeMeta, writeTranscript } from "../helpers/fixture.js";
import { TEST_PRICES } from "../helpers/prices.js";

const DIR = "-work-demo";
const CWD = "/work/demo";

const usageRecord = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

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

function warningLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.includes("advisor calls have no usage record"));
}

describe.each(VIEWS)("advisor calls without a usage record, %s", (_name, argv) => {
  it("counts the advisor blocks of every line of a response, not just the kept one", () => {
    // Claude Code writes one line per content block: the blocks sit on earlier lines, the kept last line has one block and one usage record.
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null, extraContent: [advisorCall("srvtoolu_1")] }),
      assistantLine({ id: "m1", requestId: "r1", output: 2, stopReason: null, extraContent: [advisorCall("srvtoolu_2")] }),
      assistantLine({ id: "m1", requestId: "r1", output: 3, extraContent: [advisorCall("srvtoolu_3")], iterations: [usageRecord] }),
    ]);

    expect(warningLines(report(argv))).toEqual(["2 advisor calls have no usage record; the advisor row is a lower bound."]);
  });

  it("prints no warning when every advisor call has a usage record", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null, extraContent: [advisorCall("srvtoolu_1")] }),
      assistantLine({ id: "m1", requestId: "r1", output: 3, extraContent: [advisorCall("srvtoolu_2")], iterations: [usageRecord, usageRecord] }),
      assistantLine({ id: "m2", requestId: "r2", output: 1 }),
    ]);

    expect(warningLines(report(argv))).toEqual([]);
  });

  it("sums the shortfall over responses, counts a repeated block id once, and lets a response with surplus records offset nothing", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null, extraContent: [advisorCall("srvtoolu_1")] }),
      assistantLine({ id: "m1", requestId: "r1", output: 2, extraContent: [advisorCall("srvtoolu_1")] }),
      assistantLine({ id: "m2", requestId: "r2", output: 1, extraContent: [advisorCall("srvtoolu_2"), advisorCall("srvtoolu_3")], iterations: [usageRecord] }),
      assistantLine({ id: "m3", requestId: "r3", output: 1, iterations: [usageRecord, usageRecord] }),
    ]);

    expect(warningLines(report(argv))).toEqual(["2 advisor calls have no usage record; the advisor row is a lower bound."]);
  });

  it("counts only advisor blocks, and gathers a response's ids across the lead and a subagent file", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, extraContent: [advisorCall("srvtoolu_1"), { type: "server_tool_use", id: "srvtoolu_web", name: "web_search", input: {} }, { type: "tool_use", id: "toolu_1", name: "advisor", input: {} }] }),
    ]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", output: 2, extraContent: [advisorCall("srvtoolu_2")] })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Doc" });

    expect(warningLines(report(argv))).toEqual(["2 advisor calls have no usage record; the advisor row is a lower bound."]);
  });

  it("never prints what an advisor call or its result says", () => {
    const canary = "CANARY-7f3a";
    writeTranscript(home, DIR, "s1.jsonl", [
      userLine(canary),
      assistantLine({
        id: "m1",
        requestId: "r1",
        output: 1,
        text: canary,
        extraContent: [advisorCall("srvtoolu_1", { question: canary }), { type: "advisor_tool_result", tool_use_id: "srvtoolu_1", content: { type: "advisor_result", text: canary } }],
      }),
    ]);

    const stdout = report(argv);

    expect(warningLines(stdout)).toHaveLength(1);
    expect(stdout).not.toContain(canary);
  });
});
