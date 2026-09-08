import React from "react";
import { Box, Text } from "ink";
import { cellWidth, terminalWidth, truncateToWidth } from "../width.js";

export type TabDef = { id: number; label: string };

export const TABS: TabDef[] = [
  { id: 1, label: "Commits" },
  { id: 2, label: "Flow" },
  { id: 3, label: "Branches" },
  { id: 4, label: "PRs" },
  { id: 5, label: "Issues" },
  { id: 6, label: "Status" },
];

/** Active tab wash — the lavender highlight in the reference strip. */
export const ACTIVE_TAB_BG = "#c4b5fd";
export const ACTIVE_TAB_FG = "#1e1b2e";

/** Width of one tab cell: ` label ` (single space each side, no border). */
export function tabCellWidth(label: string): number {
  return cellWidth(label) + 2;
}

export function tabsTotalWidth(): number {
  return TABS.reduce((n, t) => n + tabCellWidth(t.label), 0);
}

/**
 * Single-line button strip matching the reference:
 * `repo  branch → upstream · N changes` on the left,
 * `Commits Flow Branches PRs Issues Status` on the right with the
 * active tab on a lavender wash. Followed by a thin gray divider.
 */
export default function HeaderBar({
  active,
  repo,
  current,
  upstream,
  changes,
}: {
  active: number;
  repo: string;
  current: string | null;
  upstream?: string;
  changes: number;
}) {
  const width = terminalWidth();
  const inner = Math.max(20, width - 2);
  const tabsWidth = tabsTotalWidth();
  const leftBudget = Math.max(8, inner - tabsWidth - 2);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexGrow={1} flexShrink={1}>
          <LeftInfo repo={repo} current={current} upstream={upstream} changes={changes} budget={leftBudget} />
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <Text
                key={t.id}
                color={isActive ? ACTIVE_TAB_FG : "gray"}
                backgroundColor={isActive ? ACTIVE_TAB_BG : undefined}
                bold={isActive}
              >
                {` ${t.label} `}
              </Text>
            );
          })}
        </Box>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          {"─".repeat(inner)}
        </Text>
      </Box>
    </Box>
  );
}

function formatLeft(repo: string, current: string | null, upstream: string | undefined, changes: number): string {
  const branch = current ?? "";
  const up = upstream && upstream !== "gone" ? ` → ${upstream}` : "";
  const tail = changes > 0 ? ` · ${changes} change${changes === 1 ? "" : "s"}` : " · clean";
  return `${repo}${branch ? `  ${branch}${up}` : ""}${tail}`;
}

function LeftInfo({
  repo,
  current,
  upstream,
  changes,
  budget,
}: {
  repo: string;
  current: string | null;
  upstream?: string;
  changes: number;
  budget: number;
}) {
  const dirty = changes > 0;
  const tail = dirty ? ` · ${changes} change${changes === 1 ? "" : "s"}` : " · clean";
  // Budget against plain text so the row never wraps; truncate the repo
  // first since branch/upstream/tail carry the actionable state.
  const plain = formatLeft(repo, current, upstream, changes);
  if (cellWidth(plain) <= budget) {
    return (
      <Text>
        <Text color="white" bold>
          {repo}
        </Text>
        {current ? (
          <Text>
            <Text color="white">{"  "}</Text>
            <Text color="green" bold>
              {current}
            </Text>
            {upstream && upstream !== "gone" ? <Text color="gray"> → {upstream}</Text> : null}
          </Text>
        ) : null}
        <Text color={dirty ? "#fb923c" : "gray"}>{tail}</Text>
      </Text>
    );
  }
  return <Text color="gray">{truncateToWidth(plain, budget)}</Text>;
}
