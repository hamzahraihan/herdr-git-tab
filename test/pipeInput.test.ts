import { describe, expect, it } from "vitest";
import { createPipeParser } from "../src/pipeInput.js";

const ESC = String.fromCharCode(27);
const DEL = String.fromCharCode(127);
const ETX = String.fromCharCode(3);

describe("createPipeParser", () => {
  it("passes printable characters through as input", () => {
    const keys = createPipeParser().push("1qr/jk");
    expect(keys.map((k) => k.input)).toEqual(["1", "q", "r", "/", "j", "k"]);
    expect(keys.every((k) => !k.key.return && !k.key.escape)).toBe(true);
  });

  it("decodes return, escape, backspace, delete, and arrows", () => {
    const keys = createPipeParser().push(
      "\r" + ESC + ESC + "[A" + ESC + "[B" + ESC + "[C" + ESC + "[D" + ESC + "[3~" + DEL,
    );
    expect(keys[0]!.key.return).toBe(true);
    expect(keys[1]!.key.escape).toBe(true);
    expect(keys[2]!.key.upArrow).toBe(true);
    expect(keys[3]!.key.downArrow).toBe(true);
    expect(keys[4]!.key.rightArrow).toBe(true);
    expect(keys[5]!.key.leftArrow).toBe(true);
    expect(keys[6]!.key.delete).toBe(true);
    expect(keys[7]!.key.backspace).toBe(true);
  });

  it("flags ctrl+c for the app to exit on", () => {
    const keys = createPipeParser().push(ETX);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.input).toBe("c");
    expect(keys[0]!.key.ctrl).toBe(true);
  });

  it("holds a split escape sequence until the next chunk", () => {
    const parser = createPipeParser();
    expect(parser.push(ESC)).toEqual([]);
    const keys = parser.push("[A");
    expect(keys).toHaveLength(1);
    expect(keys[0]!.key.upArrow).toBe(true);
  });

  it("ignores other C0 controls", () => {
    expect(createPipeParser().push(String.fromCharCode(1, 2))).toEqual([]);
  });
});

describe("createPipeParser mouse swallowing", () => {
  it("swallows SGR click sequences without emitting keys", () => {
    expect(createPipeParser().push(`${ESC}[<0;5;3M`)).toEqual([]);
    expect(createPipeParser().push(`${ESC}[<64;5;3M`)).toEqual([]);
  });

  it("swallows X10 sequences without emitting keys", () => {
    const at = (n: number) => String.fromCharCode(n + 32);
    expect(createPipeParser().push(`${ESC}[M${at(0)}${at(5)}${at(3)}`)).toEqual([]);
  });

  it("holds split mouse sequences and keeps later keys", () => {
    const parser = createPipeParser();
    expect(parser.push(`${ESC}[<0;1`)).toEqual([]);
    expect(parser.push("2;4Mq")).toEqual([{ input: "q", key: expect.anything() }]);
  });

  it("keeps keys surrounding a click in one chunk", () => {
    const keys = createPipeParser().push(`r${ESC}[<0;5;3Mq`);
    expect(keys.map((k) => k.input)).toEqual(["r", "q"]);
  });
});
