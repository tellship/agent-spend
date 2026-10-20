import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(import.meta.dirname, "..", "..", "src");

// The tool reads local files only: no network, no child processes.
const FORBIDDEN = [
  /(?:from|import|require)\s*\(?\s*["'](?:node:)?(?:http|https|http2|net|tls|dgram|child_process)["']/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b|\bWebSocket\b/,
];

describe("source tree", () => {
  it("imports no network or child_process module and never calls fetch", () => {
    const files = fs.readdirSync(SRC).filter((n) => n.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const text = fs.readFileSync(path.join(SRC, name), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(text, `${name} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
