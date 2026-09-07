// Lane/flow diagram renderer for git history.
// Walks commits in top-down order (newest first), assigning each commit to a
// lane (column), and renders each row as a fixed-width prefix with the commit
// marker and vertical/diagonal lane connectors.
import type { Commit } from "./types.js";

export type LaneRow = {
  prefix: string;
  commit: Commit;
  laneIndex: number;
  laneCount: number;
};

const LANE_WIDTH = 2;

export function buildLaneRows(commits: Commit[]): LaneRow[] {
  if (commits.length === 0) return [];
  const laneOf: Record<string, number> = {};
  let laneCount = 1;
  const rows: LaneRow[] = [];

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const existing = laneOf[c.hash];
    const lane = existing !== undefined ? existing : 0;
    laneOf[c.hash] = lane;

    // First parent stays in this row's lane so the vertical line continues
    // downward. Additional parents get a fresh lane each so branches fork
    // visually to the right.
    const [first, ...rest] = c.parents;
    if (first !== undefined) {
      if (laneOf[first] === undefined) {
        laneOf[first] = lane;
      }
    }
    for (const p of rest) {
      if (laneOf[p] === undefined) {
        laneOf[p] = laneCount;
        laneCount++;
      }
    }

    rows.push({ prefix: "", commit: c, laneIndex: lane, laneCount });
  }

  // Second pass: render each row's prefix using the final lane assignments
  // plus a "lane continues?" check based on the next row.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const width = r.laneCount * LANE_WIDTH;
    const cells: string[] = new Array(width).fill(" ");
    cells[r.laneIndex * LANE_WIDTH] = "●";
    cells[r.laneIndex * LANE_WIDTH + 1] = " ";

    // Vertical bars: every lane that is occupied by some other commit (not
    // this one) AND whose commit also appears in the next row shows a bar.
    const next = i + 1 < rows.length ? rows[i + 1].commit : null;
    const nextHashes = next ? new Set([next.hash, ...next.parents]) : new Set<string>();
    for (let l = 0; l < r.laneCount; l++) {
      if (l === r.laneIndex) continue;
      const occupant = occupantAt(l, laneOf);
      if (occupant && nextHashes.has(occupant)) {
        cells[l * LANE_WIDTH] = "│";
        cells[l * LANE_WIDTH + 1] = " ";
      }
    }
    r.prefix = cells.join("");
  }
  return rows;
}

function occupantAt(lane: number, laneOf: Record<string, number>): string | undefined {
  for (const [h, l] of Object.entries(laneOf)) {
    if (l === lane) return h;
  }
  return undefined;
}

export function renderFlowGraph(rows: LaneRow[], maxPrefixWidth = 32): string[] {
  return rows.map((r) => {
    const prefix = r.prefix.padEnd(maxPrefixWidth, " ").slice(0, maxPrefixWidth);
    const refs = r.commit.refs.length > 0 ? ` (${r.commit.refs.join(", ")})` : "";
    return `${prefix} ${r.commit.shortHash} ${r.commit.subject}${refs}`;
  });
}
