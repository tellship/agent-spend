export const TESTED_UP_TO = "2.1.296";

function segments(version: string): number[] | undefined {
  if (!/^\d+(\.\d+)*$/.test(version)) return undefined;
  return version.split(".").map(Number);
}

/** Numeric per-segment comparison; negative when a < b. Unparseable versions are not comparable. */
export function compareVersions(a: string, b: string): number {
  const sa = segments(a);
  const sb = segments(b);
  if (!sa || !sb) return NaN;
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const diff = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Keeps the highest parseable version; ignores anything that does not look like one. */
export function maxVersion(current: string | undefined, candidate: unknown): string | undefined {
  if (typeof candidate !== "string" || segments(candidate) === undefined) return current;
  if (current === undefined || compareVersions(candidate, current) > 0) return candidate;
  return current;
}
