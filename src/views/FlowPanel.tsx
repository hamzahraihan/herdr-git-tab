import React from "react";
import { Box, Text } from "ink";
import type { Branch, Commit, PR } from "../types.js";
import { filterCommits } from "./HistoryPanel.js";
import { cellWidth, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import {
  buildBranchHierarchy,
  renderBranchLine,
  type BranchRow,
} from "../branchHierarchy.js";

/** Cap rows so connector lines + rows always fit the viewport. */
const MAX_ROWS = 20;

export function flowVisibleRows(
  commits: Commit[],
  branches: Branch[],
  prs: PR[],
  query: string,
  mergedNames: Set<string>,
  selected: number,
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
  const start = Math.max(0, Math.min(safe - 8, view.length - MAX_ROWS));
  return { view: view.slice(start, start + MAX_ROWS), start, safe };
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
  return (
    <Box flexDirection="column">
      {view.map((row, i) => (
        <React.Fragment key={row.name}>
          {row.isMain ? null : (
            <Text color="gray">{"    \\"}</Text>
          )}
          <BranchRowView row={row} active={start + i === safe} width={width} />
        </React.Fragment>
      ))}
    </Box>
  );
}

function BranchRowView({
  row,
  active,
  width,
}: {
  row: BranchRow;
  active: boolean;
  width: number;
}) {
  // Badges after the lane, ` · `-separated like `↑2 · PR #14`.
  const bg = active ? SELECTED_BG : undefined;
  const sep = (
    <Text color="gray" backgroundColor={bg}>
      {" · "}
    </Text>
  );
  const badgeNodes: React.ReactNode[] = [];
  const badgeTexts: string[] = [];
  const sync =
    (row.ahead > 0 ? `↑${row.ahead}` : "") + (row.behind > 0 ? `↓${row.behind}` : "");
  if (sync) {
    badgeNodes.push(
      <Text key="sync" color="gray" backgroundColor={bg}>
        {" "}
        {sync}
      </Text>,
    );
    badgeTexts.push(sync);
  }
  if (row.prNumber !== null) {
    badgeNodes.push(
      badgeNodes.length > 0 ? (
        <React.Fragment key="s1">{sep}</React.Fragment>
      ) : (
        <Text key="s1" backgroundColor={bg}>
          {" "}
        </Text>
      ),
    );
    badgeNodes.push(
      <Text key="pr" bold color="yellow" backgroundColor={bg}>
        PR #{row.prNumber}
      </Text>,
    );
    badgeTexts.push(`PR #${row.prNumber}`);
  }
  if (row.merged && row.mergedInto) {
    const tag = `merged → ${row.mergedInto}`;
    badgeNodes.push(
      badgeNodes.length > 0 ? (
        <React.Fragment key="s2">{sep}</React.Fragment>
      ) : (
        <Text key="s2" backgroundColor={bg}>
          {" "}
        </Text>
      ),
    );
    badgeNodes.push(
      <Text key="merged" color="gray" backgroundColor={bg}>
        {tag}
      </Text>,
    );
    badgeTexts.push(tag);
  }
  const tailWidth = badgeTexts.length > 0 ? cellWidth(` ${badgeTexts.join(" · ")}`) : 0;
  // The graph lane is ~2 cells per commit and easily exceeds the terminal,
  // which desyncs Ink's frame erase. Budget it against the other segments so
  // the whole row is exactly one visual row; a merged lane rejoins the trunk
  // with ──╯ instead of running on with ──>.
  const name = truncateToWidth(row.name, 48);
  const suffix = row.merged ? "──╯" : row.isMain ? "──>" : "";
  const lineBudget = Math.max(8, width - cellWidth(name) - tailWidth - 3);
  const body = truncateToWidth(
    renderBranchLine(row.commits, false, new Set(row.merges)),
    Math.max(8, lineBudget - suffix.length),
  );
  const lane = row.commits.length === 0 && row.merged ? "──╯" : `${body}${suffix}`;
  const nameColor = row.isMain ? "green" : active ? "white" : row.merged ? "gray" : "cyan";
  return (
    <Box flexDirection="row">
      <Text bold={row.isMain || active} color={nameColor} backgroundColor={bg}>
        {name}{" "}
      </Text>
      <LaneGlyphs lane={lane} backgroundColor={bg} />
      {badgeNodes}
    </Box>
  );
}

/** Lane connectors gray, commit nodes white so merges (◆) stand out. */
function LaneGlyphs({ lane, backgroundColor }: { lane: string; backgroundColor?: string }) {
  const parts = lane.split(/([●◆…])/g);
  return (
    <Text color="gray" backgroundColor={backgroundColor}>

      {parts.map((part, i) =>
        part === "●" || part === "◆" ? (
          <Text key={i} color="white">
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}
