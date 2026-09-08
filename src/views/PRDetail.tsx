import React from "react";
import { Box, Text } from "ink";
import type { PRDetail } from "../types.js";
import { detailColumns, isWideLayout, terminalWidth, truncateToWidth } from "../width.js";

/** Plain-text discussion lines: title, meta, body, then comments. */
export function buildPRDiscussionLines(detail: PRDetail): string[] {
  const lines: string[] = [];
  lines.push(`#${detail.number} ${detail.title}`);
  const draft = detail.isDraft ? " · draft" : "";
  lines.push(`by ${detail.author} · ${detail.state}${draft}`);
  lines.push("");
  const body = detail.body.trim() ? detail.body.trim() : "(no description)";
  for (const line of body.split("\n")) lines.push(line);
  lines.push("");
  if (detail.comments.length === 0 && detail.reviews.length === 0) {
    lines.push("(no discussion yet)");
    return lines;
  }
  lines.push(`Discussion (${detail.comments.length + detail.reviews.length}):`);
  for (const r of detail.reviews) {
    lines.push("");
    lines.push(`${r.author} reviewed [${r.state || "?"}]`);
    if (r.body?.trim()) for (const line of r.body.trim().split("\n")) lines.push(line);
  }
  for (const c of detail.comments) {
    lines.push("");
    lines.push(`${c.author} commented`);
    if (c.body.trim()) for (const line of c.body.trim().split("\n")) lines.push(line);
  }
  return lines;
}

/** Plain-text rail lines: branches, checks, reviews, labels, mergeability, stats. */
export function buildPRRailLines(detail: PRDetail): string[] {
  const lines: string[] = [];
  lines.push(`branch: ${detail.headRefName || "?"} → ${detail.baseRefName || "?"}`);
  lines.push(`checks: ${detail.checks}`);
  const decision = detail.reviewDecision ? detail.reviewDecision : "—";
  lines.push(`reviews: ${decision} (${detail.reviews.length})`);
  for (const r of detail.reviews.slice(0, 5)) lines.push(`  ${r.author}: ${r.state || "?"}`);
  lines.push(`labels: ${detail.labels.length > 0 ? detail.labels.join(", ") : "—"}`);
  lines.push(`mergeable: ${detail.mergeable}`);
  lines.push(`merge state: ${detail.mergeStateStatus}`);
  lines.push(`stats: +${detail.additions} -${detail.deletions} · ${detail.changedFiles} files · ${detail.commits} commits`);
  return lines;
}

const VISIBLE = 24;

export default function PRDetailPanel({
  detail,
  scroll,
}: {
  detail: PRDetail;
  scroll: number;
}) {
  const width = terminalWidth();
  const wide = isWideLayout(width);
  if (!wide) {
    const all = [...buildPRDiscussionLines(detail), "", "— info —", ...buildPRRailLines(detail)];
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
          {truncateToWidth(`c/Enter checkout · a approve · o open · r refresh · q/Esc back`, width - 2)}
        </Text>
      </Box>
    );
  }
  const { discussion, rail } = detailColumns(width);
  const disc = buildPRDiscussionLines(detail);
  const safe = Math.max(0, Math.min(scroll, Math.max(0, disc.length - VISIBLE)));
  const win = disc.slice(safe, safe + VISIBLE);
  const railLines = buildPRRailLines(detail);
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
        {truncateToWidth(`c/Enter checkout · a approve · o open · r refresh · q/Esc back`, width - 2)}
      </Text>
    </Box>
  );
}
