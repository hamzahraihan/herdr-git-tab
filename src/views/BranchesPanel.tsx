import React, { useRef } from "react";
import type { Branch } from "../types.js";
import { relativeTime } from "../time.js";
import { cellWidth, contentHeight, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";
import { isDoubleClick, scrollDelta, type ClickTracker } from "../doubleClick.js";

export function filterBranches(branches: Branch[], filter: string): Branch[] {
  const q = filter.trim().toLowerCase();
  return q ? branches.filter((b) => b.name.toLowerCase().includes(q)) : branches;
}

export default function BranchesPanel({
  branches,
  selected,
  filter,
  error,
  onSelect,
  onDoubleClick,
}: {
  branches: Branch[];
  selected: number;
  filter: string;
  error?: string;
  onSelect?: (index: number) => void;
  onDoubleClick?: (branch: Branch) => void;
}) {
  if (error) {
    return (
      <box flexDirection="column">
        <text fg="red">{error}</text>
      </box>
    );
  }
  const filtered = filterBranches(branches, filter);
  if (filtered.length === 0) {
    return (
      <box flexDirection="column">
        <text fg="gray">{branches.length === 0 ? "No branches" : "No matches"}</text>
      </box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  const inner = Math.max(20, terminalWidth() - 2);
  const limit = contentHeight();
  const lastClick = useRef<ClickTracker | null>(null);
  const handleRowClick = (i: number, b: Branch): void => {
    onSelect?.(i);
    const now = Date.now();
    if (isDoubleClick(lastClick.current, i, now)) {
      lastClick.current = null;
      onDoubleClick?.(b);
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
      {filtered.slice(0, limit).map((b, i) => {
        const active = i === safe;
        return (
          <box
            key={b.name}
            onMouseDown={() => handleRowClick(i, b)}
            style={{ backgroundColor: active ? SELECTED_BG : undefined }}
          >
            <BranchRow branch={b} active={active} inner={inner} />
          </box>
        );
      })}
    </box>
  );
}

function BranchRow({ branch: b, active, inner }: { branch: Branch; active: boolean; inner: number }) {
  const right = relativeTime(b.lastCommitDate ?? "");
  const syncText = `↑${b.ahead} ↓${b.behind}`;
  const goneText = b.upstream === "gone" ? " [gone]" : "";
  const head = `• ${b.name} ${syncText}  `;
  const msgBudget = Math.max(
    8,
    inner - cellWidth(head) - cellWidth(goneText) - cellWidth(right) - (right ? 2 : 0),
  );
  const msg = truncateToWidth(b.lastCommit, msgBudget);
  const left = `${head}${msg}${goneText}`;
  const gap = right ? Math.max(2, inner - cellWidth(left) - cellWidth(right)) : 0;
  return (
    <text>
      <span fg={b.current ? "yellow" : "gray"}>
        {"• "}
      </span>
      {b.current || active ? (
        <strong fg={b.current ? "green" : "white"}>
          {b.name}{" "}
        </strong>
      ) : (
        <span fg="white">
          {b.name}{" "}
        </span>
      )}
      <span fg="gray">
        {syncText}{"  "}
      </span>
      <span fg="white">{msg}</span>
      {goneText ? <span fg="red">{goneText}</span> : null}
      {right ? (
        <React.Fragment>
          <span>{" ".repeat(gap)}</span>
          <span fg="gray">
            {right}
          </span>
        </React.Fragment>
      ) : null}
    </text>
  );
}
