import { describe, expect, it } from "vitest";
import { createRowClickHandler, isDoubleClick, scrollDelta } from "../src/doubleClick.js";

describe("isDoubleClick", () => {
  it("fires on same index within window", () => {
    expect(isDoubleClick({ index: 2, at: 1000 }, 2, 1200)).toBe(true);
  });

  it("ignores different index or expired window", () => {
    expect(isDoubleClick({ index: 2, at: 1000 }, 3, 1100)).toBe(false);
    expect(isDoubleClick({ index: 2, at: 1000 }, 2, 2000)).toBe(false);
    expect(isDoubleClick(null, 0, 1000)).toBe(false);
  });
});

describe("createRowClickHandler", () => {
  it("selects every press, opens on double", () => {
    const selected: number[] = [];
    const opened: string[] = [];
    const items = ["a", "b"];
    const { handleClick } = createRowClickHandler<string>({
      onSelect: (i) => selected.push(i),
      onDoubleClick: (item) => opened.push(item),
      getItem: (i) => items[i],
    });
    handleClick(0, 1000);
    handleClick(0, 1200);
    expect(selected).toEqual([0, 0]);
    expect(opened).toEqual(["a"]);
  });
});

describe("scrollDelta", () => {
  it("maps scroll direction and wheel buttons", () => {
    expect(scrollDelta({ scroll: { direction: "up", delta: 1 } })).toBe(-1);
    expect(scrollDelta({ scroll: { direction: "down", delta: 1 } })).toBe(1);
    expect(scrollDelta({ button: 4 })).toBe(-1);
    expect(scrollDelta({ button: 5 })).toBe(1);
    expect(scrollDelta({})).toBe(0);
  });
});
