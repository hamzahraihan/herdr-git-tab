import React from "react";
import { Box, Text } from "ink";
import type { PR } from "../types.js";
import { contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";

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

function statusTag(checks: string): { label: string; color: string } {
  if (checks === "failure") return { label: "Changes Requested", color: "red" };
  if (checks === "pending") return { label: "Pending", color: "yellow" };
  if (checks === "success") return { label: "Approved", color: "green" };
  return { label: "—", color: "gray" };
}

export default function PRsPanel({
  prs,
  selected,
  query,
  ghError,
  noRemote,
  error,
}: {
  prs: PR[];
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
  const filtered = filterPRs(prs, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{noRemote ? "(no GitHub remote)" : "No PRs"}</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  const width = terminalWidth();
  const limit = Math.max(5, Math.floor(contentHeight() / 2));
  return (
    <Box flexDirection="column">
      {filtered.slice(0, limit).map((p, i) => {
        const active = i === safe;
        const status = statusTag(p.checks);
        return (
          <Box key={p.number} flexDirection="column">
            <Text color={active ? "white" : undefined} backgroundColor={active ? SELECTED_BG : undefined}>
              {truncateToWidth(`#${p.number} ${p.title} · ${p.branch} → main`, width)}
            </Text>
            <Text>
              {"  "}
              <Text color={status.color}>[{status.label}]</Text>
              <Text color="gray"> · {truncateToWidth(p.author, Math.max(8, width - 24))}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
