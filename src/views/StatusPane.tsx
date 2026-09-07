import React from "react";
import { Box, Text } from "ink";
import type { RepoStatus } from "../types.js";

export default function StatusPane({ status }: { status: RepoStatus | null }) {
  if (!status) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No status</Text>
      </Box>
    );
  }
  const clean =
    status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0;
  const ahead = status.ahead > 0 ? ` ↑${status.ahead}` : "";
  const behind = status.behind > 0 ? ` ↓${status.behind}` : "";
  if (clean) {
    return (
      <Box flexDirection="column">
        <Text>
          Branch {status.branch}
          {ahead}
          {behind}
        </Text>
        <Text color="green">clean ✓</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text>
        Branch {status.branch}
        {ahead}
        {behind}
      </Text>
      {status.staged.length > 0 && (
        <Text color="green">
          Staged ({status.staged.length}): {status.staged.slice(0, 8).map((f) => f.path).join(", ")}
          {status.staged.length > 8 ? "…" : ""}
        </Text>
      )}
      {status.unstaged.length > 0 && (
        <Text color="yellow">
          Unstaged ({status.unstaged.length}):{" "}
          {status.unstaged.slice(0, 8).map((f) => f.path).join(", ")}
          {status.unstaged.length > 8 ? "…" : ""}
        </Text>
      )}
      {status.untracked.length > 0 && (
        <Text color="red">
          Untracked ({status.untracked.length}): {status.untracked.slice(0, 8).join(", ")}
          {status.untracked.length > 8 ? "…" : ""}
        </Text>
      )}
    </Box>
  );
}
