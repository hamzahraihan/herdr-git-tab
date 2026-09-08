// Mouse support for the git tab.
//
// Terminals report mouse clicks/wheel as escape sequences on stdin when the
// application opts in (see MOUSE_ENABLE). Ink has no mouse API, so this
// module decodes the byte stream and hit-tests against our deterministic
// layout: every content row is exactly one visual row (see width.ts), the
// tab strip sits at a known offset, and panels expose their visible rows.
//
// Two reporting flavors are decoded:
//   SGR (1006):  ESC [ < Cb ; Cx ; Cy M  (press) / m (release)
//   X10:         ESC [ M Cb Cx Cy        (bytes offset by 32; Cb 3 = release)
// Coordinates are 1-based terminal cells, matching Herdr/xterm behavior.
import { TABS, tabCellWidth, tabsTotalWidth } from "./views/TabBar.js";
import { terminalWidth } from "./width.js";

const ESC = String.fromCharCode(27);

export const MOUSE_ENABLE =
  `${ESC}[?1000h` + `${ESC}[?1002h` + `${ESC}[?1006h`;
export const MOUSE_DISABLE =
  `${ESC}[?1000l` + `${ESC}[?1002l` + `${ESC}[?1006l`;

export type MouseButton = "left" | "middle" | "right" | "wheel-up" | "wheel-down";

export interface MouseEvent {
  button: MouseButton;
  /** 1-based column. */
  x: number;
  /** 1-based row. */
  y: number;
  /** False for release events (callers usually only want presses). */
  pressed: boolean;
}

function decodeButton(cb: number): { button: MouseButton; motion: boolean } | null {
  if (cb & 64) {
    // Wheel bit. Motion bit distinguishes scroll direction encoding.
    return { button: cb & 1 ? "wheel-down" : "wheel-up", motion: false };
  }
  if (cb & 32) return null; // Drag motion: not actionable, skip.
  const kind = cb & 3;
  if (kind === 0) return { button: "left", motion: false };
  if (kind === 1) return { button: "middle", motion: false };
  if (kind === 2) return { button: "right", motion: false };
  return null; // kind 3 = release of a button we otherwise ignore.
}

/** Stateful decoder: sequences can split across `data` chunks, so a trailing
 *  partial sequence is held until the next `push`. Non-mouse bytes pass
 *  through untouched (keys are decoded elsewhere). */
export function createMouseParser(): { push(chunk: string): MouseEvent[] } {
  let carry = "";
  return {
    push(rawChunk: string): MouseEvent[] {
      const out: MouseEvent[] = [];
      const chunk = carry + rawChunk;
      carry = "";
      let i = 0;
      while (i < chunk.length) {
        if (chunk[i] !== ESC || chunk[i + 1] !== "[") {
          i += 1;
          continue;
        }
        // SGR: ESC [ < Cb ; Cx ; Cy M|m
        if (chunk[i + 2] === "<") {
          const tail = chunk.slice(i + 3);
          const m = /^(\d+);(\d+);(\d+)([Mm])/.exec(tail);
          if (!m) {
            // Incomplete only if the tail could still become a sequence.
            if (/^[\d;]*$/.test(tail)) {
              carry = chunk.slice(i);
              i = chunk.length;
            } else {
              i += 3;
            }
            continue;
          }
          const decoded = decodeButton(Number(m[1]));
          if (decoded) {
            out.push({
              button: decoded.button,
              x: Number(m[2]),
              y: Number(m[3]),
              pressed: m[4] === "M",
            });
          }
          i += 3 + m[0].length;
          continue;
        }
        // X10: ESC [ M Cb Cx Cy (each offset by 32).
        if (chunk[i + 2] === "M") {
          if (i + 6 > chunk.length) {
            carry = chunk.slice(i);
            i = chunk.length;
            continue;
          }
          const cb =
            (chunk.codePointAt(i + 3) ?? 0) - 32;
          const released = (cb & 3) === 3 && !(cb & 64);
          const decoded = decodeButton(cb);
          if (decoded && !released) {
            out.push({
              button: decoded.button,
              x: (chunk.codePointAt(i + 4) ?? 32) - 32,
              y: (chunk.codePointAt(i + 5) ?? 32) - 32,
              pressed: true,
            });
          } else if (released) {
            out.push({
              button: "left",
              x: (chunk.codePointAt(i + 4) ?? 32) - 32,
              y: (chunk.codePointAt(i + 5) ?? 32) - 32,
              pressed: false,
            });
          }
          i += 6;
          continue;
        }
        // Some other escape sequence: skip the introducer, keep scanning.
        i += 2;
      }
      return out;
    },
  };
}

export interface TabHit {
  id: number;
  /** 1-based inclusive columns. */
  x0: number;
  x1: number;
}

/** Column ranges of the six tab-strip items. The header strip right-aligns
 *  the tabs inside a `paddingX={1}` box, so the last cell ends at column
 *  `width - 1` and ranges run contiguously leftwards; each cell is
 *  ` label ` (see TabBar `tabCellWidth`). */
export function tabRanges(width: number = terminalWidth()): TabHit[] {
  const total = tabsTotalWidth();
  let x = Math.max(2, width - total);
  return TABS.map((t) => {
    const w = tabCellWidth(t.label);
    const hit = { id: t.id, x0: x, x1: x + w - 1 };
    x += w;
    return hit;
  });
}

/** Map a 0-based offset into rows of known heights to a row index, or null
 *  when past the end (clicks on padding/blank space select nothing). */
export function rowIndexAt(dy: number, heights: number[]): number | null {
  if (dy < 0) return null;
  let y = 0;
  for (let k = 0; k < heights.length; k++) {
    const h = heights[k] ?? 0;
    if (dy < y + h) return k;
    y += h;
  }
  return null;
}
