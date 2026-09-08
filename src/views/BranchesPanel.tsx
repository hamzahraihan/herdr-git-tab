import React from "react";
import { Box, Text } from "ink";
import type { Branch } from "../types.js";
import { relativeTime } from "../time.js";
import { cellWidth, terminalWidth, truncateToWidth } from "../width.js";
import { SELECTED_BG } from "../theme.js";

export function filterBranches(branches: Branch[], filter: string): Branch[] {
  const q = filter.trim().toLowerCase();
  return q ? branches.filter((b) => b.name.toLowerCase().includes(q)) : branches;
}

export default function BranchesPanel({
  branches,
  selected,
  filter,
  error,
}: {
  branches: Branch[];
  selected: number;
  filter: string;
  error?: string;
}) {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }
  const filtered = filterBranches(branches, filter);
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray">{branches.length === 0 ? "No branches" : "No matches"}</Text>
      </Box>
    );
  }
  const safe = Math.min(selected, filtered.length - 1);
  // Content box already spends paddingX=1 on each side, so rows budget
  // `width - 2` cells to stay exactly one visual row (see width.ts).
  const inner = Math.max(20, terminalWidth() - 2);
  return (
    <Box flexDirection="column">
      {filtered.slice(0, 30).map((b, i) => (
        <BranchRow key={b.name} branch={b} active={i === safe} inner={inner} />
      ))}
    </Box>
  );
}

function BranchRow({ branch: b, active, inner }: { branch: Branch; active: boolean; inner: number }) {
  const right = relativeTime(b.lastCommitDate ?? "");
  // Sync badges always render (zeros dimmed) so columns align like the reference.
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
    <Text backgroundColor={active ? SELECTED_BG : undefined}>
      <Text color={b.current ? "yellow" : "gray"} dimColor={!b.current}>
        {"• "}
      </Text>
      <Text bold={b.current || active} color={b.current ? "green" : "white"}>
        {b.name}{" "}
      </Text>
      <Text color="gray" dimColor>
        {syncText}{"  "}
      </Text>
      <Text color="white">{msg}</Text>
      {goneText ? <Text color="red">{goneText}</Text> : null}
      {right ? (
        <React.Fragment>
          <Text>{" ".repeat(gap)}</Text>
          <Text color="gray" dimColor>
            {right}
          </Text>
        </React.Fragment>
      ) : null}
    </Text>
  );
}
