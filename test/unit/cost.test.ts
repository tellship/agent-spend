import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { totalCost } from "../../src/pricing.js";
import { rowsByAgent } from "../../src/reportAgent.js";
import { rowsByTask } from "../../src/reportTask.js";
import { run } from "../../src/run.js";
import { loadProject } from "../../src/transcripts.js";
import { aiTitleLine, assistantLine, costStateLine, makeTempDir, userLine, writeMeta, writeTranscript } from "../helpers/fixture.js";
import { TEST_PRICES } from "../helpers/prices.js";
import { row } from "../helpers/table.js";

const DIR = "-work-demo";
const CWD = "/work/demo";
const M = 1_000_000;

let home: string;
beforeEach(() => {
  home = makeTempDir();
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function byAgent(prices = TEST_PRICES) {
  return run(["--by", "agent"], { home, cwd: CWD, prices });
}

function advisorIteration(model: string, extra: object = {}) {
  return { type: "advisor_message", model, input_tokens: M, output_tokens: M, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...extra };
}

describe("--by agent cost", () => {
  it("shows each row's cost, a priced TOTAL and the share of total cost, sorted by cost", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: M, output: M })]);
    // More tokens than the lead but cheaper: only a cost sort puts the lead first.
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 2.5 * M })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe" });

    const result = byAgent();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Sorted by Est. cost");
    expect(row(result.stdout, "lead")).toEqual(["lead", "1", "1000000", "1000000", "0", "0", "$3.00", "54.5%"]);
    expect(row(result.stdout, "scribe")).toEqual(["scribe", "1", "2500000", "0", "0", "0", "$2.50", "45.5%"]);
    expect(row(result.stdout, "TOTAL")).toEqual(["TOTAL", "2", "3500000", "1000000", "0", "0", "$5.50", "100.0%"]);
    expect(result.stdout.indexOf("\nlead")).toBeLessThan(result.stdout.indexOf("\nscribe"));
    expect(result.stdout).not.toContain("unpriced");
  });

  it("prices cache writes by their 5m and 1h tiers, and advisor iterations at the advisor's own model", () => {
    const message = { type: "message", input_tokens: 0, output_tokens: 0, cache_read_input_tokens: M, cache_creation_input_tokens: 2 * M };
    const advisor = advisorIteration("claude-opus-5-5", { cache_creation_input_tokens: 2 * M, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2 * M } });
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", cacheRead: M, cacheWrite: 2 * M, cacheWrite5m: M, cacheWrite1h: M, iterations: [message, advisor] }),
    ]);

    const result = byAgent();

    // lead: 1M read x5 + 1M 5m x3 + 1M 1h x4. advisor (opus, 10x): 1M in x10 + 1M out x20 + 2M 1h x40.
    expect(row(result.stdout, "lead")[6]).toBe("$12.00");
    expect(row(result.stdout, "advisor")[6]).toBe("$110.00");
    expect(row(result.stdout, "TOTAL")[6]).toBe("$122.00");
    expect(result.stdout).not.toContain("cache writes");
  });

  it("prices cache writes missing from the tier split at the 5m rate and warns once per response", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", output: 1, cacheWrite: 3 * M, cacheWrite5m: M, cacheWrite1h: M }),
      assistantLine({ id: "m1", requestId: "r1", output: 2, cacheWrite: 3 * M, cacheWrite5m: M, cacheWrite1h: M }),
      assistantLine({ id: "m2", requestId: "r2", cacheWrite: M }),
    ]);

    const result = byAgent();

    // m1: 1M x3 + 1M x4 + 1M unsplit x3 = 10. m2 has no split at all: 1M x3 = 3.
    expect(row(result.stdout, "lead")[6]).toBe("$13.00");
    expect(result.stdout).toContain("Warning: 2 call(s) had cache writes that their 5m/1h split does not account for");
  });

  it("shows a model that is not in the price table as unpriced, leaves it out of TOTAL, warns, and ranks by tokens", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: M })]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", model: "claude-mystery-9", input: 2 * M })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe" });

    const result = byAgent();

    expect(result.code).toBe(0);
    expect(row(result.stdout, "scribe")[6]).toBe("unpriced");
    expect(row(result.stdout, "lead")[6]).toBe("$1.00");
    expect(row(result.stdout, "TOTAL")[6]).toBe("$1.00");
    expect(result.stdout).toContain("Warning: no price for claude-mystery-9");
    expect(result.stdout).toContain("Sorted by total tokens");
    expect(result.stdout.indexOf("\nscribe")).toBeLessThan(result.stdout.indexOf("\nlead"));
    // Share follows the sort basis: tokens.
    expect([row(result.stdout, "scribe")[7], row(result.stdout, "lead")[7]]).toEqual(["66.7%", "33.3%"]);
  });

  it("shows a row with a priced and an unpriced response as unpriced, and TOTAL sums only the priced part", () => {
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: M }),
      assistantLine({ id: "m2", requestId: "r2", model: "claude-mystery-9", input: M }),
    ]);

    const result = byAgent();

    expect(row(result.stdout, "lead").slice(1, 2).concat(row(result.stdout, "lead")[6])).toEqual(["2", "unpriced"]);
    expect(row(result.stdout, "TOTAL")[6]).toBe("$1.00");
    expect(result.stdout).toMatch(/Warning: no price for claude-mystery-9.*TOTAL sums only the priced calls/);
  });

  it("leaves the advisor row unpriced when the advisor model is not in the table, and ranks the whole report by tokens", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, iterations: [advisorIteration("claude-advisor-x")] })]);

    const result = byAgent();

    expect(row(result.stdout, "advisor")[6]).toBe("unpriced");
    expect(row(result.stdout, "lead")[6]).toBe("$0.00");
    expect(result.stdout).toContain("Sorted by total tokens");
    expect(result.stdout).toContain("claude-advisor-x");
  });

  it("treats a missing advisor model as unpriced without dropping the response", () => {
    const noModel: Record<string, unknown> = advisorIteration("x");
    delete noModel.model;
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 1, iterations: [noModel] })]);

    const result = byAgent();

    expect(row(result.stdout, "advisor")[6]).toBe("unpriced");
    expect(row(result.stdout, "lead")[1]).toBe("1");
    expect(row(result.stdout, "lead")[6]).toBe("$0.00");
    expect(result.stdout).not.toContain("unrecognised usage shape");
  });

  it("shows every row as unpriced when no price table is given", () => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: M })]);

    const result = run(["--by", "agent"], { home, cwd: CWD });

    expect(result.code).toBe(0);
    expect(row(result.stdout, "lead").slice(6)).toEqual(["unpriced", "100.0%"]);
    expect(result.stdout).toContain("Sorted by total tokens");
  });
});

