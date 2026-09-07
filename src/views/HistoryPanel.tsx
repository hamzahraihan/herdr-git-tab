import React from "react";
import { Box, Text } from "ink";
import type { Commit } from "../types.js";

export function filterCommits(commits: Commit[], query: string): Commit[] {
  const q = query.trim().toLowerCase();
  if (!q) return commits;
  return commits.filter(
    (c) =>
      c.subject.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.shortHash.toLowerCase().includes(q),
  );
}

export default function HistoryPanel({
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
  const safe = Math.min(selected, filtered.length - 1);
  const start = Math.max(0, Math.min(safe - 8, filtered.length - 30));
  const rows = filtered.slice(start, start + 30);
  return (
    <Box flexDirection="column">
      {rows.map((c, i) => {
        const idx = start + i;
        const active = idx === safe;
        const refs = c.refs.length > 0 ? ` ${c.refs.join(", ")}` : "";
        return (
          <Text key={c.hash} color={active ? "white" : undefined} inverse={active}>
            {c.shortHash} {c.author} {c.date.slice(0, 10)} {c.subject}
            {refs}
          </Text>
        );
      })}
    </Box>
  );
}
