import path from "node:path";
import type { PriceTable } from "./pricing.js";
import { formatAgentReport } from "./reportAgent.js";
import { formatTaskReport } from "./reportTask.js";
import { DEFAULT_WIDTH } from "./table.js";
import { loadProject } from "./transcripts.js";

export interface RunEnv {
  home: string;
  cwd: string;
  /** Terminal width in characters; 80 when omitted. */
  width?: number;
  /** Per-model rates; when omitted every model is unpriced. */
  prices?: PriceTable;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const USAGE = "Usage: agent-spend --by agent | --by task [--top N]\n";

type Command = { by: "agent" } | { by: "task"; top?: number };

function parseArgs(argv: string[]): Command | undefined {
  const [flag, by, ...rest] = argv;
  if (flag !== "--by") return undefined;
  if (by === "agent" && rest.length === 0) return { by };
  if (by !== "task") return undefined;
  if (rest.length === 0) return { by };
  if (rest.length === 2 && rest[0] === "--top" && /^[1-9]\d*$/.test(rest[1])) return { by, top: Number(rest[1]) };
  return undefined;
}

export function run(argv: string[], env: RunEnv): RunResult {
  const command = parseArgs(argv);
  if (!command) return { code: 1, stdout: "", stderr: USAGE };
  // Claude Code names a project's transcript dir after its cwd, every non-alphanumeric character becoming "-".
  const dir = path.join(env.home, ".claude", "projects", env.cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  const { fileCount, requests, sessions, findings } = loadProject(dir);
  if (fileCount === 0) {
    return { code: 2, stdout: "", stderr: `No Claude Code transcripts found in ${dir}\n` };
  }
  const prices = env.prices ?? new Map();
  const stdout =
    command.by === "task"
      ? formatTaskReport(dir, requests, findings, prices, sessions, { top: command.top, width: env.width })
      : formatAgentReport(dir, requests, findings, prices, sessions, env.width ?? DEFAULT_WIDTH);
  return { code: 0, stdout, stderr: "" };
}
