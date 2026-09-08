import React from "react";
import { Box, Text } from "ink";
import type { Issue } from "../types.js";
import { contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";

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

function statusLabel(state: string): { label: string; color: string } {
  if (state === "OPEN") return { label: "Open", color: "green" };
  if (state === "CLOSED") return { label: "Closed", color: "red" };
  return { label: state, color: "yellow" };
}

export default function IssuesPanel({
  issues,
  selected,
  query,
  ghError,
  noRemote,
  error,
}: {
  issues: Issue[];
  selected: number;
  query: string;
  ghError?: string;
  noRemote?: boolean;
  error?: string;
}) {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }
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
  const width = terminalWidth();
  const limit = Math.max(4, Math.floor(contentHeight() / 3));
  return (
    <Box flexDirection="column">
      {filtered.slice(0, limit).map((iss, idx) => {
        const active = idx === safe;
        const status = statusLabel(iss.state);
        const labels = iss.labels.length > 0 ? iss.labels.map((l) => `[${l}]`).join(" ") : "";
        return (
          <Box key={iss.number} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={active ? "white" : undefined} backgroundColor={active ? SELECTED_BG : undefined}>
                {truncateToWidth(`#${iss.number} ${iss.title}`, width)}
              </Text>
            </Box>
            <Box>
              <Text color={status.color}>[{status.label}]</Text>
              {labels ? (
                <Text color="gray"> {truncateToWidth(labels, Math.max(8, width - 24))}</Text>
              ) : null}
              <Text color="gray"> · {iss.author}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
