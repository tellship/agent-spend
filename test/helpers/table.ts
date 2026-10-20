/** Cells of the first table row whose first cell is `label`. */
export function row(stdout: string, label: string): string[] {
  const line = stdout.split("\n").find((l) => l.trimStart().startsWith(label + " "));
  if (!line) throw new Error(`no ${label} row in:\n${stdout}`);
  return line.trim().split(/\s{2,}/);
}
