// Pipe-key input for panes where stdin has no raw mode.
//
// Herdr drives pane input over a pipe, so Ink's `useInput` would throw
// "Raw mode is not supported" and kill the tab on boot. The app gates
// `useInput` off in that case and feeds keypresses from `stdin "data"`
// through this parser instead, yielding the same `(input, key)` pairs.
//
// Only the keys the TUI handles are decoded precisely; everything else
// arrives as printable input or is ignored.
import type { Key } from "ink";

const ESC = String.fromCharCode(27);
const DEL = String.fromCharCode(127);
const ETX = String.fromCharCode(3);

export interface PipeKeypress {
  input: string;
  key: Key;
}

function baseKey(): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
  };
}

function control(input: string, patch: Partial<Key>): PipeKeypress {
  return { input, key: { ...baseKey(), ...patch } };
}

/** Stateful parser: escape sequences can split across `data` chunks, so a
 *  trailing partial sequence is held until the next `push`. */
export function createPipeParser(): { push(chunk: string): PipeKeypress[] } {
  let carry = "";
  return {
    push(rawChunk: string): PipeKeypress[] {
      const out: PipeKeypress[] = [];
      const chunk = carry + rawChunk;
      carry = "";
      let i = 0;
      const takeEscape = (): boolean => {
        if (chunk[i] !== ESC) return false;
        const rest = chunk.slice(i + 1);
        if (rest.length === 0 || rest === "[") {
          carry = chunk.slice(i);
          i = chunk.length;
          return true;
        }
        // Mouse reporting (see mouse.ts) shares this stream: swallow whole
        // sequences so clicks never surface as typed keys.
        if (rest.startsWith("[<")) {
          const m = /^(\d+);(\d+);(\d+)([Mm])/.exec(rest.slice(2));
          if (m) {
            i += 3 + m[0].length;
            return true;
          }
          if (/^[\d;]*$/.test(rest.slice(2))) {
            carry = chunk.slice(i);
            i = chunk.length;
            return true;
          }
          // Malformed: fall through to the generic CSI path below.
        } else if (rest.startsWith("[M")) {
          if (rest.length >= 6) {
            i += 6;
            return true;
          }
          carry = chunk.slice(i);
          i = chunk.length;
          return true;
        }
        if (rest.startsWith("[")) {
          const seq = rest.slice(1);
          const arrow: Record<string, Partial<Key>> = {
            A: { upArrow: true },
            B: { downArrow: true },
            C: { rightArrow: true },
            D: { leftArrow: true },
          };
          if (seq.length === 0) {
            carry = chunk.slice(i);
            i = chunk.length;
            return true;
          }
          const m = /^([0-9;]*)([A-Za-z~])/.exec(seq);
          if (!m) {
            carry = chunk.slice(i);
            i = chunk.length;
            return true;
          }
          const params = m[1]!;
          const fin = m[2]!;
          if (params === "" && fin in arrow) out.push(control("", arrow[fin]!));
          else if (m[0] === "3~") out.push(control("", { delete: true }));
          // Other CSI sequences are swallowed silently.
          i += 2 + m[0].length;
          return true;
        }
        out.push(control("", { escape: true }));
        i += 1;
        return true;
      };
      while (i < chunk.length) {
        if (takeEscape()) continue;
        const ch = chunk[i]!;
        i += 1;
        if (ch === "\r" || ch === "\n") out.push(control("", { return: true }));
        else if (ch === DEL) out.push(control("", { backspace: true }));
        else if (ch === "\t") out.push(control("", { tab: true }));
        else if (ch === ETX) out.push(control("c", { ctrl: true }));
        else if (ch >= " " || ch === "") out.push(control(ch, {}));
        // Other C0 controls are ignored.
      }
      return out;
    },
  };
}
