import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(import.meta.dirname, "..", "..");

describe("Claude Code plugin", () => {
  it("passes claude plugin validate as a marketplace and as a plugin", () => {
    const result = spawnSync("claude", ["plugin", "validate", ROOT], { encoding: "utf8" });

    const output = result.stdout + result.stderr;
    expect(output).toContain("Validating marketplace manifest");
    expect(output).toContain("Validating plugin:");
    expect(output).toContain("Validation passed");
    expect(result.status).toBe(0);
  });

  it("commands/report.md runs the bundled script from the installed plugin root", () => {
    const text = fs.readFileSync(path.join(ROOT, "commands", "report.md"), "utf8");

    // Without this the ! line is denied and the command prints nothing.
    expect(text).toMatch(/^allowed-tools: Bash\(bash "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/spend\.sh":\*\)$/m);
    expect(text).toMatch(/^!`bash "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/spend\.sh" \$ARGUMENTS`$/m);
    expect(text).toContain("Print the output above verbatim in one fenced code block. Add nothing else.");
  });
});
