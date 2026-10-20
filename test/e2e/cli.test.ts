import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advisorCall, aiTitleLine, assistantLine, costStateLine, makeTempDir, writeMeta, writeTranscript } from "../helpers/fixture.js";

const CLI = path.join(import.meta.dirname, "..", "..", "dist", "cli.js");

let home: string;
let cwd: string;
beforeEach(() => {
  home = makeTempDir();
  cwd = makeTempDir();
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(cwd, { recursive: true, force: true });
});

function spend(args: string[], columns?: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    // A fixed zone, so the local time of an untitled session is the same on every machine.
    env: { PATH: process.env.PATH, HOME: home, TZ: "Asia/Kolkata", ...(columns === undefined ? {} : { COLUMNS: columns }) },
    encoding: "utf8",
  });
}

describe("built CLI", () => {
  it("prints the agent table for the project of the current directory", () => {
    // cwd is a realpath, which is what the child process reports as its own cwd.
    writeTranscript(home, cwd.replace(/[^a-zA-Z0-9]/g, "-"), "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 5, cacheRead: 1000, cacheWrite: 200 }),
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 9, cacheRead: 1000, cacheWrite: 200 }),
    ]);

    const result = spend(["--by", "agent"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^lead\s+1\s+100\s+9\s+1000\s+200\s+\$0\.00\s+100\.0%$/m);
    expect(result.stdout).toMatch(/^TOTAL\s+1\s+100\s+9\s+1000\s+200/m);
  });

  it("exits 2 and names the directory when the project has no transcripts", () => {
    const result = spend(["--by", "agent"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(path.join(home, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-")));
  });

  describe("pricing and reconcile (rates from the shipped prices.json)", () => {
    const M = 1_000_000;
    let projectDir: string;

    beforeEach(() => {
      projectDir = cwd.replace(/[^a-zA-Z0-9]/g, "-");
      // Lead (sonnet): 1M in x $2 + 1M out x $10 = $12.00; recorded as $24.00.
      writeTranscript(home, projectDir, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: M, output: M }), costStateLine(24)]);
      // Scribe (sonnet): 5M cache reads x $0.10 = $0.50.
      writeTranscript(home, projectDir, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", cacheRead: 5 * M })]);
      // Reviewer (haiku): a 200k prompt is over the 100k tier, 200k x $0.50 = $0.10 (the base rate would give $0.02).
      writeTranscript(home, projectDir, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m3", requestId: "r3", model: "claude-haiku-5-5", input: 200_000 })]);
      writeMeta(home, projectDir, "s1", "a1", { agentType: "scribe", description: "Scribe job" });
      writeMeta(home, projectDir, "s1", "a2", { agentType: "reviewer", description: "Review job" });
    });

    it("prints the priced agent table with a TOTAL and each row's share of cost, highest cost first", () => {
      const result = spend(["--by", "agent"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Sorted by Est. cost");
      expect(result.stdout).toMatch(/^lead\s+1\s+1000000\s+1000000\s+0\s+0\s+\$12\.00\s+95\.2%$/m);
      expect(result.stdout).toMatch(/^scribe\s+1\s+0\s+0\s+5000000\s+0\s+\$0\.50\s+4\.0%$/m);
      expect(result.stdout).toMatch(/^reviewer\s+1\s+200000\s+0\s+0\s+0\s+\$0\.10\s+0\.8%$/m);
      expect(result.stdout).toMatch(/^TOTAL\s+3\s+1200000\s+1000000\s+5000000\s+0\s+\$12\.60\s+100\.0%$/m);
      expect(result.stdout.indexOf("\nlead")).toBeLessThan(result.stdout.indexOf("\nscribe"));
      expect(result.stdout.indexOf("\nscribe")).toBeLessThan(result.stdout.indexOf("\nreviewer"));
    });

    it("prints the aggregate coverage line and a reconcile warning for a session more than 5% off", () => {
      const result = spend(["--by", "agent"]);

      expect(result.stdout).toContain("transcripts account for 52.5% of recorded session cost");
      expect(result.stdout).toContain("Warning: session s1 estimated $12.60 vs recorded $24.00 (-47.5%)");
    });

    it("names a session in --by agent reconcile warnings by its label at COLUMNS=120, and by the bare id at COLUMNS=80", () => {
      // 1M in x $2 + 1M out x $10 = $12.00 against a recorded $24.00.
      writeTranscript(home, projectDir, "0a2c91d4-1111-4111-8111-111111111111.jsonl", [
        aiTitleLine("Refactor the invoice export"),
        assistantLine({ id: "m9", requestId: "r9", input: M, output: M }),
        costStateLine(24),
      ]);

      const wide = spend(["--by", "agent"], "120");
      const narrow = spend(["--by", "agent"], "80");

      expect(wide.stdout).toContain("Warning: session Refactor the invoice export (0a2c91d4) estimated $12.00 vs recorded $24.00 (-50.0%).\n");
      expect(narrow.stdout).toContain("Warning: session 0a2c91d4 estimated $12.00 vs recorded $24.00 (-50.0%).\n");
    });

    it("gives the task view a cost column, a cost-ranked order and the cost of the rows --top hides", () => {
      const all = spend(["--by", "task"], "120");
      const top = spend(["--by", "task", "--top", "1"], "120");

      expect(all.stdout).toContain("Sorted by Est. cost");
      expect(all.stdout).toMatch(/^s1\s+lead\s+1\s+1000000\s+1000000\s+0\s+0\s+\$12\.00$/m);
      expect(all.stdout).toMatch(/^Scribe job\s+scribe\s.*\$0\.50$/m);
      expect(top.stdout).toContain("+2 more, $0.60 (included in TOTAL)");
    });

    it("has the same cost TOTAL in both views", () => {
      const agent = spend(["--by", "agent"]);
      const task = spend(["--by", "task"], "120");
      const totalOf = (stdout: string) => stdout.match(/^TOTAL\s.*(\$\d+\.\d\d)(?:\s+100\.0%)?$/m)?.[1];

      expect(totalOf(agent.stdout)).toBe("$12.60");
      expect(totalOf(task.stdout)).toBe("$12.60");
    });

    it("shows a model without a price as unpriced, warns, ranks by tokens and still exits 0", () => {
      writeTranscript(home, projectDir, "s1/subagents/agent-a3.jsonl", [assistantLine({ id: "m4", requestId: "r4", model: "claude-mystery-9", input: 9 * M })]);
      writeMeta(home, projectDir, "s1", "a3", { agentType: "oddball", description: "Odd job" });

      const result = spend(["--by", "agent"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^oddball\s+1\s+9000000\s+0\s+0\s+0\s+unpriced\s/m);
      expect(result.stdout).toMatch(/^TOTAL\s.*\$12\.60\s/m);
      expect(result.stdout).toContain("Warning: no price for claude-mystery-9");
      expect(result.stdout).toContain("Sorted by total tokens");
      expect(result.stdout).toContain("Coverage: n/a (prices unverified)");
      expect(result.stdout.indexOf("\noddball")).toBeLessThan(result.stdout.indexOf("\nscribe"));
    });
  });

  describe("--by task", () => {
    const LONG = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(8);

    beforeEach(() => {
      const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, "-");
      writeTranscript(home, projectDir, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1234, output: 56 })]);
      writeMeta(home, projectDir, "s1", "a1", { agentType: "scribe", description: LONG });
    });

    /** Width of the widest line of the table (header, rows, TOTAL). */
    function tableWidth(stdout: string): number {
      const lines = stdout.split("\n");
      const table = lines.slice(lines.findIndex((l) => l.startsWith("Task ")), lines.findIndex((l) => l.startsWith("TOTAL")) + 1);
      return Math.max(...table.map((l) => l.length));
    }

    it("fits the table to the COLUMNS variable when stdout is not a terminal", () => {
      for (const columns of ["100", "78"]) {
        const result = spend(["--by", "task"], columns);

        expect(result.status).toBe(0);
        expect(tableWidth(result.stdout)).toBe(Number(columns));
        expect(result.stdout).toContain("ABCDEFG");
        expect(result.stdout).toContain("\u2026");
      }
    });

    it("keeps 8 distinct session id characters on lead rows at COLUMNS=80", () => {
      const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, "-");
      writeTranscript(home, projectDir, "0a2c91d4-1111-4111-8111-111111111111.jsonl", [aiTitleLine("Refactor the invoice export"), assistantLine({ id: "m2", requestId: "r2", input: 5, output: 1 })]);
      writeTranscript(home, projectDir, "0a2f77be-2222-4222-8222-222222222222.jsonl", [assistantLine({ id: "m3", requestId: "r3", input: 6, output: 1 })]);

      const result = spend(["--by", "task"], "80");

      expect(result.stdout).toMatch(/^0a2c91d4 {2,}lead\s/m);
      expect(result.stdout).toMatch(/^0a2f77be {2,}lead\s/m);
    });

    it("labels lead rows with the title, or the local start time and branch, at COLUMNS=140", () => {
      const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, "-");
      writeTranscript(home, projectDir, "0a2c91d4-1111-4111-8111-111111111111.jsonl", [aiTitleLine("Refactor the invoice export"), assistantLine({ id: "m2", requestId: "r2", input: 5, output: 1 })]);
      // 23:30Z is 05:00 the next day at UTC+5:30.
      writeTranscript(home, projectDir, "0a2f77be-2222-4222-8222-222222222222.jsonl", [
        assistantLine({ id: "m3", requestId: "r3", input: 6, output: 1, timestamp: "2026-03-05T23:30:00.000Z", gitBranch: "feature/x" }),
      ]);

      const result = spend(["--by", "task"], "140");

      expect(result.stdout).toMatch(/^Refactor the invoice export \(0a2c91d4\) {2,}lead\s/m);
      expect(result.stdout).toMatch(/^2026-03-06 05:00 \u00b7 feature\/x \(0a2f77be\) {2,}lead\s/m);
    });

    it("assumes 80 columns when COLUMNS is unset or not a width", () => {
      for (const columns of [undefined, "", "wide", "0", "-5"]) {
        expect(tableWidth(spend(["--by", "task"], columns).stdout)).toBe(80);
      }
    });
  });

  describe("advisor calls without a usage record", () => {
    const WARNING = "2 advisor calls have no usage record; the advisor row is a lower bound.";

    it("warns in both views when a response carries more advisor blocks across its lines than usage records on the kept line", () => {
      const usageRecord = { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      writeTranscript(home, cwd.replace(/[^a-zA-Z0-9]/g, "-"), "s1.jsonl", [
        assistantLine({ id: "m1", requestId: "r1", output: 1, stopReason: null, extraContent: [advisorCall("srvtoolu_1")] }),
        assistantLine({ id: "m1", requestId: "r1", output: 2, stopReason: null, extraContent: [advisorCall("srvtoolu_2")] }),
        assistantLine({ id: "m1", requestId: "r1", output: 3, extraContent: [advisorCall("srvtoolu_3")], iterations: [usageRecord] }),
      ]);

      for (const by of ["agent", "task"]) {
        const result = spend(["--by", by]);

        expect(result.status).toBe(0);
        expect(result.stdout.split("\n").filter((l) => l.includes("no usage record"))).toEqual([WARNING]);
      }
    });
  });
});
