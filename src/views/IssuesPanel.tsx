import React, { useRef } from "react";
import type { Issue } from "../types.js";
import { contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";

export function filterIssues(issues: Issue[], query: string): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;
  return issues.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.author.toLowerCase().includes(q) ||
      String(i.number).includes(q),
  );
}

function statusLabel(state: string): { label: string; color: string } {
  if (state === "OPEN") return { label: "Open", color: "green" };
  if (state === "CLOSED") return { label: "Closed", color: "red" };
  return { label: state, color: "yellow" };
}

export default function IssuesPanel({
  issues,
  selected,
  query,
  ghError,
  noRemote,
  error,
  onSelect,
  onDoubleClick,
}: {
  issues: Issue[];
  selected: number;
  query: string;
  ghError?: string;
  noRemote?: boolean;
  error?: string;
  onSelect?: (index: number) => void;
  onDoubleClick?: (issue: Issue) => void;
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
  const filtered = filterIssues(issues, query);
  if (filtered.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">{noRemote ? "(no GitHub remote)" : "No issues"}</text>
      </box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  const width = terminalWidth();
  const limit = Math.max(4, Math.floor(contentHeight() / 3));
  const lastClick = useRef<ClickTracker | null>(null);
  const handleRowClick = (idx: number, iss: Issue): void => {
    onSelect?.(idx);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, idx, now)) {
      lastClick.current = null;
      onDoubleClick?.(iss);
    } else {
      lastClick.current = { index: idx, at: now };
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
      {filtered.slice(0, limit).map((iss, idx) => {
        const active = idx === safe;
        const status = statusLabel(iss.state);
        const labels = iss.labels.length > 0 ? iss.labels.map((l) => `[${l}]`).join(" ") : "";
        return (
          <box
            key={iss.number}
            flexDirection="column"
            marginBottom={1}
            onMouseDown={() => handleRowClick(idx, iss)}
            style={{ backgroundColor: active ? SELECTED_BG : undefined }}
          >
            <box>
              <text>
                <strong fg={active ? "white" : undefined}>
                  {truncateToWidth(`#${iss.number} ${iss.title}`, width)}
                </strong>
              </text>
            </box>
            <box>
              <text>
                <span fg={status.color}>[{status.label}]</span>
                {labels ? (
                  <span fg="gray"> {truncateToWidth(labels, Math.max(8, width - 24))}</span>
                ) : null}
                <span fg="gray"> · {iss.author}</span>
              </text>
            </box>
          </box>
        );
      })}
    </box>
  );
}