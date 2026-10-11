import React, { useMemo } from "react";
import type { Commit, CommitDayEntry, HeatmapCell } from "../types.js";
import { buildHeatmapData, formatDisplayDate } from "../git.js";
import { cellWidth, terminalWidth, truncateToWidth } from "../width.js";
import { relativeTime } from "../time.js";
import { scrollDelta } from "../doubleClick.js";

export const LEVEL_COLORS = [
  "#374151", // Level 0: dark gray
  "#166534", // Level 1: deep green
  "#15803d", // Level 2: medium green
  "#22c55e", // Level 3: bright green
  "#4ade80", // Level 4: vibrant light green
];

export const SELECTED_CELL_BG = "#c4b5fd";
export const SELECTED_CELL_FG = "#1e1b2e";

const DAY_LABELS = ["    ", "Mon ", "    ", "Wed ", "    ", "Fri ", "    "];

export default function HeatmapPanel({
  entries,
  commits = [],
  query = "",
  error,
  selectedWeek,
  selectedDay,
  onSelectCell,
}: {
  entries: CommitDayEntry[];
  commits?: Commit[];
  query?: string;
  error?: string;
  selectedWeek?: number;
  selectedDay?: number;
  onSelectCell?: (week: number, day: number) => void;
}) {
  const width = terminalWidth();

  if (error) {
    return (
      <box flexDirection="column">
        <text fg="red">{error}</text>
      </box>
    );
  }

  if (entries.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">No commits yet</text>
      </box>
    );
  }

  // Calculate weeks fitting in width:
  // 4 chars for day label + 2 margin
  const maxWeeks = 52;
  const availableCols = Math.max(24, width - 8);
  const numWeeks = Math.min(maxWeeks, Math.max(12, Math.floor(availableCols / 2)));

  const heatmap = useMemo(
    () =>
      buildHeatmapData(entries, {
        numWeeks,
        filterQuery: query,
      }),
    [entries, numWeeks, query],
  );
  const weeks = heatmap.weeks;
  const totalWeeks = weeks.length;

  // Selected cell defaults to latest week and current day (or Saturday)
  const selW = Math.max(0, Math.min(selectedWeek ?? totalWeeks - 1, totalWeeks - 1));
  const selD = Math.max(0, Math.min(selectedDay ?? 6, 6));

  const selectedCell: HeatmapCell | undefined = weeks[selW]?.days[selD];
  const selectedDateStr = selectedCell?.date ?? "";
  const selectedCount = selectedCell?.count ?? 0;

  // Find commits matching the selected date
  const dayCommits = useMemo(
    () => commits.filter((c) => c.date.startsWith(selectedDateStr)),
    [commits, selectedDateStr],
  );

  return (
    <box
      flexDirection="column"
      onMouseScroll={(e) => {
        const d = scrollDelta(e);
        if (d !== 0) onSelectCell?.(selW + d, selD);
      }}
    >
      {/* Stats summary header */}
      <box flexDirection="column" marginBottom={1}>
        <box flexDirection="row">
          <text>
            <strong fg="white">{heatmap.totalCommits}</strong>
            <span fg="gray">
              {` commit${heatmap.totalCommits === 1 ? "" : "s"} in past ${numWeeks} weeks · `}
            </span>
            <strong fg="white">{heatmap.activeDays}</strong>
            <span fg="gray"> active days · </span>
            <span fg="gray">Current streak: </span>
            <strong fg="green">{heatmap.currentStreak}</strong>
            <span fg="gray">d · Longest streak: </span>
            <strong fg="green">{heatmap.longestStreak}</strong>
            <span fg="gray">d</span>
          </text>
        </box>
        {heatmap.peakDate ? (
          <box flexDirection="row">
            <text>
              <span fg="gray">Peak: </span>
              <strong fg="#4ade80">{heatmap.maxDayCount}</strong>
              <span fg="gray"> commits on </span>
              <span fg="white">{formatDisplayDate(heatmap.peakDate)}</span>
              {query.trim() ? (
                <span>
                  <span fg="gray"> · filter: </span>
                  <strong fg="cyan">{query.trim()}</strong>
                </span>
              ) : null}
            </text>
          </box>
        ) : null}
      </box>

      {/* Month labels row */}
      <box flexDirection="row">
        <box flexShrink={0} width={4}>
          <text>{"    "}</text>
        </box>
        <box flexGrow={1}>
          <text fg="gray">
            {truncateToWidth(heatmap.monthLabels, numWeeks * 2)}
          </text>
        </box>
      </box>

      {/* Calendar grid: 7 rows */}
      {DAY_LABELS.map((dayLabel, dayIdx) => (
        <box key={dayIdx} flexDirection="row">
          <box flexShrink={0} width={4}>
            <text fg="gray">{dayLabel}</text>
          </box>
          {weeks.map((week, w) => {
            const cell = week.days[dayIdx];
            if (!cell || !cell.inRange) {
              return (
                <box
                  key={w}
                  flexShrink={0}
                  width={2}
                  onMouseDown={() => onSelectCell?.(w, dayIdx)}
                >
                  <text>{"  "}</text>
                </box>
              );
            }
            const isSelected = w === selW && dayIdx === selD;
            const color = LEVEL_COLORS[cell.level] ?? LEVEL_COLORS[0];
            return (
              <box
                key={w}
                flexShrink={0}
                width={2}
                onMouseDown={() => onSelectCell?.(w, dayIdx)}
                style={{
                  backgroundColor: isSelected ? SELECTED_CELL_BG : undefined,
                }}
              >
                <text fg={isSelected ? SELECTED_CELL_FG : color}>
                  {"■ "}
                </text>
              </box>
            );
          })}
        </box>
      ))}

      {/* Legend & Selected Date summary */}
      <box flexDirection="row" justifyContent="space-between" marginTop={1}>
        <box flexGrow={1}>
          <text>
            <span fg="cyan">● </span>
            <span fg="white">
              {selectedDateStr ? formatDisplayDate(selectedDateStr) : "No date selected"}
            </span>
            <span fg="gray">{` · ${selectedCount} commit${selectedCount === 1 ? "" : "s"}`}</span>
          </text>
        </box>
        <box flexShrink={0}>
          <text>
            <span fg="gray">Less </span>
            <span fg={LEVEL_COLORS[0]}>■ </span>
            <span fg={LEVEL_COLORS[1]}>■ </span>
            <span fg={LEVEL_COLORS[2]}>■ </span>
            <span fg={LEVEL_COLORS[3]}>■ </span>
            <span fg={LEVEL_COLORS[4]}>■ </span>
            <span fg="gray">More</span>
          </text>
        </box>
      </box>

      {/* Selected day commits list (if any) */}
      <box flexDirection="column" marginTop={1}>
        {dayCommits.length > 0 ? (
          <box flexDirection="column">
            <text fg="gray">{`Commits on ${selectedDateStr}:`}</text>
            {dayCommits.slice(0, 5).map((c) => (
              <box key={c.hash} flexDirection="row">
                <text>
                  <span fg="gray">• </span>
                  <span fg="yellow">{c.shortHash} </span>
                  <strong fg="white">
                    {truncateToWidth(c.subject, Math.max(10, width - 36))}
                  </strong>
                  <span fg="gray">{` (${c.author} · ${relativeTime(c.date)})`}</span>
                </text>
              </box>
            ))}
            {dayCommits.length > 5 ? (
              <text fg="gray">{`  … and ${dayCommits.length - 5} more`}</text>
            ) : null}
          </box>
        ) : selectedCount > 0 ? (
          <text fg="gray">{`${selectedCount} commit${selectedCount === 1 ? "" : "s"} recorded on this date.`}</text>
        ) : (
          <text fg="gray">No commits on this date.</text>
        )}
      </box>
    </box>
  );
}
