import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Issue, PR } from "./types.js";

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

export async function getPRs(repo: string): Promise<PR[]> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "list", "--limit", "50", "--json", "number,title,author,state,statusCheckRollup,headRefName,url"],
      { cwd: repo, timeout: TIMEOUT },
    );
    return parsePRsJson(JSON.parse(stdout) as PRJson[]);
  } catch (e) {
    const unavail = toUnavailable(e);
    if (unavail) throw unavail;
    const text = errText(e);
    if (isNoRemote(text)) return [];
    throw new Error(text.trim().split("\n")[0] ?? "gh pr list failed");
  }
}

export async function getIssues(repo: string): Promise<Issue[]> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["issue", "list", "--limit", "50", "--json", "number,title,author,labels,state,url"],
      { cwd: repo, timeout: TIMEOUT },
    );
    return parseIssuesJson(JSON.parse(stdout) as IssueJson[]);
  } catch (e) {
    const unavail = toUnavailable(e);
    if (unavail) throw unavail;
    const text = errText(e);
    if (isNoRemote(text)) return [];
    throw new Error(text.trim().split("\n")[0] ?? "gh issue list failed");
  }
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
