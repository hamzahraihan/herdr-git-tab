import { describe, expect, it } from "vitest";
import {
  issueListArgs,
  parseIssueDetailJson,
  parsePRDetailJson,
  prListArgs,
} from "../src/github.js";
import { statusPaths } from "../src/git.js";
import { DETAIL_WIDE_MIN, detailColumns, isWideLayout } from "../src/width.js";
import { buildPRDiscussionLines, buildPRRailLines } from "../src/views/PRDetail.js";
import { buildIssueDiscussionLines, buildIssueRailLines } from "../src/views/IssueDetail.js";

describe("scope toggle", () => {
  it("lists this repo by default, involves:@me for my work", () => {
    expect(prListArgs("repo")).not.toContain("involves:@me");
    expect(prListArgs("mine")).toContain("involves:@me");
    expect(issueListArgs("repo")).not.toContain("involves:@me");
    expect(issueListArgs("mine")).toContain("involves:@me");
  });
});

describe("parsePRDetailJson", () => {
  it("maps body, branches, labels, mergeability, stats, discussion", () => {
    const d = parsePRDetailJson({
      number: 12,
      title: "Add thing",
      author: { login: "ada" },
      state: "OPEN",
      url: "https://github.com/x/y/pull/12",
      body: "hello",
      headRefName: "feat",
      baseRefName: "main",
      statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
      labels: [{ name: "bug" }],
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      reviews: [{ author: { login: "bob" }, state: "APPROVED", body: "lgtm" }],
      comments: [{ author: { login: "cat" }, body: "nice", createdAt: "2026-01-01T00:00:00Z" }],
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      commits: [{}, {}, {}],
      isDraft: false,
    });
    expect(d.checks).toBe("success");
    expect(d.commits).toBe(3);
    expect(d.labels).toEqual(["bug"]);
    expect(d.comments[0]).toMatchObject({ author: "cat" });
    expect(d.reviews[0]).toMatchObject({ author: "bob", state: "APPROVED" });
  });

  it("defaults missing detail fields", () => {
    const d = parsePRDetailJson({ number: 1, title: "t", state: "OPEN", url: "u" });
    expect(d.body).toBe("");
    expect(d.checks).toBe("—");
    expect(d.mergeable).toBe("UNKNOWN");
  });
});

describe("parseIssueDetailJson", () => {
  it("maps labels, assignees, comments", () => {
    const d = parseIssueDetailJson({
      number: 7,
      title: "broken",
      author: { login: "ada" },
      state: "OPEN",
      url: "https://github.com/x/y/issues/7",
      body: "details",
      labels: [{ name: "bug" }],
      assignees: [{ login: "bob" }],
      comments: [{ author: { login: "cat" }, body: "repro" }],
    });
    expect(d.labels).toEqual(["bug"]);
    expect(d.assignees).toEqual(["bob"]);
    expect(d.comments).toHaveLength(1);
  });
});

describe("detail layout", () => {
  it("splits wide terminals into discussion + rail", () => {
    expect(isWideLayout(DETAIL_WIDE_MIN)).toBe(true);
    expect(isWideLayout(DETAIL_WIDE_MIN - 1)).toBe(false);
    const cols = detailColumns(120);
    expect(cols.discussion).toBeGreaterThan(cols.rail);
    expect(cols.discussion + cols.rail).toBeLessThanOrEqual(120);
  });
});

describe("statusPaths", () => {
  it("orders staged, unstaged, untracked without duplicates", () => {
    const paths = statusPaths({
      branch: "main",
      ahead: 0,
      behind: 0,
      staged: [{ path: "a", staged: "M", unstaged: " " }],
      unstaged: [
        { path: "a", staged: "M", unstaged: "M" },
        { path: "b", staged: " ", unstaged: "M" },
      ],
      untracked: ["c"],
    });
    expect(paths.map((p) => p.path)).toEqual(["a", "b", "c"]);
    expect(paths[0]?.kind).toBe("staged");
  });
});

describe("detail text builders", () => {
  it("PR rail keeps branches, checks, reviews, labels, mergeability, stats visible", () => {
    const rail = buildPRRailLines({
      number: 12,
      title: "t",
      author: "ada",
      state: "OPEN",
      url: "u",
      body: "",
      headRefName: "feat",
      baseRefName: "main",
      checks: "success",
      labels: ["bug"],
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      reviews: [{ author: "bob", state: "APPROVED" }],
      comments: [],
      additions: 10,
      deletions: 2,
      changedFiles: 1,
      commits: 2,
      isDraft: false,
    });
    const text = rail.join("\n");
    expect(text).toMatch(/feat.*main/);
    expect(text).toMatch(/success/);
    expect(text).toMatch(/bob/);
    expect(text).toMatch(/bug/);
    expect(text).toMatch(/MERGEABLE/);
    expect(text).toMatch(/\+10/);
  });

  it("PR discussion includes body and comments", () => {
    const lines = buildPRDiscussionLines({
      number: 12,
      title: "Add thing",
      author: "ada",
      state: "OPEN",
      url: "u",
      body: "hello",
      headRefName: "feat",
      baseRefName: "main",
      checks: "—",
      labels: [],
      mergeable: "UNKNOWN",
      mergeStateStatus: "UNKNOWN",
      reviewDecision: "",
      reviews: [],
      comments: [{ author: "cat", body: "nice" }],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commits: 0,
      isDraft: false,
    });
    expect(lines.join("\n")).toMatch(/hello/);
    expect(lines.join("\n")).toMatch(/cat/);
  });

  it("issue rail shows state, labels, assignees, comment count", () => {
    const rail = buildIssueRailLines({
      number: 7,
      title: "t",
      author: "ada",
      state: "OPEN",
      url: "u",
      body: "",
      labels: ["bug"],
      assignees: ["bob"],
      comments: [{ author: "cat", body: "hi" }],
    });
    const text = rail.join("\n");
    expect(text).toMatch(/OPEN/);
    expect(text).toMatch(/bug/);
    expect(text).toMatch(/bob/);
    expect(text).toMatch(/comments: 1/);
  });

  it("issue discussion keeps only recent comments", () => {
    const comments = Array.from({ length: 15 }, (_, i) => ({
      author: `u${i}`,
      body: `c${i}`,
    }));
    const lines = buildIssueDiscussionLines({
      number: 7,
      title: "t",
      author: "ada",
      state: "OPEN",
      url: "u",
      body: "desc",
      labels: [],
      assignees: [],
      comments,
    });
    const text = lines.join("\n");
    expect(text).toMatch(/desc/);
    expect(text).toMatch(/Comments \(15\)/);
    expect(text).not.toMatch(/u0 commented/);
    expect(text).toMatch(/u14 commented/);
  });
});
