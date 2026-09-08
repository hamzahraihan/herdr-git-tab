import { describe, expect, it } from "vitest";
import { createMouseParser, rowIndexAt, tabRanges } from "../src/mouse.js";

const ESC = String.fromCharCode(27);

describe("createMouseParser", () => {
  it("decodes SGR left press and release", () => {
    const presses = createMouseParser().push(`${ESC}[<0;5;3M`);
    expect(presses).toEqual([{ button: "left", x: 5, y: 3, pressed: true }]);
    const releases = createMouseParser().push(`${ESC}[<0;5;3m`);
    expect(releases).toEqual([{ button: "left", x: 5, y: 3, pressed: false }]);
  });

  it("decodes wheel and right buttons", () => {
    expect(createMouseParser().push(`${ESC}[<64;9;2M`)).toEqual([
      { button: "wheel-up", x: 9, y: 2, pressed: true },
    ]);
    expect(createMouseParser().push(`${ESC}[<65;9;2M`)).toEqual([
      { button: "wheel-down", x: 9, y: 2, pressed: true },
    ]);
    expect(createMouseParser().push(`${ESC}[<2;9;2M`)).toEqual([
      { button: "right", x: 9, y: 2, pressed: true },
    ]);
  });

  it("ignores drag motion", () => {
    expect(createMouseParser().push(`${ESC}[<32;9;2M`)).toEqual([]);
  });

  it("decodes X10 sequences with byte offsets", () => {
    const at = (n: number) => String.fromCharCode(n + 32);
    expect(createMouseParser().push(`${ESC}[M${at(0)}${at(5)}${at(3)}`)).toEqual([
      { button: "left", x: 5, y: 3, pressed: true },
    ]);
  });

  it("holds split sequences across chunks", () => {
    const parser = createMouseParser();
    expect(parser.push(`${ESC}[<0;1`)).toEqual([]);
    expect(parser.push(`2;4M`)).toEqual([{ button: "left", x: 12, y: 4, pressed: true }]);
  });

  it("passes non-mouse bytes through silently", () => {
    expect(createMouseParser().push("1qj")).toEqual([]);
    expect(createMouseParser().push(`${ESC}[A`)).toEqual([]);
  });
});

describe("tabRanges", () => {
  it("right-aligns six contiguous ranges ending at width - 1", () => {
    const width = 80;
    const ranges = tabRanges(width);
    expect(ranges).toHaveLength(6);
    expect(ranges[0]).toEqual({ id: 1, x0: width - 46, x1: width - 46 + "Commits".length + 1 });
    for (let k = 1; k < ranges.length; k++) {
      expect(ranges[k]!.x0).toBe(ranges[k - 1]!.x1 + 1);
    }
    expect(ranges[5]!.x1).toBe(width - 1);
  });
});

describe("rowIndexAt", () => {
  it("maps offsets through variable row heights", () => {
    expect(rowIndexAt(0, [1, 2, 1])).toBe(0);
    expect(rowIndexAt(1, [1, 2, 1])).toBe(1);
    expect(rowIndexAt(2, [1, 2, 1])).toBe(1);
    expect(rowIndexAt(3, [1, 2, 1])).toBe(2);
    expect(rowIndexAt(4, [1, 2, 1])).toBeNull();
    expect(rowIndexAt(-1, [1])).toBeNull();
  });
});
