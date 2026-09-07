import React from "react";
import { Box, Text } from "ink";
import type { Commit } from "../types.js";
import { filterCommits } from "./HistoryPane.js";
import { buildLaneRows, renderFlowGraph } from "../flowGraph.js";

export default function GraphPane({
  commits,
  selected,
  query,
}: {
  commits: Commit[];
  selected: number;
  query: string;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</Text>
      </Box>
    );
  }
  const rows = buildLaneRows(filtered);
  const lines = renderFlowGraph(rows, 24);
  const safe = Math.min(selected, lines.length - 1);
  const start = Math.max(0, Math.min(safe - 8, lines.length - 20));
  const visible = lines.slice(start, start + 20);
  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        const idx = start + i;
        return (
          <Text key={rows[idx].commit.hash} color={idx === safe ? "cyan" : undefined} inverse={idx === safe}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
