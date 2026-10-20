import { describe, expect, it } from "vitest";
import { renderTable, terminalWidth } from "../../src/table.js";

describe("terminalWidth", () => {
  it("prefers the terminal's own width over COLUMNS", () => {
    expect(terminalWidth(120, "90")).toBe(120);
  });

  it("falls back to COLUMNS, then to 80", () => {
    expect(terminalWidth(undefined, "90")).toBe(90);
    expect(terminalWidth(undefined, undefined)).toBe(80);
  });

  it("ignores values that are not a positive whole number", () => {
    expect(terminalWidth(0, "90")).toBe(90);
    for (const columns of ["", "wide", "0", "-5", "1.5", "9e2", " "]) {
      expect(terminalWidth(undefined, columns)).toBe(80);
    }
  });
});

describe("renderTable cut hook", () => {
  it("lets the hook choose the text of a first-column cell that does not fit, by row, and cuts the others with an ellipsis", () => {
    const calls: Array<[number, number]> = [];
    const cut = (row: number, width: number) => {
      calls.push([row, width]);
      return row === 0 ? "abcd1234" : undefined;
    };

    const lines = renderTable(["Name", "N"], [["a long session label (abcd1234)", "1"], ["an ordinary description", "2"], ["short", "3"]], { maxWidth: 20, shrink: [{ column: 0, floor: 8 }], cut });

    expect(lines).toEqual(["Name               N", "abcd1234           1", "an ordinary desc\u2026  2", "short              3"]);
    // Rows are numbered from 0 without the header, and a cell that fits is never offered to the hook.
    expect(calls).toEqual([[0, 17], [1, 17]]);
  });
});
