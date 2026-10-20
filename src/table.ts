export const DEFAULT_WIDTH = 80;
const GAP = 2;
const ELLIPSIS = "\u2026";

export interface FitOptions {
  maxWidth: number;
  /** Columns that may be cut with an ellipsis, in the order they give up width, each down to its floor. */
  shrink: Array<{ column: number; floor: number }>;
  /**
   * Chooses the text of a first-column cell that does not fit, given its row (numbered from 0, header not counted) and
   * the column's width. Undefined leaves the cell to the ellipsis cut. A cell that fits is never offered; the text returned must fit.
   */
  cut?: (row: number, width: number) => string | undefined;
}

/** Characters, not UTF-16 units, so an astral character is neither split nor counted twice. */
function charCount(text: string): number {
  return Array.from(text).length;
}

/** Narrows the shrinkable columns until the table fits maxWidth, or they are all at their floor. */
function shrinkToFit(widths: number[], fit: FitOptions): void {
  let excess = widths.reduce((sum, w) => sum + w, 0) + GAP * (widths.length - 1) - fit.maxWidth;
  for (const { column, floor } of fit.shrink) {
    const cut = Math.max(0, Math.min(excess, widths[column] - floor));
    widths[column] -= cut;
    excess -= cut;
  }
}

/** Left-aligns the first column, right-aligns the rest, two spaces between columns. */
export function renderTable(header: string[], rows: string[][], fit?: FitOptions): string[] {
  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((r) => charCount(r[col]))));
  if (fit) shrinkToFit(widths, fit);
  return all.map((r, rowIndex) =>
    r
      .map((cell, col) => {
        const chars = Array.from(cell);
        const chosen = col === 0 && rowIndex > 0 && chars.length > widths[col] ? fit?.cut?.(rowIndex - 1, widths[col]) : undefined;
        const text = chosen ?? (chars.length <= widths[col] ? cell : chars.slice(0, widths[col] - 1).join("") + ELLIPSIS);
        const pad = " ".repeat(widths[col] - charCount(text));
        return col === 0 ? text + pad : pad + text;
      })
      .join(" ".repeat(GAP))
      .trimEnd(),
  );
}

/**
 * Text written by the lead (meta.json) is untrusted terminal input: control characters would let it
 * move the cursor or rewrite earlier output, and bidi overrides would reorder what is shown.
 * Each run of them, and any whitespace, becomes a single space.
 */
export function printable(text: string): string {
  return text.replace(/[\p{Cc}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}\s]+/gu, " ").trim();
}

/** The terminal's own width, else the COLUMNS variable, else 80 (stdout is not a terminal). */
export function terminalWidth(columns: number | undefined, envColumns: string | undefined): number {
  if (columns !== undefined && Number.isInteger(columns) && columns > 0) return columns;
  if (envColumns !== undefined && /^[1-9]\d*$/.test(envColumns)) return Number(envColumns);
  return DEFAULT_WIDTH;
}
