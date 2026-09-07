import { describe, expect, it } from "vitest";
import { buildArrowGraph } from "../src/arrowGraph.js";
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

describe("buildArrowGraph", () => {
  it("linear history: each row has lane 0", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2]), commit(h2, [h3]), commit(h3, [])].join("\n"),
    );
    const rows = buildArrowGraph(cs);
    expect(rows.map((r) => r.laneIndex)).toEqual([0, 0, 0]);
  });

  it("forks a new lane for additional parents", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const h3 = "c".repeat(40);
    const h4 = "d".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2, h3]), commit(h2, [h4]), commit(h3, [h4]), commit(h4, [])].join("\n"),
    );
    const rows = buildArrowGraph(cs);
    expect(rows[0].laneIndex).toBe(0);
    expect(rows[0].laneCount).toBe(2);
    expect(rows[1].laneIndex).toBe(0);
    expect(rows[2].laneIndex).toBe(1);
  });

  it("first commit uses ● marker, others use *", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const cs = parseHistoryOutput(
      [commit(h1, [h2]), commit(h2, [])].join("\n"),
    );
    const rows = buildArrowGraph(cs);
    expect(rows[0].prefix.startsWith("●")).toBe(true);
    expect(rows[1].prefix.startsWith("*")).toBe(true);
  });
});
