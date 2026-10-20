import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/run.js";
import { aiTitleLine, assistantLine, makeTempDir, userLine, writeMeta, writeTranscript } from "../helpers/fixture.js";
import { snapshot } from "../helpers/snapshot.js";
import { row } from "../helpers/table.js";

const DIR = "-work-demo";
const CWD = "/work/demo";

let home: string;
beforeEach(() => {
  home = makeTempDir();
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

/** Wide by default so that tests of other behaviour never see truncation. */
function byTask(extra: string[] = [], width = 200) {
  return run(["--by", "task", ...extra], { home, cwd: CWD, width });
}

describe("--by task", () => {
  it("has one row per subagent invocation and one lead row per session", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, cacheRead: 100, cacheWrite: 5 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m2", requestId: "r2", input: 20, output: 2 }),
      assistantLine({ id: "m3", requestId: "r3", input: 30, output: 3 }),
    ]);
    writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m4", requestId: "r4", input: 40, output: 4 })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Write docs" });
    writeMeta(home, DIR, "s1", "a2", { agentType: "scribe", description: "Fix typo" });
    writeTranscript(home, DIR, "s2.jsonl", [assistantLine({ id: "m5", requestId: "r5", input: 7, output: 1 })]);

    const result = byTask();

    expect(result.code).toBe(0);
    // Description | Agent | Requests | Input | Output | Cache read | Cache write | Est. cost
    expect(row(result.stdout, "Write docs")).toEqual(["Write docs", "scribe", "2", "50", "5", "0", "0", "unpriced"]);
    expect(row(result.stdout, "Fix typo").slice(0, 4)).toEqual(["Fix typo", "scribe", "1", "40"]);
    expect(row(result.stdout, "s1")).toEqual(["s1", "lead", "1", "10", "1", "100", "5", "unpriced"]);
    expect(row(result.stdout, "s2").slice(0, 4)).toEqual(["s2", "lead", "1", "7"]);
  });

  it("sorts rows by total tokens, largest first, and says so", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", cacheRead: 500 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m3", requestId: "r3", input: 100 })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Biggest" });
    writeMeta(home, DIR, "s1", "a2", { agentType: "scribe", description: "Middle" });

    const result = byTask();

    expect(result.stdout).toContain("Sorted by total tokens");
    const at = (label: string) => result.stdout.indexOf(label);
    expect(at("Biggest")).toBeLessThan(at("Middle"));
    expect(at("Middle")).toBeLessThan(result.stdout.search(/^s1 /m));
  });

  it("keeps advisor tokens on the row whose line carried them, without counting them as requests", () => {
    const message = { type: "message", input_tokens: 6, output_tokens: 140, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const advisor = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 25000, output_tokens: 2200, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 };
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 6, output: 140, iterations: [message, advisor] })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1, iterations: [advisor, advisor] })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Review" });

    const result = byTask();

    expect(result.stdout).not.toMatch(/^advisor\b/m);
    expect(row(result.stdout, "s1").slice(2, 7)).toEqual(["1", "25006", "2340", "300", "40"]);
    expect(row(result.stdout, "Review").slice(2, 7)).toEqual(["1", "50001", "4401", "600", "80"]);
  });

  it("labels a delegation without a usable description \"(no description)\" and still runs", () => {
    const usable: Array<[string, object | undefined]> = [
      ["a1", undefined],
      ["a2", { agentType: "scribe" }],
      ["a3", { agentType: "scribe", description: 42 }],
      ["a4", { agentType: "scribe", description: "  \t\n " }],
    ];
    usable.forEach(([id, meta], i) => {
      writeTranscript(home, DIR, `s1/subagents/agent-${id}.jsonl`, [assistantLine({ id: `m${i}`, requestId: `r${i}`, input: 10 + i })]);
      if (meta) writeMeta(home, DIR, "s1", id, meta);
    });

    const result = byTask();

    expect(result.code).toBe(0);
    const labelled = result.stdout.split("\n").filter((l) => l.startsWith("(no description)"));
    expect(labelled.map((l) => l.trim().split(/\s{2,}/).slice(0, 2))).toEqual([
      ["(no description)", "scribe"],
      ["(no description)", "scribe"],
      ["(no description)", "scribe"],
      ["(no description)", "(unknown agent)"],
    ]);
  });

  it("replaces control characters, newlines and bidi overrides in lead-written text before printing", () => {
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 2 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1 })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scr\nibe\u001b]0;x\u0007", description: "line1\nline2\u001b[31mred\u0007\u202Eevil\u2028end\u0085" });
    writeMeta(home, DIR, "s1", "a2", { agentType: "scribe", description: "\u001b\u0007\n" });

    const result = byTask();

    expect(result.stdout).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/);
    expect(row(result.stdout, "line1")).toContain("line1 line2 [31mred evil end");
    expect(row(result.stdout, "line1")).toContain("scr ibe ]0;x");
    expect(row(result.stdout, "(no description)")[1]).toBe("scribe");
  });

  it("ends with a TOTAL row summing every row", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, cacheRead: 100, cacheWrite: 5 })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m2", requestId: "r2", input: 20, output: 2 }),
      assistantLine({ id: "m3", requestId: "r3", input: 30, output: 3, cacheRead: 7 }),
    ]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Write docs" });

    const result = byTask();

    expect(row(result.stdout, "TOTAL")).toEqual(["TOTAL", "-", "3", "60", "6", "107", "5", "unpriced"]);
  });

  describe("--top N", () => {
    beforeEach(() => {
      writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
      [["a1", "Biggest", { cacheRead: 500 }], ["a2", "Middle", { input: 100 }], ["a3", "Small", { input: 50 }]].forEach(([id, description, usage], i) => {
        writeTranscript(home, DIR, `s1/subagents/agent-${id}.jsonl`, [assistantLine({ id: `m${i + 2}`, requestId: `r${i + 2}`, ...(usage as object) })]);
        writeMeta(home, DIR, "s1", id as string, { agentType: "scribe", description });
      });
    });

    it("shows only the N most expensive rows, a remainder line, and a TOTAL over every row", () => {
      const result = byTask(["--top", "2"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Biggest");
      expect(result.stdout).toContain("Middle");
      expect(result.stdout).not.toContain("Small");
      expect(result.stdout).not.toMatch(/^s1 /m);
      expect(result.stdout).toContain("+2 more, unpriced");
      expect(row(result.stdout, "TOTAL").slice(2, 4)).toEqual(["4", "160"]);
    });

    it("prints no remainder line when N covers every row", () => {
      for (const n of ["4", "10"]) {
        const result = byTask(["--top", n]);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Small");
        expect(result.stdout).not.toContain("more");
      }
    });
  });

  describe("terminal width", () => {
    const LONG = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(8);

    /** The header, every row and the TOTAL row; prose lines are not part of the table. */
    function tableLines(stdout: string): string[] {
      const lines = stdout.split("\n");
      return lines.slice(lines.findIndex((l) => l.startsWith("Task ")), lines.findIndex((l) => l.startsWith("TOTAL")) + 1);
    }

    beforeEach(() => {
      writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1234, output: 56 })]);
      writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 99 })]);
      writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: LONG });
      writeMeta(home, DIR, "s1", "a2", { agentType: "programmer-with-a-very-long-name", description: "Short" });
    });

    it("truncates a long description with an ellipsis so that no table line is wider than the terminal", () => {
      const result = byTask([], 80);

      const lines = tableLines(result.stdout);
      expect(lines.length).toBe(4);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
      const long = lines.find((l) => l.startsWith("ABC"))!;
      expect(long).toMatch(/^ABC[A-Z]*\u2026\s+scribe\s/);
      expect(lines.find((l) => l.startsWith("Short"))).toMatch(/^Short +/);
    });

    it("shrinks the agent column before the description", () => {
      const lines = tableLines(byTask([], 80).stdout);

      expect(lines.find((l) => l.startsWith("Short"))).toMatch(/^Short {8}progr\u2026 {2}/);
    });

    it("never splits a surrogate pair when cutting", () => {
      writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "x" + "\u{1F600}".repeat(100) });

      const result = byTask([], 80);

      expect(result.stdout).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    });

    it("keeps a minimum description and agent width on a very narrow terminal instead of failing", () => {
      const result = byTask([], 10);

      expect(result.code).toBe(0);
      expect(tableLines(result.stdout).find((l) => l.startsWith("ABC"))).toMatch(/^ABCDEFG\u2026 {2}scribe {2}/);
    });

    it("prints a description in full when the terminal is wide enough, and assumes 80 columns by default", () => {
      expect(byTask([], 400).stdout).toContain(LONG);
      for (const line of tableLines(run(["--by", "task"], { home, cwd: CWD }).stdout)) expect(line.length).toBeLessThanOrEqual(80);
    });
  });

  it("labels a lead row with the first 8 characters of its session id, so sessions stay distinguishable at 80 columns", () => {
    const first = "0a2c91d4-1111-4111-8111-111111111111";
    const second = "0a2f77be-2222-4222-8222-222222222222";
    writeTranscript(home, DIR, `${first}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
    writeTranscript(home, DIR, `${second}.jsonl`, [assistantLine({ id: "m2", requestId: "r2", input: 20, output: 2 })]);

    const result = byTask([], 80);

    expect(row(result.stdout, "0a2c91d4")[0]).toBe("0a2c91d4");
    expect(row(result.stdout, "0a2f77be")[0]).toBe("0a2f77be");
    expect(row(result.stdout, "0a2f77be")[1]).toBe("lead");
  });

  describe("lead labels", () => {
    const SESSION = "0a2c91d4-1111-4111-8111-111111111111";

    it("shows the last ai-title of the session and the first 8 characters of its id", () => {
      writeTranscript(home, DIR, `${SESSION}.jsonl`, [aiTitleLine("First title"), assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 }), aiTitleLine("Second title")]);

      const result = byTask();

      expect(result.stdout).toContain("Second title (0a2c91d4)");
      expect(result.stdout).not.toContain("First title");
    });

    it("ignores an ai-title line whose title is not a string", () => {
      writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 }), aiTitleLine(42), aiTitleLine({ text: "nested" })]);

      const result = byTask();

      expect(row(result.stdout, "0a2c91d4")[0]).toBe("0a2c91d4");
      expect(result.stdout).not.toContain("42");
      expect(result.stdout).not.toContain("nested");
    });

    it("replaces control characters, newlines and bidi overrides in the title before printing", () => {
      writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 }), aiTitleLine("Fix\u0007\n\u202ebug\u2028now\u001b[2J")]);

      const result = byTask();

      expect(result.stdout).toContain("Fix bug now [2J (0a2c91d4)");
      expect(result.stdout).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/);
    });

    it("treats a title that is empty once control characters are removed as absent", () => {
      writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 }), aiTitleLine(" \u0007\n\u202e ")]);

      const result = byTask();

      expect(row(result.stdout, "0a2c91d4")[0]).toBe("0a2c91d4");
    });

    it("orders equally heavy lead rows by their label, not by their id", () => {
      writeTranscript(home, DIR, "aaaa1111-0000.jsonl", [aiTitleLine("Beta"), assistantLine({ id: "m1", requestId: "r1", input: 10 })]);
      writeTranscript(home, DIR, "zzzz2222-0000.jsonl", [aiTitleLine("Alpha"), assistantLine({ id: "m2", requestId: "r2", input: 10 })]);

      const result = byTask();

      expect(result.stdout.indexOf("Alpha (zzzz2222)")).toBeGreaterThan(-1);
      expect(result.stdout.indexOf("Alpha (zzzz2222)")).toBeLessThan(result.stdout.indexOf("Beta (aaaa1111)"));
    });

    describe("on a narrow terminal", () => {
      const TITLE = "Refactor the invoice export so that totals match the ledger";

      beforeEach(() => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [aiTitleLine(TITLE), assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
      });

      it("falls back to the 8-character id at 80 columns, as before titles existed, and keeps every line within the terminal", () => {
        const result = byTask([], 80);

        expect(result.stdout).toMatch(/^0a2c91d4 {2,}lead\s/m);
        expect(result.stdout).not.toContain("Refactor");
        for (const line of result.stdout.split("\n").filter((l) => /^(Task|0a2c91d4|TOTAL)/.test(l))) expect(line.length).toBeLessThanOrEqual(80);
      });
    });

    describe("on a mid-width terminal", () => {
      it("cuts a long title with an ellipsis before the id, so the id stays visible", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [aiTitleLine("Refactor the invoice export so that totals match the ledger"), assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);

        const result = byTask([], 100);

        expect(result.stdout).toMatch(/^Refactor the invoice\u2026 \(0a2c91d4\) {2,}lead\s/m);
        for (const line of result.stdout.split("\n").filter((l) => /^(Task|Refactor|TOTAL)/.test(l))) expect(line.length).toBeLessThanOrEqual(100);
      });
    });

    describe("where the title starts to show", () => {
      // With one lead row and tiny counts the other columns take 68 characters, so the first column is the width minus 68.
      const OTHER_COLUMNS = 68;
      const lead = (width: number) => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [aiTitleLine("Refactor the invoice export so that totals match the ledger"), assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);
        return byTask([], width).stdout.split("\n").find((l) => l.startsWith("0a2c91d4") || l.startsWith("Refac"))!;
      };

      it("shows the bare id while fewer than 8 characters of the title would fit", () => {
        // 19 characters: 7 of title, the ellipsis and " (0a2c91d4)".
        expect(lead(OTHER_COLUMNS + 19)).toMatch(/^0a2c91d4 {2,}lead\s/);
      });

      it("shows 8 characters of the title once they fit", () => {
        expect(lead(OTHER_COLUMNS + 20)).toMatch(/^Refactor\u2026 \(0a2c91d4\) {2,}lead\s/);
      });
    });

    describe("without a title", () => {
      const STAMP = "2026-03-05T23:30:00.000Z";
      const attachment = (timestamp?: string) => JSON.stringify({ type: "attachment", ...(timestamp ? { timestamp } : {}) });

      it("shows the local time of the session's first timestamp and its git branch", () => {
        // 23:30Z is already the next morning in the pinned zone (UTC+5:30).
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [
          attachment(),
          attachment(STAMP),
          userLine("prompt", { timestamp: STAMP, gitBranch: "feature/x" }),
          assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: "2026-03-07T10:00:00.000Z", gitBranch: "later" }),
        ]);

        const result = byTask();

        expect(result.stdout).toContain("2026-03-06 05:00 \u00b7 feature/x (0a2c91d4)");
      });

      it("shows the date and time alone when no line names a branch", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: STAMP })]);

        const result = byTask();

        expect(result.stdout).toContain("2026-03-06 05:00 (0a2c91d4)");
        expect(result.stdout).not.toContain("\u00b7");
      });

      it("shows the branch alone when no line has a timestamp", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, gitBranch: "feature/x" })]);

        const result = byTask();

        expect(result.stdout).toContain("feature/x (0a2c91d4)");
        expect(result.stdout).not.toContain("\u00b7");
      });

      it("skips a timestamp that is not an ISO-8601 date and time and uses the next line's", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [
          userLine("prompt", { timestamp: "yesterday" }),
          assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: STAMP }),
        ]);

        expect(byTask().stdout).toContain("2026-03-06 05:00 (0a2c91d4)");
      });

      it("skips a timestamp that has the right shape but is not a real date", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [
          userLine("prompt", { timestamp: "2026-13-45T10:00:00.000Z" }),
          assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: STAMP }),
        ]);

        expect(byTask().stdout).toContain("2026-03-06 05:00 (0a2c91d4)");
      });

      it("skips an empty git branch and uses the next line's", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [
          userLine("prompt", { timestamp: STAMP, gitBranch: "" }),
          assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, gitBranch: "feature/x" }),
        ]);

        expect(byTask().stdout).toContain("2026-03-06 05:00 \u00b7 feature/x (0a2c91d4)");
      });

      it("leaves no dangling separator when the branch is only control characters", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: STAMP, gitBranch: "\u0007\u202e" })]);

        const result = byTask();

        expect(result.stdout).toContain("2026-03-06 05:00 (0a2c91d4)");
        expect(result.stdout).not.toContain("\u00b7");
      });

      it("prints a detached HEAD as a branch name", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, timestamp: STAMP, gitBranch: "HEAD" })]);

        expect(byTask().stdout).toContain("2026-03-06 05:00 \u00b7 HEAD (0a2c91d4)");
      });

      it("shows only the 8-character id when the session has neither a timestamp nor a branch", () => {
        writeTranscript(home, DIR, `${SESSION}.jsonl`, [assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1 })]);

        expect(row(byTask().stdout, "0a2c91d4")[0]).toBe("0a2c91d4");
      });
    });
  });

  describe("against --by agent", () => {
    beforeEach(() => {
      const message = { type: "message", input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 };
      const advisor = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 25000, output_tokens: 2200, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 };
      // The lead lines that feed the labels (title, timestamp, branch) must not change what is counted.
      writeTranscript(home, DIR, "s1.jsonl", [
        aiTitleLine("Titled session"),
        assistantLine({ id: "m1", requestId: "r1", input: 10, output: 1, cacheRead: 100, cacheWrite: 5, iterations: [message, advisor], timestamp: "2026-03-05T08:00:00.000Z", gitBranch: "main" }),
        assistantLine({ id: "m9", requestId: "r9", input: 1, output: 1 }),
      ]);
      writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [
        assistantLine({ id: "m9", requestId: "r9", input: 2, output: 2 }),
        assistantLine({ id: "m2", requestId: "r2", input: 20, output: 2 }),
      ]);
      writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m3", requestId: "r3", input: 30, output: 3 })]);
      writeTranscript(home, DIR, "s1/subagents/agent-a3.jsonl", [assistantLine({ id: "m4", requestId: "r4", input: 40, output: 4 })]);
      writeTranscript(home, DIR, "s1/subagents/agent-a4.jsonl", [assistantLine({ id: "m5", requestId: "r5", input: 50, output: 5, cacheRead: 9 })]);
      writeTranscript(home, DIR, "s2.jsonl", [assistantLine({ id: "m6", requestId: "r6", input: 7, output: 1, cacheWrite: 11, timestamp: "2026-03-05T09:00:00.000Z", gitBranch: "HEAD" })]);
      writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Doc" });
      writeMeta(home, DIR, "s1", "a3", { agentType: "scribe" });
      writeMeta(home, DIR, "s1", "a4", { agentType: "scribe", description: 42 });
    });

    it("has the same Input, Output, Cache read and Cache write totals, also when --top hides rows", () => {
      const agent = run(["--by", "agent"], { home, cwd: CWD });

      // Agent: Agent | Requests | Input | Output | Cache read | Cache write ...
      expect(row(agent.stdout, "TOTAL").slice(2, 6)).toEqual(["25159", "2218", "409", "56"]);
      for (const extra of [[], ["--top", "1"], ["--top", "100"]]) {
        const task = byTask(extra);
        // Task: Task | Agent | Requests | Input | Output | Cache read | Cache write ...
        expect(row(task.stdout, "TOTAL").slice(3, 7), extra.join(" ")).toEqual(["25159", "2218", "409", "56"]);
      }
    });

    it("counts a response present in both the lead and a subagent file once, on the subagent's row", () => {
      const result = byTask();

      expect(row(result.stdout, "Doc").slice(2, 5)).toEqual(["2", "22", "4"]);
      expect(row(result.stdout, "Titled session (s1)").slice(2, 5)).toEqual(["1", "25010", "2201"]);
    });
  });

  it("reports incomplete lines, unrecognised usage shapes and the Claude Code version like --by agent", () => {
    const bad = JSON.parse(assistantLine({ id: "bad", requestId: "rb", input: 1, output: 1 }));
    bad.message.usage.output_tokens = "lots";
    const cut = assistantLine({ id: "m2", requestId: "r2", input: 9, output: 9 }).slice(0, 40);
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 3, output: 4, version: "2.1.1000" }), JSON.stringify(bad), cut]);

    const result = byTask();

    expect(result.stdout).toContain("1 incomplete line skipped");
    expect(result.stdout).toContain("Warning: 1 assistant line(s) had an unrecognised usage shape");
    expect(result.stdout).toContain("seen (max): 2.1.1000; tested up to 2.1.296.");
    expect(result.stdout).toContain("newer than 2.1.296");
    expect(row(result.stdout, "s1").slice(0, 4)).toEqual(["s1", "lead", "1", "3"]);
  });

  it("prints a meta.json description and the ai-title here, and never any message text, tool input or tool output", () => {
    const text = "CANARY-7f3a";
    const description = "DESC-CANARY-91c2";
    const title = "TITLE-5b1d";
    writeTranscript(home, DIR, "s1.jsonl", [
      aiTitleLine(title),
      userLine(text),
      JSON.stringify({ type: "user", toolUseResult: { stdout: text }, message: { content: [{ type: "tool_result", content: text }] } }),
      assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1, text, extraContent: [{ type: "tool_use", id: "tu1", name: "Bash", input: { command: text } }] }),
    ]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1, text })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description, toolUseId: text });

    const task = byTask();
    const agent = run(["--by", "agent"], { home, cwd: CWD });

    expect(task.code).toBe(0);
    expect(task.stdout).toContain(description);
    expect(task.stdout).toContain(`${title} (s1)`);
    expect(task.stdout + task.stderr).not.toContain(text);
    expect(agent.stdout + agent.stderr).not.toContain(description);
    expect(agent.stdout + agent.stderr).not.toContain(text);
  });

  it("leaves the fixture root unchanged", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, output: 1 }), "{"]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 1, output: 1 })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Doc" });
    const before = snapshot(home);

    byTask(["--top", "1"]);

    expect(snapshot(home)).toEqual(before);
  });
});
