// `gh` reads and writes. Lists degrade to a banner (`gh` missing or signed out)
// or a subtitle (no GitHub remote) so git panes keep working; details report
// their own error. Detail readers never merge, mark ready, or use a terminal.

import { exec } from "herdr";
import { firstLine, messageOf } from "./format.js";
import { githubRemote, runGit } from "./git.js";

const TIMEOUT = 30000;
const PUSH_TIMEOUT = 120000;
const PR_DETAIL_FIELDS =
  "number,title,author,state,url,body,headRefName,baseRefName,statusCheckRollup,labels,mergeable,mergeStateStatus,reviewDecision,reviews,comments,additions,deletions,changedFiles,commits,isDraft";
const ISSUE_DETAIL_FIELDS = "number,title,author,state,url,body,labels,assignees,blockedBy,comments";


function opts(cwd, on, timeout = TIMEOUT) {
  const options = { cwd, timeout };
  if (on) options.on = on;
  return options;
}

function ghMissing(error) {
  const text = messageOf(error);
  return (
    /cannot start gh/i.test(text) ||
    /ENOENT|program not found|not recognized as an internal|No such file/i.test(text)
  );
}

export async function runGh(cwd, on, args, timeout = TIMEOUT) {
  try {
    return await exec("gh", args, opts(cwd, on, timeout));
  } catch (error) {
    if (ghMissing(error)) throw new Error("GH_UNAVAILABLE: gh not found on PATH");
    throw new Error(firstLine(messageOf(error), "gh could not start"));
  }
}

function ghText(result) {
  return `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`;
}

/** A string when gh is missing/signed out; null for other failures. */
export function ghUnavailable(result) {
  if (!result || result.code === 0) return null;
  const text = ghText(result);
  if (/not logged|not authenticated|gh auth login|no accounts|authentication failed|HTTP 401/i.test(text)) {
    return `GH_UNAVAILABLE: ${firstLine(text, "gh is not signed in")}`;
  }
  if (/command not found|gh: not found/i.test(text)) {
    return `GH_UNAVAILABLE: ${firstLine(text, "gh not found on PATH")}`;
  }
  return null;
}

export function noGithubRemote(result) {
  return /no remotes|not a github|no git remote|doesn't have any remotes/i.test(ghText(result));
}

/** Worst-of mapping: failure > pending > success; no rollup is "—". */
export function mapChecks(rollup) {
  if (!rollup || rollup.length === 0) return "—";
  const values = rollup.map((check) => {
    if (check && typeof check === "object") {
      const state = check.state ?? "";
      const status = check.status ?? "";
      const conclusion = check.conclusion ?? "";
      return `${state} ${status} ${conclusion}`.toLowerCase();
    }
    return String(check ?? "").toLowerCase();
  });
  if (values.some((value) => /failure|fail|error|timed_out|action_required/.test(value))) return "failure";
  if (values.some((value) => /pending|in_progress|queued|waiting|requested|expected|neutral/.test(value))) {
    return "pending";
  }
  return "success";
}

export function parsePRsJson(items) {
  return (items ?? []).map((item) => ({
    number: item.number,
    title: item.title ?? "",
    author: item.author?.login ?? "?",
    state: item.state ?? "",
    checks: mapChecks(item.statusCheckRollup),
    branch: item.headRefName ?? "",
    url: item.url ?? "",
  }));
}

export function parseIssuesJson(items) {
  return (items ?? []).map((item) => ({
    number: item.number,
    title: item.title ?? "",
    author: item.author?.login ?? "?",
    labels: (item.labels ?? []).map((label) => label.name).filter(Boolean),
    state: item.state ?? "",
    blocked: item.blockedBy?.nodes.some((n) => n.state === "OPEN") ?? false,
    url: item.url ?? "",
  }));
}


