import React, { useRef } from "react";
import type { PR } from "../types.js";
import { contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";

export function filterPRs(prs: PR[], query: string): PR[] {
  const q = query.trim().toLowerCase();
  if (!q) return prs;
  return prs.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      String(p.number).includes(q),
  );
}

function statusTag(checks: string): { label: string; color: string } {
  if (checks === "failure") return { label: "Changes Requested", color: "red" };
  if (checks === "pending") return { label: "Pending", color: "yellow" };
  if (checks === "success") return { label: "Approved", color: "green" };
  return { label: "—", color: "gray" };
}

export default function PRsPanel({
  prs,
  selected,
  query,
  ghError,
  noRemote,
  error,
  onSelect,
  onDoubleClick,
}: {
  prs: PR[];
  selected: number;
  query: string;
  ghError?: string;
  noRemote?: boolean;
  error?: string;
  onSelect?: (index: number) => void;
  onDoubleClick?: (pr: PR) => void;
}) {
  if (error) {
    return (
      <box flexDirection="column">
        <text fg="red">{error}</text>
      </box>
    );
  }
  if (ghError) {
    return (
      <box flexDirection="column">
        <text fg="yellow">gh unavailable</text>
        <text fg="gray">{ghError}</text>
      </box>
    );
  }
  const filtered = filterPRs(prs, query);
  if (filtered.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">{noRemote ? "(no GitHub remote)" : "No PRs"}</text>
      </box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  const width = terminalWidth();
  const limit = Math.max(5, Math.floor(contentHeight() / 2));
  const lastClick = useRef<ClickTracker | null>(null);
  const handleRowClick = (i: number, p: PR): void => {
    onSelect?.(i);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, i, now)) {
      lastClick.current = null;
      onDoubleClick?.(p);
    } else {
      lastClick.current = { index: i, at: now };
    }
  };
  return (
    <box
      flexDirection="column"
      onMouseScroll={(e) => {
        const d = scrollDelta(e);
        if (d !== 0) onSelect?.(Math.max(0, Math.min(selected + d, Math.max(0, filtered.length - 1))));
      }}
    >
      {filtered.slice(0, limit).map((p, i) => {
        const active = i === safe;
        const status = statusTag(p.checks);
        return (
          <box
            key={p.number}
            flexDirection="column"
            onMouseDown={() => handleRowClick(i, p)}
            style={{ backgroundColor: active ? SELECTED_BG : undefined }}
          >
            <text>
              <strong fg={active ? "white" : undefined}>
                {truncateToWidth(`#${p.number} ${p.title} · ${p.branch} → main`, width)}
              </strong>
            </text>
            <text>
              {"  "}
              <span fg={status.color}>[{status.label}]</span>
              <span fg="gray"> · {truncateToWidth(p.author, Math.max(8, width - 24))}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}