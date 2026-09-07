import React from "react";
import { Box, Text } from "ink";
import type { Branch } from "../types.js";

export default function BranchesPanel({
  branches,
  selected,
  filter,
  error,
}: {
  branches: Branch[];
  selected: number;
  filter: string;
  error?: string;
}) {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? branches.filter((b) => b.name.toLowerCase().includes(q))
    : branches;
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{branches.length === 0 ? "No branches" : "No matches"}</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  return (
    <Box flexDirection="column">
      {filtered.slice(0, 30).map((b, i) => {
        const active = i === safe;
        const ahead = b.ahead > 0 ? ` ↑${b.ahead}` : "";
        const behind = b.behind > 0 ? ` ↓${b.behind}` : "";
        const upstream = b.upstream ? ` [${b.upstream}]` : "";
        return (
          <Text key={b.name} color={active ? "white" : undefined} inverse={active}>
            {b.current ? "*" : " "} {b.name}
            {ahead}
            {behind}
            {upstream} {b.lastCommit}
          </Text>
        );
      })}
    </Box>
  );
}