export function prListArgs(scope) {
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

export function issueListArgs(scope) {
  const base = ["issue", "list", "--limit", "50", "--json", "number,title,author,labels,state,blockedBy,url"];
  return scope === "mine" ? [...base, "--search", "involves:@me"] : base;
}


function parseJson(stdout, what) {
  try {
    return JSON.parse(stdout ?? "");
  } catch {
    throw new Error(`${what}: gh returned invalid JSON`);
  }
}

function listError(result, what) {
  const unavailable = ghUnavailable(result);
  if (unavailable) throw new Error(unavailable);
  if (noGithubRemote(result)) return [];
  throw new Error(firstLine(result.stderr) || firstLine(result.stdout) || `${what} failed`);
}

export async function getPRs(cwd, on, scope = "repo") {
  const result = await runGh(cwd, on, prListArgs(scope));
  if (result.code !== 0) return listError(result, "gh pr list failed");
  const parsed = parseJson(result.stdout, "gh pr list failed");
  return Array.isArray(parsed) ? parsePRsJson(parsed) : [];
}

export async function getIssues(cwd, on, scope = "repo") {
  const result = await runGh(cwd, on, issueListArgs(scope));
  if (result.code !== 0) return listError(result, "gh issue list failed");
  const parsed = parseJson(result.stdout, "gh issue list failed");
  return Array.isArray(parsed) ? parseIssuesJson(parsed) : [];
}

export function parseComments(items) {
  return (items ?? []).map((comment) => ({
    author: comment.author?.login ?? "?",
    body: comment.body ?? "",
    createdAt: comment.createdAt,
  }));
}

export function parseReviews(items) {
  return (items ?? []).map((review) => ({
    author: review.author?.login ?? "?",
    state: review.state ?? "",
    body: review.body,
  }));
}

function commitCount(commits) {
  if (typeof commits === "number") return commits;
  if (Array.isArray(commits)) return commits.length;
  return 0;
}

export function parsePRDetailJson(pr) {
  return {
    number: pr.number,
    title: pr.title ?? "",
    author: pr.author?.login ?? "?",
    state: pr.state ?? "",
    url: pr.url ?? "",
    body: pr.body ?? "",
    headRefName: pr.headRefName ?? "",
    baseRefName: pr.baseRefName ?? "",
    checks: mapChecks(pr.statusCheckRollup),
    labels: (pr.labels ?? []).map((label) => label.name).filter(Boolean),
    mergeable: pr.mergeable ?? "UNKNOWN",
    mergeStateStatus: pr.mergeStateStatus ?? "UNKNOWN",
    reviewDecision: pr.reviewDecision ?? "",
    reviews: parseReviews(pr.reviews),
    comments: parseComments(pr.comments),
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changedFiles ?? 0,
    commits: commitCount(pr.commits),
    isDraft: Boolean(pr.isDraft),
  };
}

export function parseIssueDetailJson(issue) {
  return {
    number: issue.number,
    title: issue.title ?? "",
    author: issue.author?.login ?? "?",
    state: issue.state ?? "",
    blocked: issue.blockedBy?.nodes.some((n) => n.state === "OPEN") ?? false,
    url: issue.url ?? "",
    body: issue.body ?? "",
    labels: (issue.labels ?? []).map((label) => label.name).filter(Boolean),
    assignees: (issue.assignees ?? []).map((person) => person.login).filter(Boolean),
    comments: parseComments(issue.comments),
  };
}


export async function getPRDetail(cwd, on, number) {
  const result = await runGh(cwd, on, ["pr", "view", String(number), "--json", PR_DETAIL_FIELDS]);
  if (result.code !== 0) {
    throw new Error(
      ghUnavailable(result) ||
        firstLine(result.stderr) ||
        firstLine(result.stdout) ||
        `gh pr view ${number} failed`,
    );
  }
  return parsePRDetailJson(parseJson(result.stdout, `gh pr view ${number} failed`));
}

export async function getIssueDetail(cwd, on, number) {
  const result = await runGh(cwd, on, ["issue", "view", String(number), "--json", ISSUE_DETAIL_FIELDS]);
  if (result.code !== 0) {
    throw new Error(
      ghUnavailable(result) ||
        firstLine(result.stderr) ||
        firstLine(result.stdout) ||
        `gh issue view ${number} failed`,
    );
  }
  return parseIssueDetailJson(parseJson(result.stdout, `gh issue view ${number} failed`));
}

export async function checkoutPR(cwd, on, number) {
  const result = await runGh(cwd, on, ["pr", "checkout", String(number)]);
  if (result.code !== 0) throw new Error(firstLine(result.stderr) || `gh pr checkout ${number} failed`);
}

export async function approvePR(cwd, on, number) {
  const result = await runGh(cwd, on, ["pr", "review", String(number), "--approve"]);
  if (result.code !== 0) throw new Error(firstLine(result.stderr) || `gh pr review ${number} failed`);
}

export function openPRWeb(cwd, on, number) {
  runGh(cwd, on, ["pr", "view", String(number), "--web"]).catch(() => {});
}

export function openIssueWeb(cwd, on, number) {
  runGh(cwd, on, ["issue", "view", String(number), "--web"]).catch(() => {});
}

export function hasGithubRemote(cwd, on) {
  return githubRemote(cwd, on).then((remote) => remote !== null);
}

/**
 * Headless `c` from the PR list: a mod pane has no TTY, so gh's prompts cannot
 * be answered. Preflight the states that would only exit 1, push when the
 * branch has no upstream, then create from the commits with `--fill`.
 */
export async function startPRCreate(cwd, on) {
  const branchResult = await runGit(cwd, on, ["branch", "--show-current"]);
  if (branchResult.code !== 0) {
    throw new Error(
      firstLine(branchResult.stderr) || firstLine(branchResult.stdout) || "git branch failed",
    );
  }
  const branch = branchResult.stdout.trim();
  if (!branch) throw new Error("detached HEAD: checkout a branch first, then press c again");

  const remote = await githubRemote(cwd, on);
  if (!remote) throw new Error("no GitHub remote: add one (git remote add origin <url>), then press c again");

  const listed = await runGh(cwd, on, [
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "number",
    "--limit",
    "1",
  ]);
  if (listed.code !== 0) {
    const unavailable = ghUnavailable(listed);
    if (unavailable) throw new Error(unavailable);
    // Any other lookup failure is ignored: create reports the real error.
  } else {
    const parsed = parseJson(listed.stdout, "gh pr list failed");
    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0].number === "number") {
      throw new Error(`PR #${parsed[0].number} already exists for '${branch}' (Enter opens it)`);
    }
  }

  const upstream = await runGit(cwd, on, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (upstream.code !== 0) {
    const pushed = await runGit(cwd, on, ["push", "-u", remote, "HEAD"], PUSH_TIMEOUT);
    if (pushed.code !== 0) {
      throw new Error(
        `${firstLine(pushed.stderr) || firstLine(pushed.stdout) || "git push failed"} — push the branch, then press c again`,
      );
    }
  }

  const created = await runGh(cwd, on, ["pr", "create", "--fill"], PUSH_TIMEOUT);
  if (created.code !== 0) {
    const unavailable = ghUnavailable(created);
    if (unavailable) throw new Error(unavailable);
    throw new Error(
      firstLine(created.stderr) || firstLine(created.stdout) || "gh pr create --fill failed",
    );
  }
  const output = created.stdout.trim();
  const url = /^https?:\/\/\S+/m.exec(output)?.[0];
  return url ?? output;
}
