import React, { useRef } from "react";
import type { RepoStats, RepoStatus } from "../types.js";
import { humanizeSpan, statusPaths } from "../git.js";
import { SELECTED_BG } from "../theme.js";
import { cellWidth, scaleBars, terminalWidth, truncateToWidth } from "../width.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";
const MAX_AUTHORS = 5;

export default function StatusPanel({
  status,
  error,
  stats,
  selected = 0,
  onSelect,
  onDoubleClick,
}: {
  status: RepoStatus | null;
  error?: string;
  stats?: RepoStats | null;
  selected?: number;
  onSelect?: (index: number) => void;
  onDoubleClick?: (path: string) => void;
}) {
  if (error) {
    return (
      <box flexDirection="column">
        <text fg="red">{error}</text>
      </box>
    );
  }
  if (!status) {
    return (
      <box flexDirection="column">
        <text fg="gray">No status</text>
      </box>
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
  const lastClick = useRef<ClickTracker | null>(null);
  const handlePathClick = (idx: number, path: string): void => {
    onSelect?.(idx);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, idx, now)) {
      lastClick.current = null;
      onDoubleClick?.(path);
    } else {
      lastClick.current = { index: idx, at: now };
    }
  };
  return (
    <box
      flexDirection="column"
      onMouseScroll={(e) => {
        const d = scrollDelta(e);
        if (d !== 0 && paths.length > 0)
          onSelect?.(Math.max(0, Math.min(selected + d, paths.length - 1)));
      }}
    >
      <Contributors stats={stats} width={width} />
      <box>
        <text>
          <span fg="gray">Branch: </span>
          <strong fg="white">{truncateToWidth(status.branch, Math.max(8, width - 16))}</strong>
          {ahead ? <span fg="green">{ahead}</span> : null}
          {behind ? <span fg="red">{behind}</span> : null}
        </text>
      </box>
      <box marginTop={1}>
        <text>
          <span fg="gray">Sync with origin: </span>
          <span fg={status.ahead > 0 ? "green" : "gray"}>
            {status.ahead > 0 ? `${status.ahead} ahead` : "in sync"}
          </span>
          <span fg="gray"> · </span>
          <span fg={status.behind > 0 ? "red" : "gray"}>
            {status.behind > 0 ? `${status.behind} behind` : ""}
          </span>
        </text>
      </box>
      <box marginTop={1} flexDirection="column">
        <text>
          Staged ({status.staged.length}):
          {status.staged.length === 0 ? <span fg="gray"> (empty)</span> : null}
        </text>
        {status.staged.slice(0, 10).map((f) => {
          const idx = paths.findIndex((p) => p.path === f.path);
          return (
            <box
              key={`s-${f.path}`}
              onMouseDown={() => handlePathClick(idx, f.path)}
              style={{ backgroundColor: isSelected(f.path) ? SELECTED_BG : undefined }}
            >
              <text>
                <span fg="green">{truncateToWidth(`  ${f.path}`, width)}</span>
              </text>
            </box>
          );
        })}
      </box>
      <box marginTop={1} flexDirection="column">
        <text>
          Unstaged ({status.unstaged.length}):
          {status.unstaged.length === 0 ? <span fg="gray"> (empty)</span> : null}
        </text>
        {status.unstaged.slice(0, 10).map((f) => {
          const idx = paths.findIndex((p) => p.path === f.path);
          return (
            <box
              key={`u-${f.path}`}
              onMouseDown={() => handlePathClick(idx, f.path)}
              style={{ backgroundColor: isSelected(f.path) ? SELECTED_BG : undefined }}
            >
              <text>
                <span fg="yellow">{truncateToWidth(`  ${f.path}`, width)}</span>
              </text>
            </box>
          );
        })}
      </box>
      <box marginTop={1} flexDirection="column">
        <text>
          Untracked ({status.untracked.length}):
          {status.untracked.length === 0 ? <span fg="gray"> (empty)</span> : null}
        </text>
        {status.untracked.slice(0, 10).map((p) => {
          const idx = paths.findIndex((pp) => pp.path === p);
          return (
            <box
              key={`x-${p}`}
              onMouseDown={() => handlePathClick(idx, p)}
              style={{ backgroundColor: isSelected(p) ? SELECTED_BG : undefined }}
            >
              <text>
                <span fg="red">{truncateToWidth(`  ${p}`, width)}</span>
              </text>
            </box>
          );
        })}
      </box>
      {clean ? (
        <box marginTop={1}>
          <text>
            <span fg="green">working tree: clean</span>
          </text>
        </box>
      ) : null}
    </box>
  );
}

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
    <box flexDirection="column" marginBottom={1}>
      {stats.remote ? (
        <box flexDirection="row">
          <text>
            <span fg="gray">origin </span>
            <strong fg="white">{truncateToWidth(stats.remote, remoteBudget)}</strong>
            <span fg="gray">{truncateToWidth(summary, Math.max(0, width - 8))}</span>
          </text>
        </box>
      ) : null}
      {authors.map((a, i) => (
        <box key={a.name} flexDirection="row">
          <text>
            <span fg="white">{padName(a.name, nameCol)}{" "}</span>
            <span fg={i === 0 ? "green" : "gray"}>{"█".repeat(bars[i] ?? 0)}</span>
            <span fg="white"> {a.count}</span>
          </text>
        </box>
      ))}
    </box>
  );
}

function padName(name: string, col: number): string {
  const cut = truncateToWidth(name, col);
  return cut + " ".repeat(Math.max(0, col - cellWidth(cut)));
}