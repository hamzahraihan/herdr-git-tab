import React from "react";
import { Box, Text } from "ink";
import type { Issue } from "../types.js";

export function filterIssues(issues: Issue[], query: string): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;
  return issues.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.author.toLowerCase().includes(q) ||
      String(i.number).includes(q),
  );
}

export default function IssuesPane({
  issues,
  selected,
  query,
  ghError,
  noRemote,
}: {
  issues: Issue[];
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
  const filtered = filterIssues(issues, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{noRemote ? "(no GitHub remote)" : "No issues"}</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  return (
    <Box flexDirection="column">
      {filtered.slice(0, 20).map((i, idx) => (
        <Text key={i.number} color={idx === safe ? "cyan" : undefined} inverse={idx === safe}>
          #{i.number} {i.title} {i.author}
          {i.labels.length > 0 ? ` [${i.labels.join(", ")}]` : ""}
        </Text>
      ))}
    </Box>
  );
}
