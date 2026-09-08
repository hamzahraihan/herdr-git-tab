import React from "react";
import { Box, Text } from "ink";
import type { IssueDetail } from "../types.js";
import { detailColumns, isWideLayout, terminalWidth, truncateToWidth } from "../width.js";

/** Plain-text discussion lines: title, meta, body, then recent comments. */
export function buildIssueDiscussionLines(detail: IssueDetail): string[] {
  const lines: string[] = [];
  lines.push(`#${detail.number} ${detail.title}`);
  lines.push(`by ${detail.author} · ${detail.state}`);
  lines.push("");
  const body = detail.body.trim() ? detail.body.trim() : "(no description)";
  for (const line of body.split("\n")) lines.push(line);
  lines.push("");
  if (detail.comments.length === 0) {
    lines.push("(no comments yet)");
    return lines;
  }
  const recent = detail.comments.slice(-10);
  lines.push(`Comments (${detail.comments.length}):`);
  for (const c of recent) {
    lines.push("");
    lines.push(`${c.author} commented`);
    if (c.body.trim()) for (const line of c.body.trim().split("\n")) lines.push(line);
  }
  return lines;
}

/** Plain-text rail: state, labels, assignees, comment count. */
export function buildIssueRailLines(detail: IssueDetail): string[] {
  return [
    `state: ${detail.state}`,
    `labels: ${detail.labels.length > 0 ? detail.labels.join(", ") : "—"}`,
    `assignees: ${detail.assignees.length > 0 ? detail.assignees.join(", ") : "—"}`,
    `comments: ${detail.comments.length}`,
    `author: ${detail.author}`,
  ];
}

const VISIBLE = 24;

export default function IssueDetailPanel({
  detail,
  scroll,
}: {
  detail: IssueDetail;
  scroll: number;
}) {
  const width = terminalWidth();
  const wide = isWideLayout(width);
  if (!wide) {
    const all = [...buildIssueDiscussionLines(detail), "", "— info —", ...buildIssueRailLines(detail)];
    const safe = Math.max(0, Math.min(scroll, Math.max(0, all.length - VISIBLE)));
    const win = all.slice(safe, safe + VISIBLE);
    return (
      <Box flexDirection="column">
        {win.map((line, i) => (
          <Text key={i} color={i === 0 ? "white" : undefined} bold={i === 0}>
            {truncateToWidth(line || " ", width - 2)}
          </Text>
        ))}
        <Text color="gray" dimColor>
          {truncateToWidth(`o open · r refresh · q/Esc back`, width - 2)}
        </Text>
      </Box>
    );
  }
  const { discussion, rail } = detailColumns(width);
  const disc = buildIssueDiscussionLines(detail);
  const safe = Math.max(0, Math.min(scroll, Math.max(0, disc.length - VISIBLE)));
  const win = disc.slice(safe, safe + VISIBLE);
  const railLines = buildIssueRailLines(detail);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" width={`${Math.round((discussion / width) * 100)}%`}>
          {win.map((line, i) => (
            <Text key={i} color={i === 0 ? "white" : undefined} bold={i === 0}>
              {truncateToWidth(line || " ", discussion)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          {railLines.map((line, i) => (
            <Text key={i} color="gray">
              {truncateToWidth(line, rail)}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color="gray" dimColor>
        {truncateToWidth(`o open · r refresh · q/Esc back`, width - 2)}
      </Text>
    </Box>
  );
}
