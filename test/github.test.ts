import type { ExecException } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIssues,
  getPRs,
  mapChecks,
  parseIssuesJson,
  parsePRsJson,
} from "../src/github.js";

type ExecArgs = [string, string[], { cwd: string; timeout: number }];
type ExecResult = { stdout: string; stderr: string };
type ExecFileFn = (...args: ExecArgs) => Promise<ExecResult>;

const state: {
  log: Array<{ cmd: string; args: string[]; cwd: string }>;
  next: { ok: true; data: ExecResult } | { ok: false; err: ExecException };
} = {
  log: [],
  next: { ok: true, data: { stdout: "", stderr: "" } },
};

vi.mock("node:child_process", () => ({
  execFile: (file: string, args: string[], opts: { cwd: string; timeout: number }) => {
    state.log.push({ cmd: file, args, cwd: opts.cwd });
    if (state.next.ok) return Promise.resolve(state.next.data);
    return Promise.reject(state.next.err);
  },
}));
vi.mock("node:util", () => ({
  promisify: <T extends (...a: never[]) => unknown>(fn: T): T => fn,
}));

beforeEach(() => {
  state.log.length = 0;
  state.next = { ok: true, data: { stdout: "", stderr: "" } };
});

describe("mapChecks", () => {
  it("failure wins over success and pending", () => {
    expect(
      mapChecks([
        { status: "COMPLETED", conclusion: "SUCCESS" },
        { status: "IN_PROGRESS", conclusion: "" },
        { status: "COMPLETED", conclusion: "FAILURE" },
      ]),
    ).toBe("failure");
  });

  it("pending beats success; empty rollup is —", () => {
    expect(mapChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("success");
    expect(mapChecks([{ status: "IN_PROGRESS", conclusion: "" }])).toBe("pending");
    expect(mapChecks([])).toBe("—");
    expect(mapChecks(undefined)).toBe("—");
  });
});

describe("parsePRsJson / parseIssuesJson", () => {
  it("maps PR rollup worst-of per row", () => {
    const prs = parsePRsJson([
      {
        number: 1,
        title: "a",
        author: { login: "x" },
        state: "OPEN",
        statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }],
        headRefName: "feat",
        url: "u",
      },
      {
        number: 2,
        title: "b",
        author: { login: "y" },
        state: "OPEN",
        statusCheckRollup: [],
        headRefName: "feat2",
        url: "u2",
      },
    ]);
    expect(prs.map((p) => p.checks)).toEqual(["failure", "—"]);
  });

  it("maps issue labels stringified", () => {
    const issues = parseIssuesJson([
      {
        number: 1,
        title: "t",
        author: { login: "x" },
        labels: [{ name: "bug" }, { name: "p1" }],
        state: "OPEN",
        url: "u",
      },
    ]);
    expect(issues[0].labels).toEqual(["bug", "p1"]);
  });
});

describe("getPRs / getIssues error classification", () => {
  it("throws GH_UNAVAILABLE on auth stderr", async () => {
    state.next = {
      ok: false,
      err: Object.assign(new Error("Command failed"), {
        stderr: "not logged into any GitHub hosts\n",
      }),
    };
    await expect(getPRs("C:/repo")).rejects.toThrow(/^GH_UNAVAILABLE/);
    await expect(getIssues("C:/repo")).rejects.toThrow(/^GH_UNAVAILABLE/);
  });

  it("returns [] when stderr indicates no remote", async () => {
    state.next = {
      ok: false,
      err: Object.assign(new Error("Command failed"), { stderr: "no remotes found\n" }),
    };
    await expect(getPRs("C:/repo")).resolves.toEqual([]);
    await expect(getIssues("C:/repo")).resolves.toEqual([]);
  });

  it("throws GH_UNAVAILABLE on ENOENT (gh not on PATH)", async () => {
    state.next = {
      ok: false,
      err: Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
    };
    await expect(getPRs("C:/repo")).rejects.toThrow(/^GH_UNAVAILABLE/);
  });

  it("parses success JSON end-to-end and forwards cwd", async () => {
    state.next = {
      ok: true,
      data: {
        stdout: JSON.stringify([
          {
            number: 9,
            title: "clean",
            author: { login: "ada" },
            state: "OPEN",
            statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
            headRefName: "feat",
            url: "https://github.com/x/y/pull/9",
          },
        ]),
        stderr: "",
      },
    };
    const prs = await getPRs("C:/repo");
    expect(prs[0]).toMatchObject({ number: 9, checks: "success", author: "ada" });
    expect(state.log[0]).toMatchObject({ cmd: "gh", cwd: "C:/repo" });
  });
});
