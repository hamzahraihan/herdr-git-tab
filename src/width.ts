// Terminal width helpers.
//
// Every rendered row is truncated to the live terminal width (the same
// `stdout.columns || 80` fallback Ink measures with). A single wrapped row
// desyncs Ink's erase-by-cursor-up bookkeeping, after which old frames stop
// being cleared: stacked tab strips and an apparently "frozen" tab. Keeping
// each logical row to exactly one visual row keeps every frame erasable.

/** Live terminal width, with Ink's own fallback when unknown. */
export function terminalWidth(): number {
  const cols = process.stdout.columns;
  return typeof cols === "number" && cols > 0 ? cols : 80;
}

/** Live terminal height, with a sane fallback when unknown. */
export function terminalHeight(): number {
  const rows = process.stdout.rows;
  if (typeof rows === "number" && rows > 0) return rows;
  const env = Number(process.env.LINES);
  return !Number.isNaN(env) && env > 0 ? env : 40;
}

/** Available content rows for the active pane, based on live terminal height
 *  minus persistent chrome (header bar 2, padding 2, footer key bar 1, buffer 1). */
export function contentHeight(overhead = 6): number {
  return Math.max(8, terminalHeight() - overhead);
}

function charWidth(codePoint: number): number {
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return 0;
  }
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** Display width of plain text (no ANSI escapes — truncate before styling). */
export function cellWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch.codePointAt(0)!);
  return width;
}

/** Cut plain text to at most `max` display columns, ending with an
 *  ellipsis when truncated. Never splits a wide character. */
export function truncateToWidth(text: string, max: number): string {
  if (max < 1) return "";
  if (cellWidth(text) <= max) return text;
  let width = 0;
  let end = 0;
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0)!);
    if (width + w > max - 1) break;
    width += w;
    end += ch.length;
  }
  return `${text.slice(0, end)}…`;
}


/** Scale values to bar widths: the leader fills `maxWidth`, the rest scale
 *  proportionally with at least one cell for any nonzero value. */
export function scaleBars(values: number[], maxWidth: number): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0 || maxWidth <= 0) return values.map(() => 0);
  return values.map((v) => {
    if (v <= 0) return 0;
    return Math.max(1, Math.round((v / max) * maxWidth));
  });
}

/** Detail reader breakpoint: wide terminals show discussion (2/3) + info rail
 *  (1/3) side by side; narrow terminals stack the same content. */
export const DETAIL_WIDE_MIN = 100;

/** True when the detail reader should split into discussion + rail. */
export function isWideLayout(width: number = terminalWidth()): boolean {
  return width >= DETAIL_WIDE_MIN;
}

/** Split a wide terminal into discussion + rail widths (2/3 + 1/3). */
export function detailColumns(width: number): { discussion: number; rail: number } {
  const rail = Math.max(24, Math.floor(width / 3));
  return { discussion: Math.max(20, width - rail - 3), rail };
}