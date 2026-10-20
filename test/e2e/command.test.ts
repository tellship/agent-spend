import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assistantLine, makeTempDir, writeMeta, writeTranscript } from "../helpers/fixture.js";

const ROOT = path.join(import.meta.dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "spend.sh");
const COMMAND = path.join(ROOT, ".claude", "commands", "spend.md");

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

/** Runs the script the way the slash command does: from the user's project directory, not from the repo root. */
function runScript(args: string[] = [], columns = "100", script = SCRIPT) {
  return spawnSync("bash", [script, ...args], {
    cwd,
    env: { PATH: process.env.PATH, HOME: home, TZ: "Asia/Kolkata", COLUMNS: columns },
    encoding: "utf8",
  });
}

describe("scripts/spend.sh", () => {
  it("prints the --by agent report for the project of the caller's directory", () => {
    writeTranscript(home, cwd.replace(/[^a-zA-Z0-9]/g, "-"), "s1.jsonl", [
      assistantLine({ id: "m1", requestId: "r1", input: 100, output: 9, cacheRead: 1000, cacheWrite: 200 }),
    ]);

    const result = runScript();

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^lead\s+1\s+100\s+9\s+1000\s+200\s+\$0\.00\s+100\.0%$/m);
    expect(result.stdout).toMatch(/^TOTAL\s+1\s+100\s+9\s+1000\s+200/m);
  });

  it("shows the no-transcripts message on stdout and exits 2 when the project has none", () => {
    const result = runScript();

    expect(result.status).toBe(2);
    expect(result.stdout).toContain(`No Claude Code transcripts found in ${path.join(home, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"))}`);
  });

  describe("arguments", () => {
    const projectDir = () => cwd.replace(/[^a-zA-Z0-9]/g, "-");
    const USAGE = "Usage: spend-report --by agent | --by task [--top N]";

    beforeEach(() => {
      writeTranscript(home, projectDir(), "s1/subagents/agent-a1.jsonl", [assistantLine({ id: "m1", requestId: "r1", input: 5, output: 1 })]);
      writeMeta(home, projectDir(), "s1", "a1", { agentType: "scribe", description: "Summarise the quarterly invoices" });
      writeTranscript(home, projectDir(), "s1/subagents/agent-a2.jsonl", [assistantLine({ id: "m2", requestId: "r2", input: 6, output: 1 })]);
      writeMeta(home, projectDir(), "s1", "a2", { agentType: "scribe", description: "Draft the release notes" });
    });

    it("`task` prints the --by task table", () => {
      const result = runScript(["task"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^Task\s+Agent\s+Requests\s/m);
      expect(result.stdout).toMatch(/^Draft the release notes\s+scribe\s+1\s/m);
    });

    it("`task 1` passes --top 1, which hides the rest behind a +K more line", () => {
      const result = runScript(["task", "1"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("+1 more,");
    });

    it.each([["foo"], ["agent", "10"], ["task", "x"]])("shows the CLI usage line and exits 1 for `%s`", (...args) => {
      const result = runScript(args);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(USAGE);
    });

    it("uses 120 columns even when the environment reports COLUMNS=0", () => {
      const result = runScript(["task"], "0");

      expect(result.stdout).toContain("Summarise the quarterly invoices");
    });
  });

  it("says to build and exits 1, writing nothing, when dist/cli.js is missing", () => {
    const tree = makeTempDir();
    try {
      fs.mkdirSync(path.join(tree, "scripts"));
      const script = path.join(tree, "scripts", "spend.sh");
      fs.copyFileSync(SCRIPT, script);

      const result = runScript([], "100", script);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("dist/cli.js missing: run npm install && npm run build");
      expect(fs.readdirSync(tree)).toEqual(["scripts"]);
    } finally {
      fs.rmSync(tree, { recursive: true, force: true });
    }
  });

  it("only reads: no network tool, no file write, no build", () => {
    // The one message that tells the user to build is text, not a command.
    const source = fs.readFileSync(SCRIPT, "utf8").replace(/^ *echo "dist\/cli\.js missing: run npm install && npm run build"$/m, "");

    expect(source).not.toMatch(/\b(curl|wget|fetch|nc|mkdir|npm|tee|touch)\b/);
    // 2>&1 is a descriptor merge; any other > or >> is a write to a file.
    expect(source.replace(/2>&1/g, "")).not.toMatch(/>/);
  });
});

describe(".claude/commands/spend.md", () => {
  const text = () => fs.readFileSync(COMMAND, "utf8");
  const frontmatter = () => text().split("---")[1];

  it("declares the description, the allowed tools and manual-only invocation", () => {
    expect(frontmatter()).toMatch(/^description: \S/m);
    expect(frontmatter()).toMatch(/^allowed-tools: Bash\(bash scripts\/spend\.sh:\*\)$/m);
    expect(frontmatter()).toMatch(/^argument-hint: \[agent\|task\] \[N\]$/m);
    expect(frontmatter()).toMatch(/^disable-model-invocation: true$/m);
  });

  it("injects the output of bash scripts/spend.sh $ARGUMENTS, which exists and is executable, and keeps no spike echo", () => {
    expect(text()).toMatch(/^!`bash scripts\/spend\.sh \$ARGUMENTS`$/m);
    expect(text()).not.toMatch(/echo|COLUMNS|SPIKE/);
    expect(() => fs.accessSync(SCRIPT, fs.constants.X_OK)).not.toThrow();
  });

  it("tells the model to print the output verbatim in one fenced block", () => {
    expect(text()).toContain("Print the output above verbatim in one fenced code block. Add nothing else.");
  });
});
