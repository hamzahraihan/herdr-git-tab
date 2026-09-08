import { describe, expect, it } from "vitest";
import {
  buildBranchHierarchy,
  describeRef,
  renderBranchLine,
} from "../src/branchHierarchy.js";
import { parseHistoryOutput } from "../src/git.js";
import type { Branch, Commit, PR } from "../src/types.js";

const F = String.fromCharCode(0x1f);


function commit(hash: string, parents: string[], subject: string, refs: string[] = []): string {
  return `* ${hash}${F}${hash.slice(0, 7)}${F}ada${F}2026-09-01T10:00:00+00:00${F}${subject}${F}${refs.join(", ")}${F}${parents.join(" ")}`;
}

function parsedCommit(hash: string, parents: string[], subject: string, refs: string[] = []): Commit {
  const [first] = parseHistoryOutput(commit(hash, parents, subject, refs));
  if (!first) throw new Error(`parse failed for ${subject}`);
  return first;
}

function branch(name: string, current: boolean, ahead: number, behind: number): Branch {
  return { name, current, ahead, behind, lastCommit: "" };
}

describe("describeRef", () => {
  it("strips HEAD -> prefix", () => {
    expect(describeRef("HEAD -> main")).toEqual({ label: "main", prNumber: null });
  });

  it("returns plain branch name unchanged", () => {
    expect(describeRef("main")).toEqual({ label: "main", prNumber: null });
  });

  it("extracts PR number from pull/N/head ref", () => {
    expect(describeRef("pull/14/head:luvus/t2")).toEqual({
      label: "luvus/t2",
      prNumber: 14,
    });
  });

  it("preserves remote-tracking labels", () => {
    expect(describeRef("origin/main")).toEqual({ label: "origin/main", prNumber: null });
  });
});

describe("renderBranchLine", () => {
  it("empty commit list yields empty string", () => {
    expect(renderBranchLine([])).toBe("");
  });

  it("single commit yields just a node", () => {
    expect(renderBranchLine(["abc1234"], false)).toBe("●");
  });

  it("two commits with terminal arrow", () => {
    expect(renderBranchLine(["abc1234", "def5678"])).toBe("──●──●──>");
  });

  it("long history emits connectors between every node", () => {
    expect(renderBranchLine(["a", "b", "c"])).toBe("──●──●──●──>");
  });
  it("omits terminal arrow when requested", () => {
    expect(renderBranchLine(["a", "b"], false)).toBe("──●──●");
  });

  it("renders merge commits as diamonds", () => {
    expect(renderBranchLine(["a", "b"], true, new Set(["b"]))).toBe("──●──◆──>");
    expect(renderBranchLine(["a"], false, new Set(["a"]))).toBe("◆");
  });
});
describe("buildBranchHierarchy", () => {
  it("returns empty hierarchy when there are no commits", () => {
    expect(buildBranchHierarchy([], [], [], null)).toEqual({ rows: [], empty: true });
  });

  it("places main as the first row and feature branches beneath", () => {
    const main1 = "a".repeat(40);
    const main2 = "b".repeat(40);
    const main3 = "c".repeat(40);
    const t2_1 = "d".repeat(40);
    const t2_2 = "e".repeat(40);
    const t3_1 = "f".repeat(40);

    const commits: Commit[] = [
      parsedCommit(main1, [main2, t2_1, t3_1], "M1", ["main", "HEAD -> main"]),
      parsedCommit(main2, [main3], "M2", ["main"]),
      parsedCommit(main3, [], "M3", ["main"]),
      parsedCommit(t2_1, [t2_2], "T2-1", ["pull/14/head:luvus/t2"]),
      parsedCommit(t2_2, [], "T2-2", ["luvus/t2"]),
      parsedCommit(t3_1, [], "T3-1", ["luvus/t3"]),
    ];
    const branches: Branch[] = [
      branch("main", true, 0, 0),
      branch("luvus/t2", false, 2, 0),
      branch("luvus/t3", false, 1, 0),
    ];
    const prs: PR[] = [
      { number: 14, title: "t", author: "a", state: "open", checks: "pass", branch: "luvus/t2", url: "" },
    ];

    const { rows, empty } = buildBranchHierarchy(commits, branches, prs, "main");
    expect(empty).toBe(false);
    expect(rows.map((r) => r.name)).toEqual(["main", "luvus/t2", "luvus/t3"]);
    expect(rows[0]!.isMain).toBe(true);
    expect(rows[1]!.isMain).toBe(false);
    expect(rows[1]!.ahead).toBe(2);
    expect(rows[1]!.prNumber).toBe(14);
    expect(rows[2]!.ahead).toBe(1);
    expect(rows[2]!.prNumber).toBe(null);
  });

  it("falls back to master when main is absent", () => {
    const h1 = "a".repeat(40);
    const feat = "b".repeat(40);
    const commits: Commit[] = [
      parsedCommit(h1, [feat], "M1", ["master"]),
      parsedCommit(feat, [], "F1", ["feature/x"]),
    ];
    const branches: Branch[] = [
      branch("master", true, 0, 0),
      branch("feature/x", false, 1, 0),
    ];
    const { rows } = buildBranchHierarchy(commits, branches, [], "master");
    expect(rows[0]!.name).toBe("master");
    expect(rows[0]!.isMain).toBe(true);
    expect(rows[1]!.name).toBe("feature/x");
  });

  it("captures PR number from refs even when PR list lacks matching branch", () => {
    const main1 = "a".repeat(40);
    const feat = "b".repeat(40);
    const commits: Commit[] = [
      parsedCommit(main1, [feat], "M1", ["main"]),
      parsedCommit(feat, [], "F1", ["pull/42/head:feature/y"]),
    ];
    const branches: Branch[] = [
      branch("main", true, 0, 0),
      branch("feature/y", false, 0, 0),
    ];
    const { rows } = buildBranchHierarchy(commits, branches, [], "main");
    const featureRow = rows.find((r) => r.name === "feature/y")!;
    expect(featureRow.prNumber).toBe(42);
  });

  it("assigns commits belonging only to current branch when refs are empty", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const commits: Commit[] = [
      parsedCommit(h1, [h2], "M1", []),
      parsedCommit(h2, [], "M2", []),
    ];
    const branches: Branch[] = [branch("main", true, 0, 0)];
    const { rows } = buildBranchHierarchy(commits, branches, [], "main");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.commits).toEqual(["aaaaaaa", "bbbbbbb"]);
  });

  it("marks commits with multiple parents as merges on their lane", () => {
    const main1 = "a".repeat(40);
    const main2 = "b".repeat(40);
    const feat = "c".repeat(40);
    const commits: Commit[] = [
      parsedCommit(main1, [main2, feat], "Merge feature", ["main"]),
      parsedCommit(main2, [], "M2", ["main"]),
      parsedCommit(feat, [], "F1", ["feature/x"]),
    ];
    const branches: Branch[] = [
      branch("main", true, 0, 0),
      branch("feature/x", false, 1, 0),
    ];
    const { rows } = buildBranchHierarchy(commits, branches, [], "main");
    expect(rows[0]!.merges).toEqual(["aaaaaaa"]);
    expect(rows[1]!.merges).toEqual([]);
  });

  it("defaults rows to unmerged with no trunk target", () => {
    const h1 = "a".repeat(40);
    const commits: Commit[] = [parsedCommit(h1, [], "M1", ["main"])];
    const { rows } = buildBranchHierarchy(commits, [branch("main", true, 0, 0)], [], "main");
    expect(rows[0]!.merged).toBe(false);
    expect(rows[0]!.mergedInto).toBeNull();
  });
});