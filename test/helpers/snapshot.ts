import fs from "node:fs";
import path from "node:path";

/** Every path under root with its mtime and content, so any write, touch or delete shows up. */
export function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const full = path.join(root, name);
    const stat = fs.statSync(full);
    out[name] = stat.isDirectory() ? `dir ${stat.mtimeMs}` : `${stat.mtimeMs} ${fs.readFileSync(full, "utf8")}`;
  }
  return out;
}
