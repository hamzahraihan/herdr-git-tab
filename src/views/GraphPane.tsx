import React from "react";
import { Box, Text } from "ink";
import type { Commit } from "../types.js";
import { filterCommits } from "./HistoryPane.js";

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
        <Text color="gray">No commits yet</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  const start = Math.max(0, Math.min(safe - 8, filtered.length - 20));
  const rows = filtered.slice(start, start + 20);
  return (
    <Box flexDirection="column">
      {rows.map((c, i) => {
        const idx = start + i;
        const active = idx === safe;
        const refs = c.refs.length > 0 ? ` (${c.refs.join(", ")})` : "";
        return (
          <Text key={c.hash} color={active ? "cyan" : undefined} inverse={active}>
            {c.graph}
            {c.shortHash}
            {refs}
          </Text>
        );
      })}
    </Box>
  );
}
