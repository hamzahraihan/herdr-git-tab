import React from "react";
import { Box, Text } from "ink";
import type { Branch, Commit, PR } from "../types.js";
import { buildArrowGraph, ArrowRow } from "../arrowGraph.js";
import { filterCommits } from "./HistoryPanel.js";

function prNumberForRef(refs: string[]): number | null {
  for (const r of refs) {
    const m = /pull\/(\d+)\//.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
}

function prForBranch(branchName: string, prs: PR[]): PR | undefined {
  return prs.find((p) => p.branch === branchName);
}

function aheadBehind(branchName: string, branches: Branch[]): { ahead: number; behind: number } {
  const b = branches.find((x) => x.name === branchName);
  return { ahead: b?.ahead ?? 0, behind: b?.behind ?? 0 };
}

function describeRef(ref: string): { label: string; prNumber: number | null } {
  const m = /pull\/(\d+)\/head/.exec(ref);
  if (m) return { label: ref.replace(`pull/${m[1]}/head:`, "").trim(), prNumber: Number(m[1]) };
  return { label: ref, prNumber: null };
}

export default function FlowPanel({
  commits,
  branches,
  prs,
  selected,
  query,
}: {
  commits: Commit[];
  branches: Branch[];
  prs: PR[];
  selected: number;
  query: string;
}) {
  const filtered = filterCommits(commits, query);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{commits.length === 0 ? "No commits yet" : "No matches"}</Text>
      </Box>
    );
  }
  const rows = buildArrowGraph(filtered);
  const safe = Math.min(selected, rows.length - 1);
  const start = Math.max(0, Math.min(safe - 8, rows.length - 30));
  const visible = rows.slice(start, start + 30);
  return (
    <Box flexDirection="column">
      {visible.map((r, i) => {
        const idx = start + i;
        return <FlowRow key={r.commit.hash} row={r} branches={branches} prs={prs} active={idx === safe} />;
      })}
    </Box>
  );
}

function FlowRow({
  row,
  branches,
  prs,
  active,
}: {
  row: ArrowRow;
  branches: Branch[];
  prs: PR[];
  active: boolean;
}) {
  const labels: string[] = [];
  for (const ref of row.commit.refs) {
    const { label, prNumber } = describeRef(ref);
    const { ahead, behind } = aheadBehind(label, branches);
    const aheadTag = ahead > 0 ? ` ↑${ahead}` : "";
    const behindTag = behind > 0 ? ` ↓${behind}` : "";
    const prTag = prNumber !== null ? ` PR#${prNumber}` : "";
    const prBadge = prTag ? "" : "";
    const prObj = prForBranch(label, prs);
    const prObjTag = prObj ? ` PR#${prObj.number}` : "";
    labels.push(`${label}${aheadTag}${behindTag}${prTag}${prObjTag}${prBadge}`);
  }
  const labelStr = labels.length > 0 ? `  ${labels.join(" · ")}` : "";
  return (
    <Text color={active ? "white" : undefined} inverse={active}>
      {row.prefix}
      {row.commit.shortHash}
      {labelStr}
    </Text>
  );
}
