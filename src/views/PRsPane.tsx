import React from "react";
import { Box, Text } from "ink";
import type { PR } from "../types.js";

export function filterPRs(prs: PR[], query: string): PR[] {
  const q = query.trim().toLowerCase();
  if (!q) return prs;
  return prs.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      String(p.number).includes(q),
  );
}

export default function PRsPane({
  prs,
  selected,
  query,
  ghError,
  noRemote,
}: {
  prs: PR[];
  selected: number;
  query: string;
  ghError?: string;
  noRemote?: boolean;
}) {
  if (ghError) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">gh unavailable</Text>
        <Text color="gray">{ghError}</Text>
      </Box>
    );
  }
  const filtered = filterPRs(prs, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{noRemote ? "(no GitHub remote)" : "No PRs"}</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  return (
    <Box flexDirection="column">
      {filtered.slice(0, 20).map((p, i) => (
        <Text key={p.number} color={i === safe ? "cyan" : undefined} inverse={i === safe}>
          #{p.number} {p.title} {p.author} {p.checks}
        </Text>
      ))}
    </Box>
  );
}
