/** Double-click detection for OpenTUI rows.
 *
 *  OpenTUI exposes `onMouseDown` but no double-click event, so panels track
 *  the last press (index + timestamp) and fire `onDoubleClick` when the same
 *  row is pressed twice within `DOUBLE_CLICK_MS`. Every press still calls
 *  `onSelect` so single clicks keep selecting.
 */

export const DOUBLE_CLICK_MS = 400;

export type ClickTracker = { index: number; at: number };

/** True when this press completes a double-click on the same row. */
export function isDoubleClick(
  prev: ClickTracker | null,
  index: number,
  now: number = Date.now(),
  windowMs: number = DOUBLE_CLICK_MS,
): boolean {
  return prev !== null && prev.index === index && now - prev.at <= windowMs;
}

/** Create a stateful row-click handler: select on every press, open on double. */
export function createRowClickHandler<T>(opts: {
  onSelect?: (index: number) => void;
  onDoubleClick?: (item: T) => void;
  getItem: (index: number) => T | undefined;
}): { handleClick: (index: number, now?: number) => void } {
  let last: ClickTracker | null = null;
  return {
    handleClick: (index: number, now: number = Date.now()) => {
      opts.onSelect?.(index);
      if (isDoubleClick(last, index, now)) {
        last = null;
        const item = opts.getItem(index);
        if (item !== undefined) opts.onDoubleClick?.(item);
      } else {
        last = { index, at: now };
      }
    },
  };
}

/** Wheel delta from an OpenTUI scroll event: -1 up, +1 down. */
export function scrollDelta(e: { scroll?: { direction?: string }; button?: number }): number {
  if (e.scroll) return e.scroll.direction === "up" ? -1 : 1;
  // Fallback to raw button codes (WHEEL_UP = 4, WHEEL_DOWN = 5).
  if (e.button === 4) return -1;
  if (e.button === 5) return 1;
  return 0;
}
