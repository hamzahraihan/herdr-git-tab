import React from "react";
import { Box, Text } from "ink";
import type { Branch, Commit, PR } from "../types.js";
import { filterCommits } from "./HistoryPanel.js";
import { cellWidth, contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import { buildBranchHierarchy, type BranchRow } from "../branchHierarchy.js";

/** Cap rows so the flow always fits the viewport. */

/**
 * Distinct per-branch lane colors, cycling in display order so adjacent
 * rows never share a color. Matches the reference: teal → orange →
 * pink → green → sky, repeating.
 */
export const FLOW_COLORS = ["#2dd4bf", "#fb923c", "#f472b6", "#a3e635", "#7dd3fc"];

/** Trunk (main/master) lane color — the lavender `merge` line. */
export const FLOW_TRUNK_COLOR = "#c4b5fd";

/** Branch glyph shown before each name (reference uses a small branch icon). */
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
  // Branches fully merged into the trunk rejoin it visually (──╯ + tag).
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
}: {
  commits: Commit[];
  branches: Branch[];
  prs: PR[];
  selected: number;
  query: string;
  mergedNames: Set<string>;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</Text>
      </Box>
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
      <Box flexDirection="column">
        <Text color="gray">No branches to display</Text>
      </Box>
    );
  }
  const width = terminalWidth();
  // Color index counts non-trunk rows in display order so the cycle is
  // stable per render and adjacent rows always differ.
  let colorCursor = 0;
  const colors = new Map<string, string>();
  for (const row of view) {
    if (row.isMain) continue;
    if (!colors.has(row.name)) colors.set(row.name, flowBranchColor(colorCursor++));
  }
  return (
    <Box flexDirection="column">
      {view.map((row, i) => (
        <BranchRowView
          key={row.name}
          row={row}
          active={start + i === safe}
          width={width}
          color={row.isMain ? FLOW_TRUNK_COLOR : (colors.get(row.name) ?? FLOW_COLORS[0]!)}
        />
      ))}
    </Box>
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
  const bg = active ? SELECTED_BG : undefined;
  const node = row.merges.length > 0 ? "◆" : "●";
  // Sync counters always render (zeros included) so columns align like the
  // reference: `↑0 ↓0`.
  const sync = `↑${row.ahead} ↓${row.behind}`;
  const prTag = row.prNumber !== null ? ` · PR #${row.prNumber}` : "";
  const mergedTag = row.merged && row.mergedInto ? `merged → ${row.mergedInto}` : "";

  if (row.isMain) {
    // Trunk: `⑂main  ●────────────→ merge`. The lane stretches to a fixed
    // visual length so it reads as the long lavender line in the reference.
    const name = truncateToWidth(`${BRANCH_GLYPH}${row.name}`, 20);
    const keep = cellWidth(name) + cellWidth(sync) + (prTag ? cellWidth(prTag) : 0) + 8;
    const laneLen = Math.max(8, Math.min(28, width - keep));
    return (
      <Box flexDirection="row">
        <Text bold color="white" backgroundColor={bg}>
          {name}{" "}
        </Text>
        <Text bold color={color} backgroundColor={bg}>
          {node}
          {"─".repeat(laneLen)}→
        </Text>
        <Text color="gray" backgroundColor={bg}>
          {"  "}
          {mergedTag || "merge"}
          {prTag ? (
            <Text>
              {"  "}
              <Text bold color="yellow" backgroundColor={bg}>
                PR #{row.prNumber}
              </Text>
            </Text>
          ) : null}
        </Text>
      </Box>
    );
  }

  // Child: `└─⑂name  ●───  ↑0 ↓0`. Single node per branch (not per commit)
  // like the reference; the dot + short lane carry the branch color.
  const name = truncateToWidth(`${BRANCH_GLYPH}${row.name}`, 16);
  const lane = row.merged ? "──╯" : "───";
  return (
    <Box flexDirection="row">
      <Text color="gray" backgroundColor={bg}>
        {"└─"}
      </Text>
      <Text bold={active} color={color} backgroundColor={bg}>
        {name}{" "}
      </Text>
      <Text bold color={color} backgroundColor={bg}>
        {node}
      </Text>
      <Text color={color} backgroundColor={bg}>
        {lane}
        {"  "}
      </Text>
      <Text color="gray" backgroundColor={bg}>
        {sync}
      </Text>
      {prTag ? (
        <Text backgroundColor={bg}>
          <Text color="gray" backgroundColor={bg}>
            {" · "}
          </Text>
          <Text bold color="yellow" backgroundColor={bg}>
            PR #{row.prNumber}
          </Text>
        </Text>
      ) : null}
      {mergedTag ? (
        <Text backgroundColor={bg}>
          <Text color="gray" backgroundColor={bg}>
            {"  "}
            {mergedTag}
          </Text>
        </Text>
      ) : null}
    </Box>
  );
}
