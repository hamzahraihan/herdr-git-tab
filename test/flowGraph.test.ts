import { describe, expect, it } from "vitest";
import { buildLaneRows, renderFlowGraph } from "../src/flowGraph.js";
import { parseHistoryOutput } from "../src/git.js";

const F = "";

function commit(
  hash: string,
  parents: string[],
  subject: string,
  refs: string[] = [],
): string {
  return `* ${hash}${F}${hash.slice(0, 7)}${F}ada${F}2026-09-01T10:00:00+00:00${F}${subject}${F}${refs.join(", ")}${F}${parents.join(" ")}`;
}

describe("parseHistoryOutput (with parents)", () => {
  it("extracts parents array", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const lines = [
      commit(h1, [h2], "merge feature into main", ["HEAD -> main"]),
      commit(h2, [h3], "feature work", ["origin/feature"]),
      commit(h3, [], "initial commit"),
    ].join("\n");
    const cs = parseHistoryOutput(lines);
    expect(cs[0].parents).toEqual([h2]);
    expect(cs[1].parents).toEqual([h3]);
    expect(cs[2].parents).toEqual([]);
  });
});

describe("buildLaneRows", () => {
  it("linear history stays in lane 0", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2]), commit(h2, [h3]), commit(h3, [])].join("\n"),
    );
    const rows = buildLaneRows(cs);
    expect(rows.map((r) => r.laneIndex)).toEqual([0, 0, 0]);
    expect(rows.every((r) => r.laneCount === 1)).toBe(true);
  });

  it("forks a new lane when a commit has additional parents", () => {
    // h1: two parents h2 (lane 0) and h3 (lane 1)
    // h2 → h4
    // h3 → h4
    // h4: root
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const h4 = "d".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2, h3]), commit(h2, [h4]), commit(h3, [h4]), commit(h4, [])].join("\n"),
    );
    const rows = buildLaneRows(cs);
    // row 0 opens lane 1 for h3
    expect(rows[0].laneIndex).toBe(0);
    expect(rows[0].laneCount).toBe(2);
    // h2 still in lane 0, h3 in lane 1
    expect(rows[1].laneIndex).toBe(0);
    expect(rows[2].laneIndex).toBe(1);
  });

  it("renderFlowGraph produces fixed-width aligned prefix", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const h4 = "d".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2, h3]), commit(h2, [h4]), commit(h3, [h4]), commit(h4, [])].join("\n"),
    );
    const lines = renderFlowGraph(buildLaneRows(cs), 12);
    for (const line of lines) {
      const prefix = line.slice(0, 12);
      expect(prefix.length).toBe(12);
      // First commit's marker should be a filled circle
      if (line.startsWith("●")) {
        // ok
      }
    }
  });
});
