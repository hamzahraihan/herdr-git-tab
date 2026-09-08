import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
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

/** First non-empty line of git/gh output: the actionable part, without the
 *  usage dump that follows. Falls back when there is nothing to show. */
function firstLine(text: string, fallback: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? fallback;
}

function spawnExitCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const code: unknown = e.code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function spawnGhError(e: unknown): Error {
  if (spawnExitCode(e) === "ENOENT") return new Error("GH_UNAVAILABLE: gh not found on PATH");
  return new Error(e instanceof Error ? e.message : String(e));
}

function gitUnavailable(e: unknown): Error | null {
  return spawnExitCode(e) === "ENOENT"
    ? new Error("GIT_UNAVAILABLE: git not found on PATH")
    : null;
}

/** Name of the remote pointing at github.com, or null when there is none. */
async function githubRemoteName(repo: string): Promise<string | null> {
  const { stdout } = await execFileAsync("git", ["remote", "-v"], {
    cwd: repo,
    timeout: TIMEOUT,
  });
  for (const line of stdout.split("\n")) {
    if (!line.includes("github.com")) continue;
    const name = line.split(/\s+/)[0];
    if (name) return name;
  }
  return null;
}

/** Fast fail on the states where `gh pr create` can only exit 1, so the
 *  footer says why instead of `exited with code 1`. */
async function prCreatePreflight(repo: string): Promise<{ remote: string }> {
  let branch = "";
  try {
    const out = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: repo,
      timeout: TIMEOUT,
    });
    branch = out.stdout.trim();
  } catch (e) {
    throw gitUnavailable(e) ?? new Error(firstLine(errText(e), "git branch --show-current failed"));
  }
  if (!branch) throw new Error("detached HEAD: checkout a branch first, then press c again");
  let remote: string | null = null;
  try {
    remote = await githubRemoteName(repo);
  } catch (e) {
    throw gitUnavailable(e) ?? new Error(firstLine(errText(e), "git remote -v failed"));
  }
  if (!remote)
    throw new Error("no GitHub remote: add one (git remote add origin <url>), then press c again");
  // Best-effort: an open PR for this branch means create would fail. Any
  // lookup failure is ignored — create itself reports the real error.
  let existing: number | undefined;
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "list", "--head", branch, "--state", "open", "--json", "number", "--limit", "1"],
      { cwd: repo, timeout: TIMEOUT },
    );
    const parsed: unknown = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      const first: unknown = parsed[0];
      if (first !== null && typeof first === "object" && "number" in first) {
        const num: unknown = first.number;
        existing = typeof num === "number" ? num : undefined;
      }
    }
  } catch {
    existing = undefined;
  }
  if (existing !== undefined)
    throw new Error(`PR #${existing} already exists for '${branch}' (Enter opens it)`);
  return { remote };
}

/** Terminal path: prompts render, stdin answers. stderr is piped (not
 *  inherited) so gh's reason survives Ink's repaint on failure. */
function runInteractivePRCreate(repo: string): Promise<string> {
  // Executor form: Node ≥ 20 baseline has no Promise.withResolvers (ES2024/Node 22+).
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn("gh", ["pr", "create"], {
        cwd: repo,
        stdio: ["inherit", "inherit", "pipe"],
      });
    } catch (e) {
      reject(spawnGhError(e));
      return;
    }
    let settled = false;
    let stderr = "";
    child.stderr?.on("data", (d: unknown) => {
      stderr += typeof d === "string" ? d : String(d);
    });
    child.on("error", (e: unknown) => {
      if (settled) return;
      settled = true;
      reject(spawnGhError(e));
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve("");
      else if (stderr.trim()) reject(new Error(firstLine(stderr, "gh pr create failed")));
      else if (signal) reject(new Error(`gh pr create killed by ${signal}`));
      else reject(new Error(`gh pr create exited with code ${code ?? "?"}`));
    });
  });
}

/** Herdr-pane path: stdin is a pipe, so gh's prompts can never be answered.
 *  Push the branch when it has no upstream, then create non-interactively
 *  from the commits. Resolves with the new PR URL. */
async function runHeadlessPRCreate(repo: string, remote: string): Promise<string> {
  let hasUpstream = true;
  try {
    await execFileAsync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
      cwd: repo,
      timeout: TIMEOUT,
    });
  } catch {
    hasUpstream = false;
  }
  if (!hasUpstream) {
    try {
      await execFileAsync("git", ["push", "-u", remote, "HEAD"], {
        cwd: repo,
        timeout: TIMEOUT,
        // Fail fast instead of hanging on a credential prompt no one can answer.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (e) {
      throw (
        gitUnavailable(e) ??
        new Error(`${firstLine(errText(e), "git push failed")} — push the branch, then press c again`)
      );
    }
  }
  try {
    const { stdout } = await execFileAsync("gh", ["pr", "create", "--fill"], {
      cwd: repo,
      timeout: TIMEOUT,
    });
    return stdout.trim();
  } catch (e) {
    throw toUnavailable(e) ?? new Error(firstLine(errText(e), "gh pr create --fill failed"));
  }
}

/** Start `gh pr create` for the PR list (`c`). Terminal stdin (a TTY) keeps
 *  the interactive prompts; piped stdin (Herdr pane) pushes the branch when
 *  needed and creates with `gh pr create --fill` instead, since prompts
 *  there always fail. Resolves with the new PR URL ("" when the interactive
 *  run already printed it); rejects with gh's own message. */
export async function startPRCreate(
  repo: string,
  opts?: { interactive?: boolean },
): Promise<string> {
  const { remote } = await prCreatePreflight(repo);
  const interactive = opts?.interactive ?? process.stdin.isTTY === true;
  if (interactive) return runInteractivePRCreate(repo);
  return runHeadlessPRCreate(repo, remote);
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
