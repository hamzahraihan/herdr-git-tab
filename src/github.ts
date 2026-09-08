import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  DetailComment,
  DetailReview,
  Issue,
  IssueDetail,
  PR,
  PRDetail,
  Scope,
} from "./types.js";

const execFileAsync = promisify(execFile);
const TIMEOUT = 15000;

function errText(e: unknown): string {
  const err = e as { stderr?: unknown; message?: string };
  if (typeof err?.stderr === "string" && err.stderr.length > 0) return err.stderr;
  if (Buffer.isBuffer(err?.stderr)) return String(err.stderr);
  return err?.message ?? String(e);
}

function toUnavailable(e: unknown): Error | null {
  const err = e as { code?: unknown };
  if (err?.code === "ENOENT") return new Error("GH_UNAVAILABLE: gh not found on PATH");
  const text = errText(e);
  if (/not (logged|authenticated)/i.test(text)) {
    return new Error(`GH_UNAVAILABLE: ${text.trim().split("\n")[0]}`);
  }
  if (/command not found/i.test(text)) return new Error(`GH_UNAVAILABLE: ${text.trim().split("\n")[0]}`);
  return null;
}

function isNoRemote(text: string): boolean {
  return /no remotes|not a github/i.test(text);
}

type PRJson = {
  number: number;
  title: string;
  author: { login: string };
  state: string;
  statusCheckRollup?: Array<{ status?: string; conclusion?: string; state?: string }>;
  headRefName: string;
  url: string;
};

type IssueJson = {
  number: number;
  title: string;
  author: { login: string };
  labels: Array<{ name: string }>;
  state: string;
  url: string;
};

/** Worst-of mapping: failure > pending > success; empty → "—". */
export function mapChecks(rollup: PRJson["statusCheckRollup"]): string {
  if (!rollup || rollup.length === 0) return "—";
  const vals = rollup.map((c) => `${c.status ?? ""} ${c.conclusion ?? ""} ${c.state ?? ""}`.toLowerCase());
  if (vals.some((v) => /failure|fail|error|timed_out|action_required/.test(v))) return "failure";
  if (
    vals.some((v) => /pending|in_progress|queued|waiting|requested|expected|neutral/.test(v))
  )
    return "pending";
  return "success";
}

export function parsePRsJson(items: PRJson[]): PR[] {
  return items.map((p) => ({
    number: p.number,
    title: p.title,
    author: p.author?.login ?? "?",
    state: p.state,
    checks: mapChecks(p.statusCheckRollup),
    branch: p.headRefName,
    url: p.url,
  }));
}

export function parseIssuesJson(items: IssueJson[]): Issue[] {
  return items.map((i) => ({
    number: i.number,
    title: i.title,
    author: i.author?.login ?? "?",
    labels: (i.labels ?? []).map((l) => l.name),
    state: i.state,
    url: i.url,
  }));
}

/** `m` toggles list scope: this repo vs everything involving you. */
export function prListArgs(scope: Scope): string[] {
  const base = [
    "pr",
    "list",
    "--limit",
    "50",
    "--json",
    "number,title,author,state,statusCheckRollup,headRefName,url",
  ];
  return scope === "mine" ? [...base, "--search", "involves:@me"] : base;
}

/** Same scope toggle for issues. */
export function issueListArgs(scope: Scope): string[] {
  const base = [
    "issue",
    "list",
    "--limit",
    "50",
    "--json",
    "number,title,author,labels,state,url",
  ];
  return scope === "mine" ? [...base, "--search", "involves:@me"] : base;
}

export async function getPRs(repo: string, scope: Scope = "repo"): Promise<PR[]> {
  try {
    const { stdout } = await execFileAsync("gh", prListArgs(scope), {
      cwd: repo,
      timeout: TIMEOUT,
    });
    return parsePRsJson(JSON.parse(stdout) as PRJson[]);
  } catch (e) {
    const unavail = toUnavailable(e);
    if (unavail) throw unavail;
    const text = errText(e);
    if (isNoRemote(text)) return [];
    throw new Error(text.trim().split("\n")[0] ?? "gh pr list failed");
  }
}

export async function getIssues(repo: string, scope: Scope = "repo"): Promise<Issue[]> {
  try {
    const { stdout } = await execFileAsync("gh", issueListArgs(scope), {
      cwd: repo,
      timeout: TIMEOUT,
    });
    return parseIssuesJson(JSON.parse(stdout) as IssueJson[]);
  } catch (e) {
    const unavail = toUnavailable(e);
    if (unavail) throw unavail;
    const text = errText(e);
    if (isNoRemote(text)) return [];
    throw new Error(text.trim().split("\n")[0] ?? "gh issue list failed");
  }
}

// --- Detail reader -------------------------------------------------------

type CommentJson = {
  author?: { login?: string };
  body?: string;
  createdAt?: string;
};

type ReviewJson = {
  author?: { login?: string };
  state?: string;
  body?: string;
};

type PRDetailJson = {
  number: number;
  title: string;
  author?: { login?: string };
  state: string;
  url: string;
  body?: string;
  headRefName?: string;
  baseRefName?: string;
  statusCheckRollup?: PRJson["statusCheckRollup"];
  labels?: Array<{ name: string }>;
  mergeable?: string;
  mergeStateStatus?: string;
  reviewDecision?: string;
  reviews?: ReviewJson[];
  comments?: CommentJson[];
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commits?: unknown;
  isDraft?: boolean;
};

