import React from "react";
import { Box, Text } from "ink";
import type { RepoStats, RepoStatus } from "../types.js";
import { humanizeSpan, statusPaths } from "../git.js";
import { SELECTED_BG } from "../theme.js";
import { cellWidth, scaleBars, terminalWidth, truncateToWidth } from "../width.js";
const MAX_AUTHORS = 5;
export default function StatusPanel({
  status,
  error,
  stats,
  selected = 0,
}: {
  status: RepoStatus | null;
  error?: string;
  stats?: RepoStats | null;
  selected?: number;
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
  const width = terminalWidth();
  const paths = statusPaths(status);
  const activePath = paths[Math.min(selected, Math.max(0, paths.length - 1))]?.path;
  const isSelected = (p: string): boolean => p === activePath && paths.length > 0;
  return (
    <Box flexDirection="column">
      <Contributors stats={stats} width={width} />
      <Box>
        <Text>
          Branch: </Text>
        <Text bold>{truncateToWidth(status.branch, Math.max(8, width - 16))}</Text>
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
          <Text
            key={`s-${f.path}`}
            color="green"
            backgroundColor={isSelected(f.path) ? SELECTED_BG : undefined}
          >
            {truncateToWidth(`  ${f.path}`, width)}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Unstaged ({status.unstaged.length}):
          {status.unstaged.length === 0 ? <Text color="gray"> (empty)</Text> : null}
        </Text>
        {status.unstaged.slice(0, 10).map((f) => (
          <Text
            key={`u-${f.path}`}
            color="yellow"
            backgroundColor={isSelected(f.path) ? SELECTED_BG : undefined}
          >
            {truncateToWidth(`  ${f.path}`, width)}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Untracked ({status.untracked.length}):
          {status.untracked.length === 0 ? <Text color="gray"> (empty)</Text> : null}
        </Text>
        {status.untracked.slice(0, 10).map((p) => (
          <Text
            key={`x-${p}`}
            color="red"
            backgroundColor={isSelected(p) ? SELECTED_BG : undefined}
          >
            {truncateToWidth(`  ${p}`, width)}
          </Text>
        ))}
      </Box>
      {clean ? (
        <Box marginTop={1}>
          <Text color="green">working tree: clean</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** Origin summary + per-author commit bars, mirroring the reference visual:
 *  dim `origin`, bright remote, dim stats; leader bar bright green, the rest
 *  gray, each scaled to the terminal width. Hidden when there is nothing to
 *  show (no remote and no authors). */
function Contributors({ stats, width }: { stats?: RepoStats | null; width: number }) {
  if (!stats || (!stats.remote && stats.authors.length === 0)) return null;
  const span = humanizeSpan(stats.oldest, stats.newest);
  const summary = ` · ${stats.total} commit${stats.total === 1 ? "" : "s"}${span ? ` · ${span}` : ""}`;
  const remoteBudget = Math.max(8, width - cellWidth("origin  ") - cellWidth(summary));
  const authors = stats.authors.slice(0, MAX_AUTHORS);
  const nameCol = Math.min(
    16,
    Math.max(0, ...authors.map((a) => cellWidth(a.name))),
  );
  const countCol = Math.max(1, ...authors.map((a) => String(a.count).length));
  const barMax = Math.max(4, width - nameCol - countCol - 2);
  const bars = scaleBars(
    authors.map((a) => a.count),
    barMax,
  );
  return (
    <Box flexDirection="column" marginBottom={1}>
      {stats.remote ? (
        <Box flexDirection="row">
          <Text color="gray">origin </Text>
          <Text bold color="white">
            {truncateToWidth(stats.remote, remoteBudget)}
          </Text>
          <Text color="gray">{truncateToWidth(summary, Math.max(0, width - 8))}</Text>
        </Box>
      ) : null}
      {authors.map((a, i) => (
        <Box key={a.name} flexDirection="row">
          <Text color="white">
            {padName(a.name, nameCol)}{" "}
          </Text>
          <Text color={i === 0 ? "greenBright" : "gray"}>{"█".repeat(bars[i] ?? 0)}</Text>
          <Text color="white"> {a.count}</Text>
        </Box>
      ))}
    </Box>
  );
}

/** Truncate a name to the column and pad with spaces to align bars. */
function padName(name: string, col: number): string {
  const cut = truncateToWidth(name, col);
  return cut + " ".repeat(Math.max(0, col - cellWidth(cut)));
}
