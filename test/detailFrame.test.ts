import { describe, expect, it } from "vitest";
import {
  frame,
  labelRow,
  rowWidth,
  windowRows,
  wrapText,
  zipCols,
  type Row,
} from "../src/views/detailFrame.js";

const plain = (t: string): Row => [{ t }];

describe("frame", () => {
  it("emits top/content/bottom rows exactly inner + 2 cells wide", () => {
    const rows = frame(10, [plain("hi"), plain("world")]);
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(rowWidth(r)).toBe(12);
    expect(rows[0]![0]!.t).toBe("┌");
    expect(rows[3]![0]!.t).toBe("└");
  });

  it("washes the header row full-width on its background", () => {
    const rows = frame(10, [plain("body")], plain("head"), "#33475f");
    expect(rows).toHaveLength(4);
    const header = rows[1]!;
    expect(rowWidth(header)).toBe(12);
    expect(header[1]!.backgroundColor).toBe("#33475f");
  });

  it("label row fills its width with a rule", () => {
    expect(rowWidth(labelRow("Comments (3): ", 30))).toBe(30);
  });
});

describe("wrapText", () => {
  it("keeps every line within width and preserves newlines", () => {
    const lines = wrapText("short\n" + "word ".repeat(30).trim(), 20);
    expect(lines[0]).toBe("short");
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    expect(lines.length).toBeGreaterThan(2);
  });

  it("hard-breaks a word wider than the column", () => {
    const lines = wrapText("a".repeat(50), 10);
    expect(lines).toHaveLength(5);
    for (const l of lines) expect(l).toBe("a".repeat(10));
  });
});

describe("zipCols", () => {
  it("aligns both stacks to left + gap + right widths", () => {
    const left: Row[] = [plain("ab"), plain("c")];
    const right: Row[] = [plain("xyz")];
    const zipped = zipCols(left, right, 6, 5);
    expect(zipped).toHaveLength(2);
    for (const r of zipped) expect(rowWidth(r)).toBe(6 + 1 + 5);
  });
});

describe("windowRows", () => {
  const rows: Row[] = Array.from({ length: 30 }, (_, i) => plain(`line ${i}`));

  it("slices a line window so long bodies scroll", () => {
    // Single-entry content (one long comment) must still page.
    const { win, safe } = windowRows(rows, 5, 24);
    expect(safe).toBe(5);
    expect(win).toHaveLength(24);
    expect(win[0]![0]!.t).toBe("line 5");
  });

  it("clamps past either end", () => {
    expect(windowRows(rows, -3, 24).safe).toBe(0);
    expect(windowRows(rows, 999, 24).safe).toBe(6);
    expect(windowRows(rows.slice(0, 3), 0, 24).win).toHaveLength(3);
  });
});
