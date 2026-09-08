import React from "react";
import { Box, Text } from "ink";
import type { Commit } from "../types.js";
import { relativeTime } from "../time.js";
import { SELECTED_BG } from "../theme.js";
import { cellWidth, terminalWidth, truncateToWidth } from "../width.js";

export function filterCommits(commits: Commit[], query: string): Commit[] {
  const q = query.trim().toLowerCase();
  if (!q) return commits;
  return commits.filter(
    (c) =>
      c.subject.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.shortHash.toLowerCase().includes(q),
  );
}

export function historyVisibleRows(
  commits: Commit[],
  query: string,
  selected: number,
): { rows: Commit[]; start: number; safe: number } {
  const filtered = filterCommits(commits, query);
  const safe = Math.min(selected, filtered.length - 1);
  const start = Math.max(0, Math.min(safe - 8, filtered.length - 30));
  return { rows: filtered.slice(start, start + 30), start, safe };
}

export default function HistoryPanel({
  commits,
  selected,
  query,
}: {
  commits: Commit[];
  selected: number;
  query: string;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</Text>
      </Box>
    );
  }
  const { rows, start, safe } = historyVisibleRows(commits, query, selected);
  // Content box already spends paddingX=1 on each side, so rows budget
  // `width - 2` cells to stay exactly one visual row (see width.ts).
  const inner = Math.max(20, terminalWidth() - 2);
  return (
    <Box flexDirection="column">
      {rows.map((c, i) => {
        const idx = start + i;
        return <CommitRow key={c.hash} commit={c} active={idx === safe} inner={inner} />;
      })}
    </Box>
  );
}

function CommitRow({ commit: c, active, inner }: { commit: Commit; active: boolean; inner: number }) {
  const rel = relativeTime(c.date);
  const right = c.author ? `${c.author} · ${rel}` : rel;
  const refsSuffix = c.refs.length > 0 ? ` ${c.refs.join(" ")}` : "";
  const prefix = `• ${c.shortHash} `;
  // Two-space minimum gap keeps the meta visually detached on the right.
  const subjectBudget = Math.max(
    8,
    inner - cellWidth(prefix) - cellWidth(refsSuffix) - cellWidth(right) - 2,
  );
  const subject = truncateToWidth(c.subject, subjectBudget);
  const left = `${prefix}${subject}${refsSuffix}`;
  const gap = Math.max(2, inner - cellWidth(left) - cellWidth(right));
  return (
    <Text backgroundColor={active ? SELECTED_BG : undefined}>
      <Text color="yellow">• </Text>
      <Text color="gray">{c.shortHash} </Text>
      <Text bold color="white">
        {subject}
      </Text>
      {refsSuffix ? <Text color="yellow">{refsSuffix}</Text> : null}
      <Text>{" ".repeat(gap)}</Text>
      <Text color="gray" dimColor>
        {right}
      </Text>
    </Text>
  );
}
