import { describe, expect, it } from "vitest";
import { cellWidth, scaleBars, truncateToWidth } from "../src/width.js";

describe("cellWidth", () => {
  it("counts ASCII and box-drawing characters as single cells", () => {
    expect(cellWidth("abc")).toBe(3);
    expect(cellWidth("──●──")).toBe(5);
    expect(cellWidth("↑12 ↓3")).toBe(6);
  });

  it("counts CJK characters as double cells", () => {
    expect(cellWidth("日本語")).toBe(6);
    expect(cellWidth("a日b")).toBe(4);
  });
});

describe("truncateToWidth", () => {
  it("returns short text untouched", () => {
    expect(truncateToWidth("abc", 10)).toBe("abc");
    expect(truncateToWidth("abc", 3)).toBe("abc");
  });

  it("cuts long text with an ellipsis inside the budget", () => {
    expect(truncateToWidth("abcdef", 5)).toBe("abcd…");
    expect(cellWidth(truncateToWidth("abcdef", 5))).toBeLessThanOrEqual(5);
  });

  it("never splits a wide character", () => {
    const cut = truncateToWidth("ab日本語", 5);
    expect(cellWidth(cut)).toBeLessThanOrEqual(5);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("scaleBars", () => {
  it("fills the leader and scales the rest with a one-cell floor", () => {
    expect(scaleBars([46, 1], 20)).toEqual([20, 1]);
    expect(scaleBars([10, 5, 0], 10)).toEqual([10, 5, 0]);
  });

  it("returns zeros for empty input", () => {
    expect(scaleBars([], 10)).toEqual([]);
    expect(scaleBars([0, 0], 10)).toEqual([0, 0]);
  });
  it("handles degenerate budgets", () => {
    expect(truncateToWidth("abc", 0)).toBe("");
    expect(truncateToWidth("abc", 1)).toBe("…");
  });
});