describe("--by task cost", () => {
  function byTask(extra: string[] = [], prices = TEST_PRICES) {
    return run(["--by", "task", ...extra], { home, cwd: CWD, width: 200, prices });
  }

  beforeEach(() => {
    writeTranscript(home, DIR, "s1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: M, output: M })]);
    // Most tokens, least cost.
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 2.5 * M })]);
    // Advisor tokens are priced at the advisor's model and stay on this row: opus, 1M in x10 + 1M out x20.
    writeTranscript(home, DIR, "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m3", requestId: "r3", iterations: [advisorIteration("claude-opus-5-5")] })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Bulk" });
    writeMeta(home, DIR, "s1", "a2", { agentType: "scribe", description: "Review" });
  });

  it("shows each row's cost and a priced TOTAL, and sorts by cost", () => {
    const result = byTask();

    expect(result.stdout).toContain("Sorted by Est. cost");
    expect(row(result.stdout, "Review").slice(2, 8)).toEqual(["1", "1000000", "1000000", "0", "0", "$30.00"]);
    expect(row(result.stdout, "Bulk")[7]).toBe("$2.50");
    expect(row(result.stdout, "s1")[7]).toBe("$3.00");
    expect(row(result.stdout, "TOTAL")[7]).toBe("$35.50");
    const order = ["Review", "s1 ", "Bulk"].map((label) => result.stdout.indexOf(`\n${label}`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((at) => at > 0)).toBe(true);
  });

  it("summarises the rows hidden by --top with their cost", () => {
    const result = byTask(["--top", "1"]);

    expect(result.stdout).toContain("+2 more, $5.50 (included in TOTAL)");
    expect(row(result.stdout, "TOTAL")[7]).toBe("$35.50");
    expect(result.stdout).not.toContain("Bulk");
  });

  it("ranks by tokens and warns when a model is unpriced, and the hidden rows' remainder says unpriced", () => {
    writeTranscript(home, DIR, "s1/subagents/agent-a3.jsonl", [assistantLine({ id: "m4", requestId: "r4", model: "claude-mystery-9", input: 1 })]);
    writeMeta(home, DIR, "s1", "a3", { agentType: "scribe", description: "Odd" });

    const result = byTask(["--top", "3"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Sorted by total tokens");
    expect(result.stdout).toContain("Warning: no price for claude-mystery-9");
    expect(result.stdout).toContain("+1 more, unpriced (included in TOTAL)");
    expect(row(result.stdout, "TOTAL")[7]).toBe("$35.50");
  });
});

describe("cost totals across views", () => {
  /** "$12.50" -> 12.5; the rows' cells must add up to the TOTAL cell. */
  const dollars = (cell: string) => Number(cell.slice(1));

  /** Two sessions, a duplicated response, an advisor iteration, a 1h cache write and a cheap haiku call. */
  function writeMixedProject() {
    const advisor = advisorIteration("claude-opus-5-5", { cache_read_input_tokens: M });
    writeTranscript(home, DIR, "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: M, iterations: [advisor] }),
      assistantLine({ id: "m9", requestId: "r9", input: 1 }),
    ]);
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [
      assistantLine({ id: "m9", requestId: "r9", input: M }),
      assistantLine({ id: "m2", requestId: "r2", output: 2 * M, cacheWrite: M, cacheWrite1h: M }),
    ]);
    writeTranscript(home, DIR, "s2.jsonl", [assistantLine({ id: "m5", requestId: "r5", model: "claude-haiku-5-5", input: 100_000 })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe", description: "Doc" });
  }

  it("gives the same TOTAL in --by agent and --by task, and each is the sum of its rows", () => {
    writeMixedProject();

    const agent = byAgent();
    const tasks = [[], ["--top", "1"]].map((extra) => run(["--by", "task", ...extra], { home, cwd: CWD, width: 200, prices: TEST_PRICES }));

    // lead 1M x1 + advisor (1M in x10 + 1M out x20 + 1M read x50) + scribe (1M x1 + 2M out x2 + 1M 1h x4) + s2 haiku 100k x0.1
    const expected = 1 + 10 + 20 + 50 + 1 + 4 + 4 + 0.01;
    expect(row(agent.stdout, "TOTAL")[6]).toBe(`$${expected.toFixed(2)}`);
    for (const task of tasks) expect(row(task.stdout, "TOTAL")[7]).toBe(row(agent.stdout, "TOTAL")[6]);
    const agentRows = ["lead", "scribe", "advisor"].map((label) => dollars(row(agent.stdout, label)[6]));
    expect(agentRows.reduce((a, b) => a + b)).toBeCloseTo(dollars(row(agent.stdout, "TOTAL")[6]), 1);
    const full = tasks[0].stdout;
    const taskRows = ["Doc", "s1", "s2"].map((label) => dollars(row(full, label)[7]));
    expect(taskRows.reduce((a, b) => a + b)).toBeCloseTo(dollars(row(full, "TOTAL")[7]), 1);
  });

  it("adds up unrounded: the agent rows, the task rows and the total cost agree to 1e-9", () => {
    writeMixedProject();
    const { requests } = loadProject(`${home}/.claude/projects/${DIR}`);

    const total = totalCost(requests, TEST_PRICES).usd;
    const sum = (rows: Array<{ cost: { usd: number } }>) => rows.reduce((n, r) => n + r.cost.usd, 0);

    expect(total).toBeCloseTo(90.01, 9);
    expect(Math.abs(sum(rowsByAgent(requests, TEST_PRICES)) - total)).toBeLessThan(1e-9);
    expect(Math.abs(sum(rowsByTask(requests, TEST_PRICES)) - total)).toBeLessThan(1e-9);
  });
});

describe("reconcile against recorded session cost", () => {
  /** A session whose lead costs `leadInputM` million sonnet input tokens ($1 per M), followed by cost-state lines. */
  function session(id: string, leadInputM: number, ...costStates: unknown[]) {
    writeTranscript(home, DIR, `${id}.jsonl`, [assistantLine({ id: `m-${id}`, requestId: `r-${id}`, input: leadInputM * M }), ...costStates.map(costStateLine)]);
  }

  it("prints one coverage line, a line for each session off by more than 5%, and a skipped note", () => {
    session("s1", 5, 1, 10.2); // The last cost-state line counts. 5M here + 5M in the subagent = $10 against 10.2: -2.0%, no line.
    writeTranscript(home, DIR, "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 5 * M })]);
    writeMeta(home, DIR, "s1", "a1", { agentType: "scribe" });
    // s2: $5 lead + $5 advisor (opus, 0.5M x10) = $10 against 20: -50.0%.
    writeTranscript(home, DIR, "s2.jsonl", [
      assistantLine({ id: "m3", requestId: "r3", input: 5 * M, iterations: [advisorIteration("claude-opus-5-5", { input_tokens: 0.5 * M, output_tokens: 0 })] }),
      costStateLine(20),
    ]);
    session("s6", 10, 9.5); // $10 against 9.5: +5.3%.
    session("s3", 1); // No cost-state line.
    session("s4", 1, 0); // Recorded cost of 0 cannot be compared.

    const result = byAgent();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("transcripts account for 75.6% of recorded session cost");
    expect(result.stdout).toContain("session s2 estimated $10.00 vs recorded $20.00 (-50.0%)");
    expect(result.stdout).toContain("session s6 estimated $10.00 vs recorded $9.50 (+5.3%)");
    expect(result.stdout).not.toContain("session s1");
    expect(result.stdout).toContain("2 session(s) skipped: no usable cost-state line");
  });

  describe("session label in the per-session warning (criterion 4.3)", () => {
    const SESSION = "0a2c91d4-1111-4111-8111-111111111111";
    const STAMP = "2026-03-05T23:30:00.000Z"; // 05:00 on the 6th in Asia/Kolkata
    /** $5 estimated against $20 recorded: always more than 5% off. */
    const offSession = (...lines: string[]) =>
      writeTranscript(home, DIR, `${SESSION}.jsonl`, [...lines, assistantLine({ id: "m1", requestId: "r1", input: 5 * M }), costStateLine(20)]);
    const warningsOf = (stdout: string) => stdout.split("\n").filter((line) => line.startsWith("Warning: session"));
    // The fixed part of the line takes 63 columns, so a title needs a wide terminal to show; 80 leaves room for the id only.
    const byAgentAt = (width: number | undefined) => run(["--by", "agent"], { home, cwd: CWD, prices: TEST_PRICES, width });

    it("names the session by its ai-title and short id, and prints the title nowhere else", () => {
      offSession(aiTitleLine("Fix login flow"));

      const { stdout } = byAgentAt(120);

      expect(warningsOf(stdout)).toEqual(["Warning: session Fix login flow (0a2c91d4) estimated $5.00 vs recorded $20.00 (-75.0%)."]);
      expect(stdout.split("Fix login flow")).toHaveLength(2);
    });

    it("names an untitled session by its local start time and branch", () => {
      offSession(userLine("prompt", { timestamp: STAMP, gitBranch: "feature/x" }));

      expect(warningsOf(byAgentAt(120).stdout)[0]).toContain("session 2026-03-06 05:00 \u00b7 feature/x (0a2c91d4) estimated");
    });

    it("strips control characters from the title", () => {
      offSession(aiTitleLine("Fix\u001b[2J login\u0007"));

      const { stdout } = byAgentAt(120);

      expect(stdout).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
      expect(warningsOf(stdout)[0]).toContain("Fix [2J login (0a2c91d4)");
    });

    it("cuts a long title to the terminal width and keeps the 8-char id", () => {
      offSession(aiTitleLine("Refactor the authentication middleware to stop storing session tokens in plain cookies"));

      for (const width of [100, 90]) {
        const [line] = warningsOf(byAgentAt(width).stdout);

        expect(Array.from(line).length).toBeLessThanOrEqual(width);
        expect(line).toMatch(/^Warning: session Refactor.*\u2026 \(0a2c91d4\) estimated \$5\.00 vs recorded \$20\.00 \(-75\.0%\)\.$/u);
      }
    });

    it("falls back to the bare id when the terminal leaves no room for a title, at the default 80 columns too", () => {
      offSession(aiTitleLine("Fix login flow"));

      for (const width of [undefined, 80, 60]) {
        expect(warningsOf(byAgentAt(width).stdout)).toEqual(["Warning: session 0a2c91d4 estimated $5.00 vs recorded $20.00 (-75.0%)."]);
      }
    });
  });

  it("prints n/a instead of a percentage while some model is unpriced", () => {
    session("s2", 5, 20);

    const result = run(["--by", "agent"], { home, cwd: CWD });

    expect(result.stdout).toContain("Coverage: n/a (prices unverified)");
    expect(result.stdout).not.toContain("session s2");
    expect(result.stdout).not.toContain("account for");
  });

  it("says so when no session has a cost-state line", () => {
    session("s1", 1);

    const result = byAgent();

    expect(result.stdout).toContain("Coverage: n/a (no session has a cost-state line)");
    expect(result.stdout).toContain("1 session(s) skipped");
  });

  it("does not count a directory without transcripts, such as memory/, as a skipped session", () => {
    session("s1", 10, 10);
    fs.mkdirSync(`${home}/.claude/projects/${DIR}/memory`, { recursive: true });

    const result = byAgent();

    expect(result.stdout).toContain("transcripts account for 100.0% of recorded session cost");
    expect(result.stdout).not.toContain("skipped");
  });

  it("is part of --by agent only", () => {
    session("s2", 5, 20);

    const result = run(["--by", "task"], { home, cwd: CWD, prices: TEST_PRICES });

    expect(result.stdout).not.toContain("Coverage");
  });
});
