import React from "react";
import { Box, Text } from "ink";
import type { RepoStatus } from "../types.js";

export default function StatusPanel({
  status,
  error,
}: {
  status: RepoStatus | null;
  error?: string;
}) {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }
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
  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          Branch: </Text>
        <Text bold>{status.branch}</Text>
        {ahead ? <Text color="green">{ahead}</Text> : null}
        {behind ? <Text color="red">{behind}</Text> : null}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Sync with origin: </Text>
        <Text color={status.ahead > 0 ? "green" : "gray"}>
          {status.ahead > 0 ? `${status.ahead} ahead` : "in sync"}
        </Text>
        <Text color="gray"> · </Text>
        <Text color={status.behind > 0 ? "red" : "gray"}>
          {status.behind > 0 ? `${status.behind} behind` : ""}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Staged ({status.staged.length}):
          {status.staged.length === 0 ? <Text color="gray"> (empty)</Text> : null}
        </Text>
        {status.staged.slice(0, 10).map((f) => (
          <Text key={`s-${f.path}`} color="green">
            {"  "}
            {f.path}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Unstaged ({status.unstaged.length}):
          {status.unstaged.length === 0 ? <Text color="gray"> (empty)</Text> : null}
        </Text>
        {status.unstaged.slice(0, 10).map((f) => (
          <Text key={`u-${f.path}`} color="yellow">
            {"  "}
            {f.path}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Untracked ({status.untracked.length}):
          {status.untracked.length === 0 ? <Text color="gray"> (empty)</Text> : null}
        </Text>
        {status.untracked.slice(0, 10).map((p) => (
          <Text key={`x-${p}`} color="red">
            {"  "}
            {p}
          </Text>
        ))}
      </Box>
      {clean ? (
        <Box marginTop={1}>
          <Text color="green">clean ✓</Text>
        </Box>
      ) : null}
    </Box>
  );
}
