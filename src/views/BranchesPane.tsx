import React from "react";
import { Box, Text } from "ink";
import type { Branch } from "../types.js";

export default function BranchesPane({
  branches,
  selected,
}: {
  branches: Branch[];
  selected: number;
}) {
  if (branches.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No branches</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, branches.length - 1);
  return (
    <Box flexDirection="column">
      {branches.slice(0, 20).map((b, i) => {
        const active = i === safe;
        const ahead = b.ahead > 0 ? ` ↑${b.ahead}` : "";
        const behind = b.behind > 0 ? ` ↓${b.behind}` : "";
        const upstream = b.upstream ? ` [${b.upstream}]` : "";
        return (
          <Text key={b.name} color={active ? "cyan" : undefined} inverse={active}>
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