type IssueDetailJson = {
  number: number;
  title: string;
  author?: { login?: string };
  state: string;
  url: string;
  body?: string;
  labels?: Array<{ name: string }>;
  assignees?: Array<{ login?: string }>;
  comments?: CommentJson[];
};

export const PR_DETAIL_FIELDS =
  "number,title,author,state,url,body,headRefName,baseRefName,statusCheckRollup,labels,mergeable,mergeStateStatus,reviewDecision,reviews,comments,additions,deletions,changedFiles,commits,isDraft";

export const ISSUE_DETAIL_FIELDS =
  "number,title,author,state,url,body,labels,assignees,comments";

function parseComments(items: CommentJson[] | undefined): DetailComment[] {
  return (items ?? []).map((c) => ({
    author: c.author?.login ?? "?",
    body: c.body ?? "",
    createdAt: c.createdAt,
  }));
}

function parseReviews(items: ReviewJson[] | undefined): DetailReview[] {
  return (items ?? []).map((r) => ({
    author: r.author?.login ?? "?",
    state: r.state ?? "",
    body: r.body,
  }));
}

function commitCount(commits: unknown): number {
  if (typeof commits === "number") return commits;
  if (Array.isArray(commits)) return commits.length;
  return 0;
}

export function parsePRDetailJson(p: PRDetailJson): PRDetail {
  return {
    number: p.number,
    title: p.title ?? "",
    author: p.author?.login ?? "?",
    state: p.state ?? "",
    url: p.url ?? "",
    body: p.body ?? "",
    headRefName: p.headRefName ?? "",
    baseRefName: p.baseRefName ?? "",
    checks: mapChecks(p.statusCheckRollup),
    labels: (p.labels ?? []).map((l) => l.name),
    mergeable: p.mergeable ?? "UNKNOWN",
    mergeStateStatus: p.mergeStateStatus ?? "UNKNOWN",
    reviewDecision: p.reviewDecision ?? "",
    reviews: parseReviews(p.reviews),
    comments: parseComments(p.comments),
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    changedFiles: p.changedFiles ?? 0,
    commits: commitCount(p.commits),
    isDraft: p.isDraft ?? false,
  };
}

export function parseIssueDetailJson(i: IssueDetailJson): IssueDetail {
  return {
    number: i.number,
    title: i.title ?? "",
    author: i.author?.login ?? "?",
    state: i.state ?? "",
    url: i.url ?? "",
    body: i.body ?? "",
    labels: (i.labels ?? []).map((l) => l.name),
    assignees: (i.assignees ?? []).map((a) => a.login ?? "?").filter((s) => s.length > 0),
    comments: parseComments(i.comments),
  };
}

function detailError(e: unknown, what: string): Error {
  const unavail = toUnavailable(e);
  if (unavail) return unavail;
  const text = errText(e);
  return new Error(text.trim().split("\n")[0] ?? what);
}

export async function getPRDetail(repo: string, number: number): Promise<PRDetail> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "view", String(number), "--json", PR_DETAIL_FIELDS],
      { cwd: repo, timeout: TIMEOUT },
    );
    return parsePRDetailJson(JSON.parse(stdout) as PRDetailJson);
  } catch (e) {
    throw detailError(e, `gh pr view ${number} failed`);
  }
}

export async function getIssueDetail(repo: string, number: number): Promise<IssueDetail> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["issue", "view", String(number), "--json", ISSUE_DETAIL_FIELDS],
      { cwd: repo, timeout: TIMEOUT },
    );
    return parseIssueDetailJson(JSON.parse(stdout) as IssueDetailJson);
  } catch (e) {
    throw detailError(e, `gh issue view ${number} failed`);
  }
}

// --- Detail actions ------------------------------------------------------
// Detail panels stay read-approve-checkout-open only: no merge, ready, or
// terminal diff commands are launched from PR detail.

export async function checkoutPR(repo: string, number: number): Promise<void> {
  try {
    await execFileAsync("gh", ["pr", "checkout", String(number)], {
      cwd: repo,
      timeout: TIMEOUT,
    });
  } catch (e) {
    throw detailError(e, `gh pr checkout ${number} failed`);
  }
}

export async function approvePR(repo: string, number: number): Promise<void> {
  try {
    await execFileAsync("gh", ["pr", "review", String(number), "--approve"], {
      cwd: repo,
      timeout: TIMEOUT,
    });
  } catch (e) {
    throw detailError(e, `gh pr review ${number} failed`);
  }
}

/** Fire-and-forget browser open for PR detail (`o`). */
export function openPRWeb(repo: string, number: number): void {
  execFileAsync("gh", ["pr", "view", "--web", String(number)], { cwd: repo }).catch(() => {});
}

/** Fire-and-forget browser open for issues. */
export function openIssueWeb(repo: string, number: number): void {
  execFileAsync("gh", ["issue", "view", "--web", String(number)], { cwd: repo }).catch(() => {});
}

/** Start `gh pr create` for the PR list (`c`). Interactive: inherits the
 *  terminal so prompts render; resolves on exit, rejects on failure. */
export function startPRCreate(repo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["pr", "create"], {
      cwd: repo,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gh pr create exited with code ${code ?? "?"}`));
    });
  });
}

/** True when the repo has a github.com remote. Best-effort: errors mean false. */
export async function hasGithubRemote(repo: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "-v"], {
      cwd: repo,
      timeout: TIMEOUT,
    });
    return stdout
      .split("\n")
      .some((line) => line.includes("github.com") || line.startsWith("git@github"));
  } catch {
    return false;
  }
}
