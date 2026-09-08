import React from "react";
import { Box, Text } from "ink";
import { terminalWidth, truncateToWidth } from "../width.js";

/** Split overlay text into truncated, scrollable lines. */
export function buildDiffLines(body: string, width: number): string[] {
  return body.split("\n").map((line) => truncateToWidth(line || " ", Math.max(8, width - 2)));
}

const VISIBLE = 24;

export default function DiffView({
  title,
  body,
  scroll,
}: {
  title: string;
  body: string;
  scroll: number;
}) {
  const width = terminalWidth();
  const lines = buildDiffLines(body, width);
  const safe = Math.max(0, Math.min(scroll, Math.max(0, lines.length - VISIBLE)));
  const win = lines.slice(safe, safe + VISIBLE);
  return (
    <Box flexDirection="column">
      <Text bold color="white">
        {truncateToWidth(title, width - 2)}
      </Text>
      {win.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Text color="gray" dimColor>
        {truncateToWidth(`j/k scroll · q/Esc back`, width - 2)}
      </Text>
    </Box>
  );
}
