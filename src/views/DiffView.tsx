import React from "react";
import { contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { highlightDiffLine } from "../diffHighlighter.js";
import { scrollDelta } from "../doubleClick.js";

/** Split overlay text into truncated, scrollable lines. */
export function buildDiffLines(body: string, width: number): string[] {
  return body.split("\n").map((line) => truncateToWidth(line || " ", Math.max(8, width - 2)));
}

export default function DiffView({
  title,
  body,
  scroll,
  onScroll,
}: {
  title: string;
  body: string;
  scroll: number;
  onScroll?: (delta: number) => void;
}) {
  const width = terminalWidth();
  const lines = buildDiffLines(body, width);
  const limit = contentHeight(8);
  const safe = Math.max(0, Math.min(scroll, Math.max(0, lines.length - limit)));
  const win = lines.slice(safe, safe + limit);
  return (
    <box
      flexDirection="column"
      onMouseScroll={(e) => {
        const delta = scrollDelta(e);
        if (delta !== 0) onScroll?.(delta);
      }}
    >
      <text>
        <strong fg="white">{truncateToWidth(title, width - 2)}</strong>
      </text>
      {win.map((line, i) => {
        const spans = highlightDiffLine(line);
        return (
          <text key={i}>
            {spans.map((s, j) =>
              s.bold ? (
                <strong key={j} fg={s.color} bg={s.backgroundColor}>
                  {s.text}
                </strong>
              ) : (
                <span key={j} fg={s.color} bg={s.backgroundColor}>
                  {s.text}
                </span>
              ),
            )}
          </text>
        );
      })}
      <text fg="gray">
        {truncateToWidth(`j/k scroll · q/Esc back`, width - 2)}
      </text>
    </box>
  );
}
