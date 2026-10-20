#!/usr/bin/env node
import os from "node:os";
import { loadPrices } from "./pricing.js";
import { run } from "./run.js";
import { terminalWidth } from "./table.js";

const result = run(process.argv.slice(2), {
  home: os.homedir(),
  cwd: process.cwd(),
  width: terminalWidth(process.stdout.columns, process.env.COLUMNS),
  prices: loadPrices(),
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
