// Arrow-style flow graph. Walks commits top-down and renders a vertical tree
// with box-drawing lines: ─ horizontal connectors, │ vertical lanes, ┴/┬/├
// branch junctions, ─→ arrow at the head, backslash style forks for child
// branches. Each row's prefix encodes the topology relative to the previous
// commit in the same lane.
import type { Commit } from "./types.js";

export type ArrowRow = {
  prefix: string;
  commit: Commit;
  laneIndex: number;
  laneCount: number;
};

const LANE_WIDTH = 2;

export function buildArrowGraph(commits: Commit[]): ArrowRow[] {
  if (commits.length === 0) return [];
  const laneOf: Record<string, number> = {};
  let laneCount = 1;
  const rows: ArrowRow[] = [];

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const existing = laneOf[c.hash];
    const lane = existing !== undefined ? existing : 0;
    laneOf[c.hash] = lane;

    const [first, ...rest] = c.parents;
    if (first !== undefined && laneOf[first] === undefined) {
      laneOf[first] = lane;
    }
    for (const p of rest) {
      if (laneOf[p] === undefined) {
        laneOf[p] = laneCount;
        laneCount++;
      }
    }

    rows.push({ prefix: "", commit: c, laneIndex: lane, laneCount });
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells: string[] = new Array(r.laneCount * LANE_WIDTH).fill(" ");
    const pos = r.laneIndex * LANE_WIDTH;

    // Commit marker
    cells[pos] = i === 0 ? "●" : "*";
    cells[pos + 1] = i === 0 ? "─" : " ";

    // Vertical bars: lanes that continue into the next row
    const next = i + 1 < rows.length ? rows[i + 1] : null;
    if (next) {
      for (let l = 0; l < r.laneCount; l++) {
        if (l === r.laneIndex) continue;
        if (cells[l * LANE_WIDTH] !== " ") continue;
        const occupant = occupantAt(l, laneOf);
        if (occupant && next.commit.hash !== occupant) {
          // Lane continues with this commit below (not the same as this row's commit)
          cells[l * LANE_WIDTH] = "│";
        }
      }
    }

    // Branch labels: when this commit has multiple parents, draw the fork
    const rest = r.commit.parents.slice(1);
    if (rest.length > 0) {
      // After the marker, extend the row to show the rightward fork
      const labelCol = pos + 2;
      if (cells[labelCol] === " ") {
        cells[labelCol] = "─";
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
