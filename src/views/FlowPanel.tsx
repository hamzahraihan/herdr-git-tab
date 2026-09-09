import React, { useRef } from "react";
import type { Branch, Commit, PR } from "../types.js";
import { filterCommits } from "./HistoryPanel.js";
import { cellWidth, contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import { buildBranchHierarchy, type BranchRow } from "../branchHierarchy.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";

export const FLOW_COLORS = ["#2dd4bf", "#fb923c", "#f472b6", "#a3e635", "#7dd3fc"];
export const FLOW_TRUNK_COLOR = "#c4b5fd";
export const BRANCH_GLYPH = "⑂";

export function flowBranchColor(index: number): string {
  return FLOW_COLORS[index % FLOW_COLORS.length]!;
}

export function flowVisibleRows(
  commits: Commit[],
  branches: Branch[],
  prs: PR[],
  query: string,
  mergedNames: Set<string>,
  selected: number,
  limit: number = contentHeight(),
): { view: BranchRow[]; start: number; safe: number } {
  const filtered = filterCommits(commits, query);
  const currentBranch = branches.find((b) => b.current)?.name ?? null;
  const { rows } = buildBranchHierarchy(filtered, branches, prs, currentBranch);
  const trunk = rows.find((r) => r.isMain)?.name ?? null;
  const view = rows.map((row) =>
    row.name !== trunk && trunk !== null && mergedNames.has(row.name)
      ? { ...row, merged: true, mergedInto: trunk }
      : row,
  );
  const safe = Math.min(selected, view.length - 1);
  const start = Math.max(0, Math.min(safe - 8, view.length - limit));
  return { view: view.slice(start, start + limit), start, safe };
}

export default function FlowPanel({
  commits,
  branches,
  prs,
  selected,
  query,
  mergedNames,
  onSelect,
  onDoubleClick,
}: {
  commits: Commit[];
  branches: Branch[];
  prs: PR[];
  selected: number;
  query: string;
  mergedNames: Set<string>;
  onSelect?: (index: number) => void;
  onDoubleClick?: (row: BranchRow) => void;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</text>
      </box>
    );
  }
  const { view, start, safe } = flowVisibleRows(
    commits,
    branches,
    prs,
    query,
    mergedNames,
    selected,
  );
  if (view.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">No branches to display</text>
      </box>
    );
  }
  const width = terminalWidth();
  let colorCursor = 0;
  const colors = new Map<string, string>();
  for (const row of view) {
    if (row.isMain) continue;
    if (!colors.has(row.name)) colors.set(row.name, flowBranchColor(colorCursor++));
  }
  const lastClick = useRef<ClickTracker | null>(null);
  const handleRowClick = (idx: number, row: BranchRow): void => {
    onSelect?.(idx);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, idx, now)) {
      lastClick.current = null;
      onDoubleClick?.(row);
    } else {
      lastClick.current = { index: idx, at: now };
    }
  };
  return (
    <box
      flexDirection="column"
      onMouseScroll={(e) => {
        const d = scrollDelta(e);
        if (d !== 0) onSelect?.(Math.max(0, selected + d));
      }}
    >
      {view.map((row, i) => {
        const idx = start + i;
        const active = idx === safe;
        return (
          <box
            key={row.name}
            onMouseDown={() => handleRowClick(idx, row)}
            style={{ backgroundColor: active ? SELECTED_BG : undefined }}
          >
            <BranchRowView
              row={row}
              active={active}
              width={width}
              color={row.isMain ? FLOW_TRUNK_COLOR : (colors.get(row.name) ?? FLOW_COLORS[0]!)}
            />
          </box>
        );
      })}
    </box>
  );
}

function BranchRowView({
  row,
  active,
  width,
  color,
}: {
  row: BranchRow;
  active: boolean;
  width: number;
  color: string;
}) {
  const node = row.merges.length > 0 ? "◆" : "●";
  const sync = `↑${row.ahead} ↓${row.behind}`;
  const prTag = row.prNumber !== null ? ` · PR #${row.prNumber}` : "";
  const mergedTag = row.merged && row.mergedInto ? `merged → ${row.mergedInto}` : "";

  if (row.isMain) {
    const name = truncateToWidth(`${BRANCH_GLYPH}${row.name}`, 20);
    const keep = cellWidth(name) + cellWidth(sync) + (prTag ? cellWidth(prTag) : 0) + 8;
    const laneLen = Math.max(8, Math.min(28, width - keep));
    return (
      <text>
        <strong fg="white">
          {name}{" "}
        </strong>
        <strong fg={color}>
          {node}
          {"─".repeat(laneLen)}→
        </strong>
        <span fg="gray">
          {"  "}
          {mergedTag || "merge"}
          {prTag ? (
            <span>
              {"  "}
              <strong fg="yellow">
                PR #{row.prNumber}
              </strong>
            </span>
          ) : null}
        </span>
      </text>
    );
  }

  const name = truncateToWidth(`${BRANCH_GLYPH}${row.name}`, 16);
  const lane = row.merged ? "──╯" : "───";
  return (
    <text>
      <span fg="gray">
        {"└─"}
      </span>
      {active ? (
        <strong fg={color}>
          {name}{" "}
        </strong>
      ) : (
        <span fg={color}>
          {name}{" "}
        </span>
      )}
      <strong fg={color}>
        {node}
      </strong>
      <span fg={color}>
        {lane}
        {"  "}
      </span>
      <span fg="gray">
        {sync}
      </span>
      {prTag ? (
        <span>
          <span fg="gray">
            {" · "}
          </span>
          <strong fg="yellow">
            PR #{row.prNumber}
          </strong>
        </span>
      ) : null}
      {mergedTag ? (
        <span>
          <span fg="gray">
            {"  "}
            {mergedTag}
          </span>
        </span>
      ) : null}
    </text>
  );
}
