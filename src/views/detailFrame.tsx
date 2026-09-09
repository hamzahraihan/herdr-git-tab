import React from "react";
import { cellWidth, contentHeight, truncateToWidth } from "../width.js";

/** Rows rendered by the detail reader stay line-addressable so j/k and the
 *  mouse wheel can page through long bodies: every `Row` is exactly one
 *  visual row. Boxes are drawn with text glyphs (not nested TUI borders) so
 *  a scroll window can slice anywhere, including mid-box. */

/** Visible detail rows per frame. Fills the full available terminal height
 *  instead of being tightly capped at a small fixed size. */
export function detailVisibleRows(): number {
  return contentHeight();
}

/** One styled span of a single visual row. */
export type Seg = {
  t: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
};

/** Exactly one visual row. */
export type Row = Seg[];

export function rowWidth(row: Row): number {
  return row.reduce((n, s) => n + cellWidth(s.t), 0);
}

/** Pad a row with trailing spaces to exactly `width` cells. */
export function padRow(row: Row, width: number, backgroundColor?: string): Row {
  const gap = width - rowWidth(row);
  if (gap <= 0) return row;
  return [...row, { t: " ".repeat(gap), backgroundColor }];
}

/** Greedy word wrap; overlong words are hard-broken. Newlines split first. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    const emit = (word: string): void => {
      if (word === "") return;
      const next = line ? `${line} ${word}` : word;
      if (cellWidth(next) <= w) {
        line = next;
        return;
      }
      if (line) out.push(line);
      // Hard-break a word wider than the column.
      let rest = word;
      while (cellWidth(rest) > w) {
        let end = 0;
        let acc = 0;
        for (const ch of rest) {
          const cw = cellWidth(ch);
          if (acc + cw > w) break;
          acc += cw;
          end += ch.length;
        }
        out.push(rest.slice(0, Math.max(1, end)));
        rest = rest.slice(Math.max(1, end));
      }
      line = rest;
    };
    for (const word of para.split(" ")) emit(word);
    out.push(line);
  }
  return out;
}

/**
 * Wrap content rows in a single-line box of total width `inner + 2`.
 * An optional header row spans the full inner width on its wash color.
 */
export function frame(inner: number, content: Row[], header?: Row, headerBg?: string): Row[] {
  const g = (t: string): Seg => ({ t, color: "gray" });
  const rows: Row[] = [[g("┌"), g("─".repeat(Math.max(0, inner))), g("┐")]];
  if (header) {
    const washed = header.map((s) => ({ ...s, backgroundColor: s.backgroundColor ?? headerBg }));
    rows.push([g("│"), ...padRow(washed, inner, headerBg), g("│")]);
  }
  for (const r of content) rows.push([g("│"), ...padRow(r, inner), g("│")]);
  rows.push([g("└"), g("─".repeat(Math.max(0, inner))), g("┘")]);
  return rows;
}

/** `label ───` divider row of exactly `width` cells. */
export function labelRow(label: string, width: number): Row {
  const rule = "─".repeat(Math.max(1, width - cellWidth(label)));
  return [
    { t: label, color: "white" },
    { t: rule, color: "gray", dimColor: true },
  ];
}

/** Truncate the variable half of a `fixed + variable` row to fit `inner`. */
export function fitRow(fixed: string, variable: string, inner: number): string {
  return truncateToWidth(variable, Math.max(1, inner - cellWidth(fixed)));
}
/**
 * `label value` rows that never exceed `inner` cells: fits on one row when
 * possible, otherwise wraps the value beneath a gray label line.
 */
export function field(label: string, value: string, inner: number, color = "white"): Row[] {
  if (cellWidth(label) + cellWidth(value) <= inner) {
    return [
      [
        { t: label, color: "gray" },
        { t: value, color },
      ],
    ];
  }
  const rows: Row[] = [[{ t: label, color: "gray" }]];
  for (const line of wrapText(value, Math.max(1, inner - 2))) {
    rows.push([
      { t: "  ", color: "gray" },
      { t: line || " ", color },
    ]);
  }
  return rows;
}


/**
 * Lay two pre-built row stacks side by side: each combined row is
 * `leftWidth + gap + rightWidth` cells. Short stacks are blank-filled.
 */
export function zipCols(left: Row[], right: Row[], leftWidth: number, rightWidth: number, gap = 1): Row[] {
  const blank = (w: number): Row => [{ t: " ".repeat(w) }];
  const out: Row[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = i < left.length ? padRow(left[i]!, leftWidth) : blank(leftWidth);
    const r = i < right.length ? padRow(right[i]!, rightWidth) : blank(rightWidth);
    out.push([...l, { t: " ".repeat(gap) }, ...r]);
  }
  return out;
}

/** Clamp a line scroll offset and slice the visible window. */
export function windowRows(
  rows: Row[],
  scroll: number,
  visible: number = detailVisibleRows(),
): { win: Row[]; safe: number } {
  const safe = Math.max(0, Math.min(scroll, Math.max(0, rows.length - visible)));
  return { win: rows.slice(safe, safe + visible), safe };
}

export function DetailRows({ rows }: { rows: Row[] }) {
  return (
    <box flexDirection="column">
      {rows.map((row, i) => (
        <text key={i}>
          {row.map((s, j) => {
            if (s.bold) {
              return (
                <strong key={j} fg={s.color} bg={s.backgroundColor}>
                  {s.t}
                </strong>
              );
            }
            return (
              <span key={j} fg={s.color} bg={s.backgroundColor}>
                {s.t}
              </span>
            );
          })}
        </text>
      ))}
    </box>
  );
}
