import React from "react";
import { Text } from "ink";

export type ButtonDef = { id: number; label: string; title: string };

export const PANE_BUTTONS: ButtonDef[] = [
  { id: 1, label: "1", title: "History" },
  { id: 2, label: "2", title: "Graph" },
  { id: 3, label: "3", title: "Branches" },
  { id: 4, label: "4", title: "PRs" },
  { id: 5, label: "5", title: "Issues" },
  { id: 6, label: "6", title: "Status" },
];

export default function ButtonStrip({ active }: { active: number }) {
  const current = PANE_BUTTONS.find((b) => b.id === active) ?? PANE_BUTTONS[0];
  return (
    <Text color="cyan" bold inverse>
      {`[${current.label} ${current.title}]`}
    </Text>
  );
}
