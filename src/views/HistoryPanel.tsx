import React, { useRef } from "react";
import type { Commit } from "../types.js";
import { relativeTime } from "../time.js";
import { SELECTED_BG } from "../theme.js";
import { cellWidth, contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";

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
  limit: number = contentHeight(),
): { rows: Commit[]; start: number; safe: number } {
  const filtered = filterCommits(commits, query);
  const safe = Math.min(selected, filtered.length - 1);
  const start = Math.max(0, Math.min(safe - 8, filtered.length - limit));
  return { rows: filtered.slice(start, start + limit), start, safe };
}

export default function HistoryPanel({
  commits,
  selected,
  query,
  onSelect,
  onDoubleClick,
}: {
  commits: Commit[];
  selected: number;
  query: string;
  onSelect?: (index: number) => void;
  onDoubleClick?: (commit: Commit) => void;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</text>
      </box>
    );
  }
  const { rows, start, safe } = historyVisibleRows(commits, query, selected);
  const inner = Math.max(20, terminalWidth() - 2);
  const lastClick = useRef<ClickTracker | null>(null);
  const handleRowClick = (idx: number): void => {
    onSelect?.(idx);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, idx, now)) {
      lastClick.current = null;
      const item = filterCommits(commits, query)[idx];
      if (item) onDoubleClick?.(item);
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
      {rows.map((c, i) => {
        const idx = start + i;
        const active = idx === safe;
        return (
          <box
            key={c.hash}
            onMouseDown={() => handleRowClick(idx)}
            style={{ backgroundColor: active ? SELECTED_BG : undefined }}
          >
            <CommitRow commit={c} active={active} inner={inner} />
          </box>
        );
      })}
    </box>
  );
}

function CommitRow({ commit: c, active, inner }: { commit: Commit; active: boolean; inner: number }) {
  const rel = relativeTime(c.date);
  const right = c.author ? `${c.author} · ${rel}` : rel;
  const refsSuffix = c.refs.length > 0 ? ` ${c.refs.join(" ")}` : "";
  const prefix = `• ${c.shortHash} `;
  const subjectBudget = Math.max(
    8,
    inner - cellWidth(prefix) - cellWidth(refsSuffix) - cellWidth(right) - 2,
  );
  const subject = truncateToWidth(c.subject, subjectBudget);
  const left = `${prefix}${subject}${refsSuffix}`;
  const gap = Math.max(2, inner - cellWidth(left) - cellWidth(right));
  return (
    <text>
      <span fg="yellow">• </span>
      <span fg="gray">{c.shortHash} </span>
      <strong fg="white">
        {subject}
      </strong>
      {refsSuffix ? <span fg="yellow">{refsSuffix}</span> : null}
      <span>{" ".repeat(gap)}</span>
      <span fg="gray">
        {right}
      </span>
    </text>
  );
}
