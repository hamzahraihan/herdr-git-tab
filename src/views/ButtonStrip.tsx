import React from "react";
import { Box, Text } from "ink";

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
  return (
    <Box>
      {PANE_BUTTONS.map((b) => (
        <Box key={b.id} marginRight={1}>
          <Text
            color={active === b.id ? "cyan" : "gray"}
            inverse={active === b.id}
            bold={active === b.id}
          >
            {`[${b.label} ${b.title}]`}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
