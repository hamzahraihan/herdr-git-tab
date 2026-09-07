import React from "react";
import { Box, Text } from "ink";

export type TabDef = { id: number; label: string };

export const TABS: TabDef[] = [
  { id: 1, label: "Commits" },
  { id: 2, label: "Flow" },
  { id: 3, label: "Branches" },
  { id: 4, label: "PRs" },
  { id: 5, label: "Issues" },
  { id: 6, label: "Status" },
];

export default function TabBar({ active }: { active: number }) {
  return (
    <Box>
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Box key={t.id} marginRight={1}>
            <Text
              color={isActive ? "white" : "gray"}
              backgroundColor={isActive ? "gray" : undefined}
              bold={isActive}
              dimColor={!isActive}
            >
              {`  ${t.label}  `}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
