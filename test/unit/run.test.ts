import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/run.js";
import { aiTitleLine, assistantLine, makeTempDir, userLine, writeMeta, writeTranscript } from "../helpers/fixture.js";
import { snapshot } from "../helpers/snapshot.js";
import { row } from "../helpers/table.js";

let home: string;
beforeEach(() => {
  home = makeTempDir();
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("--by agent", () => {
  it("dedupes a response written on several lines", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", [
      userLine(),
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 5, cacheRead: 1000, cacheWrite: 200 }),
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 9, cacheRead: 1000, cacheWrite: 200 }),
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 12, cacheRead: 1000, cacheWrite: 200 }),
      assistantLine({ id: "m2", requestId: "r2", input: 50, output: 7 }),
    ]);

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(result.code).toBe(0);
    // Agent | Requests | Input | Output | Cache read | Cache write
    expect(row(result.stdout, "lead").slice(0, 6)).toEqual(["lead", "2", "150", "19", "1000", "200"]);
    expect(row(result.stdout, "TOTAL").slice(0, 6)).toEqual(["TOTAL", "2", "150", "19", "1000", "200"]);
  });

  it("exits 2 naming the directory it looked in when there are no transcripts", () => {
    const missing = run(["--by", "agent"], { home, cwd: "/work/demo" });
    fs.mkdirSync(`${home}/.claude/projects/-work-demo/memory`, { recursive: true });
    const empty = run(["--by", "agent"], { home, cwd: "/work/demo" });

    for (const result of [missing, empty]) {
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`${home}/.claude/projects/-work-demo`);
    }
  });

  it("replaces every non-alphanumeric character of the cwd when locating the project dir", () => {
    writeTranscript(home, "-Users-jo-ann-my-proj-v2", "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 1, output: 2 }),
    ]);

    const result = run(["--by", "agent"], { home, cwd: "/Users/jo.ann/my_proj v2" });

    expect(result.code).toBe(0);
    expect(row(result.stdout, "lead")[1]).toBe("1");
  });

  it("attributes subagent files to the agentType in meta.json and lead files to lead", () => {
    const dir = "-work-demo";
    writeTranscript(home, dir, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
    writeTranscript(home, dir, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m2", requestId: "r2", input: 20, output: 2 }),
    ]);
    writeTranscript(home, dir, "s1/subagents/agent-a2.jsonl", [
      assistantLine({ id: "m3", requestId: "r3", input: 30, output: 3 }),
    ]);
    writeTranscript(home, dir, "s1/subagents/agent-a3.jsonl", [
      assistantLine({ id: "m4", requestId: "r4", input: 40, output: 4 }),
    ]);
    writeMeta(home, dir, "s1", "a1", { agentType: "scribe", description: "x" });
    writeMeta(home, dir, "s1", "a2", { agentType: "scribe", description: "y" });

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(row(result.stdout, "lead").slice(0, 3)).toEqual(["lead", "1", "10"]);
    expect(row(result.stdout, "scribe").slice(0, 3)).toEqual(["scribe", "2", "50"]);
    expect(row(result.stdout, "(unknown agent)").slice(0, 3)).toEqual(["(unknown agent)", "1", "40"]);
    expect(row(result.stdout, "TOTAL").slice(0, 3)).toEqual(["TOTAL", "4", "100"]);
  });

  it("counts a response present in both the lead and a subagent file once, for the subagent", () => {
    const dir = "-work-demo";
    writeTranscript(home, dir, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 10, output: 5 }),
      assistantLine({ id: "m9", requestId: "r9", input: 1, output: 1 }),
    ]);
    writeTranscript(home, dir, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 10, output: 5 }),
      assistantLine({ id: "m1", requestId: "r1", input: 10, output: 8 }),
    ]);
    writeMeta(home, dir, "s1", "a1", { agentType: "scribe" });

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(row(result.stdout, "lead").slice(0, 4)).toEqual(["lead", "1", "1", "1"]);
    expect(row(result.stdout, "scribe").slice(0, 4)).toEqual(["scribe", "1", "10", "8"]);
    expect(row(result.stdout, "TOTAL").slice(0, 2)).toEqual(["TOTAL", "2"]);
  });

  it("reads a session that has only a subagents directory, and ignores non-session directories", () => {
    writeTranscript(home, "-work-demo", "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 7, output: 1 }),
    ]);
    writeMeta(home, "-work-demo", "s1", "a1", { agentType: "scribe" });
    fs.mkdirSync(`${home}/.claude/projects/-work-demo/memory`, { recursive: true });

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(row(result.stdout, "scribe").slice(0, 3)).toEqual(["scribe", "1", "7"]);
  });

  describe("advisor", () => {
    const message = { type: "message", input_tokens: 4, output_tokens: 130, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const advisor = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 25000, output_tokens: 2200, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 };

    it("counts advisor_message iterations in their own row, from the kept last line of the group", () => {
      writeTranscript(home, "-work-demo", "s1.jsonl", [
        assistantLine({ id: "m1", requestId: "r1", input: 4, output: 10, iterations: [message] }),
        assistantLine({ id: "m1", requestId: "r1", input: 6, output: 140, iterations: [message, advisor, { ...message, input_tokens: 2, output_tokens: 10 }] }),
      ]);

      const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

      // The lead row holds top-level usage only: the advisor iteration is not added to it.
      expect(row(result.stdout, "lead").slice(0, 6)).toEqual(["lead", "1", "6", "140", "0", "0"]);
      expect(row(result.stdout, "advisor").slice(0, 6)).toEqual(["advisor", "1", "25000", "2200", "300", "40"]);
      expect(row(result.stdout, "TOTAL").slice(0, 6)).toEqual(["TOTAL", "2", "25006", "2340", "300", "40"]);
    });

    it("counts advisor iterations from subagent lines too, and lines without iterations add no advisor tokens", () => {
      writeTranscript(home, "-work-demo", "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 5, output: 5 })]);
      writeTranscript(home, "-work-demo", "s1/subagents/agent-a1.jsonl", [
        assistantLine({ id: "m2", requestId: "r2", input: 5, output: 5, iterations: [advisor, advisor] }),
      ]);
      writeMeta(home, "-work-demo", "s1", "a1", { agentType: "scribe" });

      const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

      expect(row(result.stdout, "advisor").slice(0, 4)).toEqual(["advisor", "2", "50000", "4400"]);
    });
  });

  it("skips synthetic and zero-usage lines, and keys lines without a requestId by uuid", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", [
      assistantLine({ id: "syn", model: "<synthetic>", input: 9, output: 9 }),
      assistantLine({ id: "zero", requestId: "rz" }),
      assistantLine({ id: "m1", uuid: "u1", input: 1, output: 1 }),
      assistantLine({ id: "m1", uuid: "u2", input: 2, output: 2 }),
    ]);

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(row(result.stdout, "lead").slice(0, 4)).toEqual(["lead", "2", "3", "3"]);
  });

  it("skips a truncated last line, reports it, and does not crash", () => {
    const full = assistantLine({ id: "m1", requestId: "r1", input: 3, output: 4 });
    const cut = assistantLine({ id: "m2", requestId: "r2", input: 9, output: 9 }).slice(0, 40);
    writeTranscript(home, "-work-demo", "s1.jsonl", [full, cut]);

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 incomplete line skipped");
    expect(row(result.stdout, "lead").slice(0, 3)).toEqual(["lead", "1", "3"]);
  });

  it("pluralises the incomplete line count and prints nothing when all lines are complete", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", ["{", assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1 }), "{\"type\""]);
    writeTranscript(home, "-work-demo", "s2.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1 })]);

    const two = run(["--by", "agent"], { home, cwd: "/work/demo" });
    fs.rmSync(`${home}/.claude/projects/-work-demo/s1.jsonl`);
    const none = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(two.stdout).toContain("2 incomplete lines skipped");
    expect(none.stdout).not.toContain("incomplete");
  });

  describe("format guard", () => {
    it("warns about and excludes assistant lines whose usage has an unexpected shape", () => {
      const bad = JSON.parse(assistantLine({ id: "bad", requestId: "rb", input: 1, output: 1 }));
      bad.message.usage.output_tokens = "lots";
      const missing = JSON.parse(assistantLine({ id: "gone", requestId: "rg", input: 1, output: 1 }));
      delete missing.message.usage;
      const badIterations = assistantLine({ id: "it", requestId: "ri", input: 1, output: 1, iterations: "nope" as unknown as unknown[] });
      writeTranscript(home, "-work-demo", "s1.jsonl", [
        JSON.stringify(bad),
        JSON.stringify(missing),
        badIterations,
        assistantLine({ id: "ok", requestId: "ro", input: 5, output: 5 }),
      ]);

      const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Warning: 3 assistant line(s) had an unrecognised usage shape");
      expect(row(result.stdout, "lead").slice(0, 3)).toEqual(["lead", "1", "5"]);
    });

    it("prints the max Claude Code version seen against the tested one, comparing numerically", () => {
      writeTranscript(home, "-work-demo", "s1.jsonl", [
        assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1, version: "2.1.30" }),
        assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1, version: "2.1.296" }),
      ]);

      const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

      expect(result.stdout).toContain("Claude Code version seen (max): 2.1.296; tested up to 2.1.296.");
      expect(result.stdout).not.toContain("newer than");
    });

    it("warns when a version newer than the tested one is seen", () => {
      writeTranscript(home, "-work-demo", "s1.jsonl", [
        assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1, version: "2.1.1000" }),
      ]);

      const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

      expect(result.stdout).toContain("seen (max): 2.1.1000; tested up to 2.1.296.");
      expect(result.stdout).toContain("newer than 2.1.296");
    });
  });

  it("sorts rows by total tokens and says so", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1 })]);
    writeTranscript(home, "-work-demo", "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m2", requestId: "r2", cacheRead: 500 }),
    ]);
    writeMeta(home, "-work-demo", "s1", "a1", { agentType: "scribe" });

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(result.stdout).toContain("Sorted by total tokens");
    expect(result.stdout.indexOf("scribe")).toBeLessThan(result.stdout.indexOf("lead"));
  });

  it("shows cost as unpriced and each row's share of total tokens", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1 })]);

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(row(result.stdout, "lead").slice(6)).toEqual(["unpriced", "100.0%"]);
  });

  it("never prints message text, prompts, tool input or output, meta descriptions or the ai-title", () => {
    const canary = "CANARY-7f3a";
    writeTranscript(home, "-work-demo", "s1.jsonl", [
      // With no cost-state line there is no reconcile warning, the one place --by agent prints the title (criterion 4.3, see cost.test.ts).
      aiTitleLine("TITLE-CANARY-5b1d"),
      userLine(canary),
      JSON.stringify({ type: "user", toolUseResult: { stdout: canary }, message: { content: [{ type: "tool_result", content: canary }] } }),
      assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1, text: canary, extraContent: [{ type: "tool_use", id: "tu1", name: "Bash", input: { command: canary } }] }),
    ]);
    writeTranscript(home, "-work-demo", "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1, text: canary }),
    ]);
    writeMeta(home, "-work-demo", "s1", "a1", { agentType: "scribe", description: canary, toolUseId: canary });

    const result = run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(canary);
    expect(result.stdout + result.stderr).not.toContain("TITLE-CANARY");
  });

  it("leaves the fixture root unchanged", () => {
    writeTranscript(home, "-work-demo", "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1 }), "{"]);
    writeTranscript(home, "-work-demo", "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1 })]);
    const before = snapshot(home);

    run(["--by", "agent"], { home, cwd: "/work/demo" });

    expect(snapshot(home)).toEqual(before);
  });

  it("prints usage and exits 1 for anything but --by agent or --by task [--top N]", () => {
    const bad = [
      [],
      ["--by"],
      ["--by", "bogus"],
      ["--by", "agent", "--top", "3"],
      ["--by", "task", "extra"],
      ["--by", "task", "--top"],
      ["--by", "task", "--top", "0"],
      ["--by", "task", "--top", "abc"],
      ["--by", "task", "--top", "-1"],
      ["--by", "task", "--top", "2.5"],
      ["--top", "3", "--by", "task"],
    ];
    for (const argv of bad) {
      const result = run(argv, { home, cwd: "/work/demo" });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Usage: spend-report --by agent");
    }
  });
});
