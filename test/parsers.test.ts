import { describe, expect, it } from "vitest";
import {
  humanizeSpan,
  normalizeRemoteUrl,
  parseBranchesOutput,
  parseHistoryOutput,
  parseMergedBranches,
  parseShortlog,
  parseStatusOutput,
} from "../src/git.js";

const F = "";

describe("parseHistoryOutput", () => {
  it("preserves --graph glyphs and parses fields", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const stdout = [
      `* ${h1}${F}9f2c3a1${F}Ada${F}2026-09-01T10:00:00+00:00${F}seed commit${F}HEAD -> main${F}`,
      `| * ${h2}${F}77aa00f${F}Bo${F}2026-09-02T11:00:00+00:00${F}wip work${F}origin/feature${F}`,
    ].join("\n");
    const commits = parseHistoryOutput(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0].graph).toBe("* ");
    expect(commits[0].shortHash).toBe("9f2c3a1");
    expect(commits[0].author).toBe("Ada");
    expect(commits[0].subject).toBe("seed commit");
    expect(commits[0].refs).toEqual(["HEAD -> main"]);
    expect(commits[0].parents).toEqual([]);
    expect(commits[1].graph).toBe("| * ");
    expect(commits[1].refs).toEqual(["origin/feature"]);
  });

  it("extracts parents array", () => {
    const h1 = "a".repeat(40);
    const h2 = "b".repeat(40);
    const stdout = [
      `* ${h1}${F}9f2c3a1${F}Ada${F}2026-09-01T10:00:00+00:00${F}merge${F}HEAD -> main${F}${h2}`,
    ].join("\n");
    const commits = parseHistoryOutput(stdout);
    expect(commits[0].parents).toEqual([h2]);
  });

  it("returns [] for empty log output", () => {
    expect(parseHistoryOutput("")).toEqual([]);
  });
});

describe("parseStatusOutput", () => {
  it("parses branch, ahead/behind, staged/unstaged/untracked counts", () => {
    const stdout = [
      "## main...origin/main [ahead 2, behind 1]",
      "M  staged-modified.txt",
      " M unstaged-modified.txt",
      "MM both.txt",
      "A  added.txt",
      "R  old.txt -> new.txt",
      "?? untracked.txt",
    ].join("\n");
    const st = parseStatusOutput(stdout);
    expect(st.branch).toBe("main");
    expect(st.ahead).toBe(2);
    expect(st.behind).toBe(1);
    expect(st.staged.map((f) => f.path).sort()).toEqual(
      ["added.txt", "both.txt", "new.txt", "staged-modified.txt"].sort(),
    );
    expect(st.unstaged.map((f) => f.path).sort()).toEqual(
      ["both.txt", "unstaged-modified.txt"].sort(),
    );
    expect(st.untracked).toEqual(["untracked.txt"]);
  });

  it("handles a bare branch header with no tracking", () => {
    const st = parseStatusOutput("## master");
    expect(st.branch).toBe("master");
    expect(st.ahead).toBe(0);
    expect(st.staged).toEqual([]);
  });
});

describe("parseBranchesOutput", () => {
  it("parses current, upstream, ahead/behind, gone", () => {
    const stdout = [
      "* main abc1234 [origin/main: ahead 2, behind 1] last msg main",
      "  feature def5678 [origin/feature: gone] last msg feature",
      "  plain aaa1111 last msg plain",
    ].join("\n");
    const branches = parseBranchesOutput(stdout, "main");
    expect(branches).toHaveLength(3);
    expect(branches[0]).toMatchObject({
      name: "main",
      current: true,
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
    });
    expect(branches[1]).toMatchObject({ name: "feature", current: false, upstream: "gone" });
    expect(branches[2]).toMatchObject({ name: "plain", upstream: undefined });
  });

  it("detached HEAD yields a single (detached) row", () => {
    expect(parseBranchesOutput("* (HEAD detached) abc1234 msg", "HEAD")).toEqual([
      { name: "(detached)", current: true, ahead: 0, behind: 0, lastCommit: "" },
    ]);
  });
});

describe("parseMergedBranches", () => {
  it("returns trimmed names, dropping empties, arrows, and HEAD pointers", () => {
    const stdout = ["  main", "  feature/x", "", "origin/HEAD", "  origin/feature/y  "].join("\n");
    expect(parseMergedBranches(stdout)).toEqual(["main", "feature/x", "origin/feature/y"]);
  });

  it("drops symref arrows", () => {
    expect(parseMergedBranches("foo -> bar\nmain\n")).toEqual(["main"]);
  });
});

describe("parseShortlog", () => {
  it("parses count-name rows in order", () => {
    expect(parseShortlog("    46\tRizRiyz\n     1\tbot\n")).toEqual([
      { name: "RizRiyz", count: 46 },
      { name: "bot", count: 1 },
    ]);
  });

  it("skips blank and malformed lines", () => {
    expect(parseShortlog("\nno-count-here\n  3\t  spaced out  \n")).toEqual([
      { name: "spaced out", count: 3 },
    ]);
  });
});

describe("normalizeRemoteUrl", () => {
  it("strips protocol and .git from https remotes", () => {
    expect(normalizeRemoteUrl("https://github.com/RizRiyz/luvus.git")).toBe(
      "github.com/RizRiyz/luvus",
    );
  });

  it("converts ssh remotes to host/path form", () => {
    expect(normalizeRemoteUrl("git@github.com:RizRiyz/luvus.git")).toBe("github.com/RizRiyz/luvus");
  });

  it("passes plain host/path through", () => {
    expect(normalizeRemoteUrl("github.com/RizRiyz/luvus")).toBe("github.com/RizRiyz/luvus");
  });
});

describe("humanizeSpan", () => {
  it("humanizes day, week, month, and year spans", () => {
    expect(humanizeSpan("2026-08-01T00:00:00Z", "2026-08-01T12:00:00Z")).toBe("today");
    expect(humanizeSpan("2026-08-01T00:00:00Z", "2026-08-04T00:00:00Z")).toBe("3 days");
    expect(humanizeSpan("2026-07-04T00:00:00Z", "2026-08-01T00:00:00Z")).toBe("4 weeks");
    expect(humanizeSpan("2026-01-01T00:00:00Z", "2026-08-01T00:00:00Z")).toBe("7 months");
    expect(humanizeSpan("2024-08-01T00:00:00Z", "2026-08-01T00:00:00Z")).toBe("2 years");
  });

  it("returns null for missing or invalid ends", () => {
    expect(humanizeSpan(null, "2026-08-01T00:00:00Z")).toBeNull();
    expect(humanizeSpan("nope", "2026-08-01T00:00:00Z")).toBeNull();
  });
});
