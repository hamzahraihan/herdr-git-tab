import React from "react";
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

export const ACTIVE_TAB_BG = "#c4b5fd";
export const ACTIVE_TAB_FG = "#1e1b2e";
export const HOVER_TAB_BG = "#3e4451";
export const HOVER_TAB_FG = "#ffffff";

export function tabCellWidth(label: string): number {
  return cellWidth(label) + 2;
}

export function tabsTotalWidth(): number {
  return TABS.reduce((n, t) => n + tabCellWidth(t.label), 0);
}

export default function HeaderBar({
  active,
  repo,
  current,
  upstream,
  changes,
  onSelectTab,
}: {
  active: number;
  repo: string;
  current: string | null;
  upstream?: string;
  changes: number;
  onSelectTab?: (id: number) => void;
}) {
  const width = terminalWidth();
  const inner = Math.max(20, width - 2);
  const tabsWidth = tabsTotalWidth();
  const leftBudget = Math.max(8, inner - tabsWidth - 2);
  return (
    <box flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <box flexGrow={1} flexShrink={1}>
          <LeftInfo repo={repo} current={current} upstream={upstream} changes={changes} budget={leftBudget} />
        </box>
        <box flexDirection="row" flexShrink={0}>
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
<box
              key={t.id}
              onMouseDown={() => onSelectTab?.(t.id)}
              style={{
                backgroundColor: isActive ? ACTIVE_TAB_BG : undefined,
              }}
            >
              <text fg={isActive ? ACTIVE_TAB_FG : "gray"}>{` ${t.label} `}</text>
            </box>
            );
          })}
        </box>
      </box>
      <box>
        <text fg="gray">
          {"─".repeat(inner)}
        </text>
      </box>
    </box>
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
  const plain = formatLeft(repo, current, upstream, changes);
  if (cellWidth(plain) <= budget) {
    return (
      <text>
        <strong fg="white">
          {repo}
        </strong>
        {current ? (
          <span>
            <span>{"  "}</span>
            <strong fg="green">
              {current}
            </strong>
            {upstream && upstream !== "gone" ? <span fg="gray"> → {upstream}</span> : null}
          </span>
        ) : null}
        <span fg={dirty ? "#fb923c" : "gray"}>{tail}</span>
      </text>
    );
  }
  return <text fg="gray">{truncateToWidth(plain, budget)}</text>;
}
