// Git reads for the panel. Every command runs through the app's exec, so it
// works on the focused space's machine, using that machine's real environment.

import { exec } from "herdr";
import { firstLine, messageOf, normalizeRemoteUrl, humanizeSpan } from "./format.js";
import { parseHeatmapOutput } from "./heatmap.js";

const TIMEOUT = 30000;
const LIMIT = 100;
const HEATMAP_LIMIT = 10000;
const FIELD = "\x1f";

// These reads write nothing under .git (no index refresh, lock, or fsmonitor
// cookie), so a folder watch showing the working tree does not re-trigger itself.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];

const HEAD_FORMAT = "%h%x1f%an%x1f%cI%x1f%s";

function execOptions(cwd, on, timeout) {
  const options = { cwd };
  if (on) options.on = on;
  if (timeout) options.timeout = timeout;
  return options;
}

function missing(command, error) {
  const text = messageOf(error);
  return (
    new RegExp(`cannot start ${command}`, "i").test(text) ||
    /ENOENT|program not found|not recognized as an internal|No such file/i.test(text)
  );
}

function failure(result, fallback) {
  return firstLine(result.stderr) || firstLine(result.stdout) || fallback;
}

function isNotRepo(result) {
  return /not a git repository/i.test(`${result.stderr}\n${result.stdout}`);
}

function noCommits(result) {
  return /does not have any commits|not have any commits|bad default revision|unknown revision|ambiguous argument '(HEAD|main|master)'|Needed a single revision|bad revision/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
}

export async function runGit(cwd, on, args, timeout = TIMEOUT) {
  try {
    return await exec("git", args, execOptions(cwd, on, timeout));
  } catch (error) {
    if (missing("git", error)) throw new Error("GIT_UNAVAILABLE: git not found on PATH");
    throw new Error(firstLine(messageOf(error), "git could not start"));
  }
}

export function readGit(cwd, on, args, timeout = TIMEOUT) {
  return runGit(cwd, on, [...READ, ...args], timeout);
}

export function isGitUnavailable(error) {
  return /GIT_UNAVAILABLE/.test(messageOf(error));
}

export async function gitTop(cwd, on) {
  const result = await runGit(cwd, on, ["rev-parse", "--show-toplevel"]);
  if (result.code === 0) return result.stdout.trim().replace(/\r$/, "");
  if (isNotRepo(result)) return null;
  throw new Error(failure(result, "git rev-parse --show-toplevel failed"));
}

export function parseHistoryLine(line) {
  const match = /[0-9a-f]{40}/.exec(line);
  if (!match) return null;
  const graph = line.slice(0, match.index);
  const fields = line.slice(match.index).split(FIELD);
  if (fields.length < 7) return null;
  const hash = fields[0];
  const shortHash = fields[1];
  const author = fields[2];
  const date = fields[3];
  const subject = fields[4];
  const refsRaw = fields[5];
  const parentsRaw = fields[6];
  return {
    hash,
    shortHash,
    author,
    date,
    subject,
    refs: refsRaw.trim()
      ? refsRaw
          .split(",")
          .map((ref) => ref.trim())
          .filter(Boolean)
      : [],
    graph,
    parents: parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : [],
  };
}

export function parseHistoryOutput(stdout) {
  const commits = [];
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    const commit = parseHistoryLine(line);
    if (commit) commits.push(commit);
  }
  return commits;
}

export async function getHistory(cwd, on, limit = LIMIT) {
  const result = await readGit(cwd, on, [
    "log",
    "--graph",
    `--pretty=format:%H${FIELD}%h${FIELD}%an${FIELD}%cI${FIELD}%s${FIELD}%D${FIELD}%P`,
    "--all",
    "-n",
    String(limit),
    "--",
  ]);
  if (result.code === 0) return parseHistoryOutput(result.stdout);
  if (noCommits(result)) return [];
  if (isNotRepo(result)) throw new Error("NOT_A_GIT_REPO");
  throw new Error(failure(result, "git log failed"));
}

export function parseBranchesOutput(stdout, headRef) {
  if (String(headRef ?? "").trim() === "HEAD") {
    return [
      {
        name: "(detached)",
        current: true,
        ahead: 0,
        behind: 0,
        lastCommit: "",
        lastCommitDate: undefined,
      },
    ];
  }
  const branches = [];
  for (const raw of String(stdout ?? "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const match = /^([*+ ]?)\s*(\S+)\s+([0-9a-f]+)\s*(?:\[([^\]]+)\])?\s*(.*)$/.exec(line);
    if (!match) continue;
    const index = match[1] ?? "";
    const name = match[2];
    const bracket = match[3] ?? "";
    const message = (match[4] ?? "").trim();
    let upstream;
    let ahead = 0;
    let behind = 0;
    if (bracket) {
      if (/\bgone\b/i.test(bracket)) {
        upstream = "gone";
      } else {
        const parts = bracket.split(": ");
        upstream = parts[0].trim() || undefined;
        const rest = parts.slice(1).join(": ");
        const aheadMatch = /ahead (\d+)/.exec(rest || bracket);
        const behindMatch = /behind (\d+)/.exec(rest || bracket);
        if (aheadMatch) ahead = Number(aheadMatch[1]);
        if (behindMatch) behind = Number(behindMatch[1]);
      }
    }
    branches.push({
      name,
      current: index === "*",
      upstream,
      ahead,
      behind,
      lastCommit: message,
      lastCommitDate: undefined,
    });
  }
  return branches;
}

export async function getBranches(cwd, on) {
  const head = await runGit(cwd, on, ["rev-parse", "--abbrev-ref", "HEAD"]);
  let headRef = "";
  if (head.code === 0) {
    headRef = head.stdout.trim();
  } else if (isNotRepo(head)) {
    throw new Error("NOT_A_GIT_REPO");
  } else if (!noCommits(head)) {
    throw new Error(failure(head, "git rev-parse failed"));
  }

  if (headRef === "HEAD") {
    const result = await readGit(cwd, on, ["log", "-1", `--format=${HEAD_FORMAT}`, "HEAD", "--"]);
    const tip = result.code === 0 ? parseTipLine(result.stdout) : { subject: "" };
    return [
      {
        name: "(detached)",
        current: true,
        ahead: 0,
        behind: 0,
        lastCommit: tip.subject,
        lastCommitDate: tip.date,
      },
    ];
  }

  const result = await readGit(cwd, on, ["branch", "-vv", "--all", "--no-color"]);
  if (result.code !== 0) {
    if (noCommits(result)) return [];
    if (isNotRepo(result)) throw new Error("NOT_A_GIT_REPO");
    throw new Error(failure(result, "git branch failed"));
  }
  const branches = parseBranchesOutput(result.stdout, headRef);
  const dates = await branchDates(cwd, on);
  for (const branch of branches) {
    const tip = dates.get(branch.name);
    if (!tip) continue;
    if (tip.subject) branch.lastCommit = tip.subject;
    if (tip.date) branch.lastCommitDate = tip.date;
  }
  return branches;
}

export function parseTipLine(stdout) {
  const first = String(stdout ?? "").split("\n")[0] ?? "";
  const parts = first.split(FIELD);
  const date = (parts[2] ?? "").trim();
  return { subject: (parts[3] ?? "").trim(), date: date || undefined };
}

async function branchDates(cwd, on) {
  const result = await readGit(cwd, on, [
    "for-each-ref",
    `--format=%(refname:short)${FIELD}%(committerdate:iso8601)${FIELD}%(subject)`,
    "refs/heads",
    "refs/remotes",
  ]).catch(() => null);
  const dates = new Map();
  if (!result || result.code !== 0) return dates;
  for (const line of result.stdout.split("\n")) {
    const [name, date, ...subjectParts] = line.split(FIELD);
    if (!name) continue;
    dates.set(name, { date: date.trim() || undefined, subject: subjectParts.join(FIELD).trim() });
  }
  return dates;
}

export function parseMergedBranches(stdout) {
  return String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(" -> ") && !line.endsWith("/HEAD"));
}

export async function getMergedBranches(cwd, on, trunk) {
  if (!trunk) return [];
  const result = await readGit(cwd, on, [
    "branch",
    "--all",
    "--merged",
    trunk,
    "--format=%(refname:short)",
  ]);
  return result.code === 0 ? parseMergedBranches(result.stdout) : [];
}

export function parseStatusOutput(stdout) {
  const text = String(stdout ?? "");
  const nul = text.includes("\0");
  const records = nul
    ? text.split("\0").filter((record) => record.length > 0)
    : text.split("\n").filter((record) => record.length > 0);
  const header = (records.shift() ?? "").replace(/^##\s*/, "");
  const status = { branch: header, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] };

  const bracket = /\[([^\]]+)\]/.exec(header)?.[1] ?? "";
  const ahead = /ahead (\d+)/.exec(bracket);
  const behind = /behind (\d+)/.exec(bracket);
  if (ahead) status.ahead = Number(ahead[1]);
  if (behind) status.behind = Number(behind[1]);

  let branch = header.split("...")[0].trim();
  if (branch.startsWith("No commits yet on ")) branch = branch.slice("No commits yet on ".length);
  else if (branch.startsWith("Initial commit on ")) branch = branch.slice("Initial commit on ".length);
  status.branch = branch || header;

  let skipOldPath = false;
  for (const record of records) {
    if (skipOldPath) {
      skipOldPath = false;
      continue;
    }
    if (record.length < 4) continue;
    const x = record[0];
    const y = record[1];
    let path = record.slice(3);
    if (!nul && path.includes(" -> ")) path = path.split(" -> ").pop();
    if (x === "?" && y === "?") {
      status.untracked.push(path);
      continue;
    }
    if (nul && (x === "R" || y === "R" || x === "C" || y === "C")) skipOldPath = true;
    if (x !== " " && x !== "?" && x !== "!") status.staged.push({ path, staged: x, unstaged: y });
    if (y !== " " && y !== "?" && y !== "!") status.unstaged.push({ path, staged: x, unstaged: y });
  }
  return status;
}

export async function getStatus(cwd, on) {
  const result = await readGit(cwd, on, [
    "status",
    "--porcelain=v1",
    "-b",
    "-z",
    "--untracked-files=normal",
  ]);
  if (result.code === 0) return parseStatusOutput(result.stdout);
  if (isNotRepo(result)) throw new Error("NOT_A_GIT_REPO");
  throw new Error(failure(result, "git status failed"));
}

export async function checkoutBranch(cwd, on, name) {
  const result = await runGit(cwd, on, ["checkout", name, "--"]);
  if (result.code !== 0) throw new Error(failure(result, `git checkout ${name} failed`));
}

export function parseShortlog(stdout) {
  const authors = [];
  for (const raw of String(stdout ?? "").split("\n")) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(raw);
    if (!match) continue;
    const count = Number(match[1]);
    const name = match[2].trim();
    if (name.length > 0 && Number.isFinite(count)) authors.push({ name, count });
  }
  return authors;
}

async function safeRead(cwd, on, args, timeout) {
  const result = await readGit(cwd, on, args, timeout).catch(() => null);
  return result && result.code === 0 ? result.stdout : null;
}

export async function getRepoStats(cwd, on) {
  const stats = { remote: null, total: 0, oldest: null, newest: null, authors: [] };
  const [remote, total, newest, roots, shortlog] = await Promise.all([
    safeRead(cwd, on, ["remote", "get-url", "origin"]),
    safeRead(cwd, on, ["rev-list", "--count", "--all"]),
    safeRead(cwd, on, ["log", "-1", "--format=%cI", "--all", "--"]),
    safeRead(cwd, on, ["rev-list", "--all", "--timestamp", "--max-parents=0", "--"]),
    safeRead(cwd, on, ["shortlog", "-s", "-n", "--all"]),
  ]);
  if (remote?.trim()) stats.remote = normalizeRemoteUrl(remote.trim());
  if (total && Number.isFinite(Number(total.trim()))) stats.total = Number(total.trim());
  if (newest?.trim()) stats.newest = newest.trim();
  let oldestEpoch = Infinity;
  for (const line of (roots ?? "").split("\n")) {
    const epoch = Number((line.trim().split(/\s+/, 1)[0] ?? "").trim());
    if (Number.isFinite(epoch) && epoch > 0 && epoch < oldestEpoch) oldestEpoch = epoch;
  }
  if (oldestEpoch !== Infinity) stats.oldest = new Date(oldestEpoch * 1000).toISOString();
  stats.authors = parseShortlog(shortlog ?? "");
  return stats;
}

export function spanLabel(stats) {
  return humanizeSpan(stats?.oldest ?? null, stats?.newest ?? null);
}

export async function getBranchDiff(cwd, on, branch) {
  const [log, stat] = await Promise.all([
    safeRead(cwd, on, ["log", "--oneline", "-20", branch, "--"]),
    safeRead(cwd, on, ["diff", "--stat", `${branch}@{u}...${branch}`]),
  ]);
  const upstream = (stat ?? "").trim();
  const fallback = upstream
    ? ""
    : ((await safeRead(cwd, on, ["diff", "--stat", "HEAD"])) ?? "").trim();
  const lines = [`$ git log --oneline -20 ${branch}`, (log ?? "").trim() || "(no commits)"];
  const statText = upstream || fallback;
  if (statText) lines.push("", "$ git diff --stat", statText);
  return lines.join("\n");
}

export async function getFileDiff(cwd, on, path, limit = 100) {
  const result = await readGit(cwd, on, ["diff", "HEAD", "--", path]);
  if (result.code !== 0) throw new Error(failure(result, `git diff ${path} failed`));
  const output = result.stdout.trim();
  if (!output) return `(no diff for ${path})`;
  return [`$ git diff HEAD -- ${path}`, ...output.split("\n").slice(0, limit)].join("\n");
}

export async function getCommitDetail(cwd, on, hash, limit = 200) {
  // Commit hashes are 40-hex. Anything else (e.g. a `-`-prefixed value) must
  // never reach `git show` as an argument, where it would be read as a flag.
  if (!/^[0-9a-f]{40}$/.test(hash ?? "")) throw new Error(`invalid commit hash: ${hash}`);
  const result = await readGit(cwd, on, ["show", "--stat", "-p", "--format=fuller", hash, "--"]);
  if (result.code !== 0) throw new Error(failure(result, `git show ${hash} failed`));
  const output = result.stdout.trim();
  if (!output) return `(no detail for ${hash})`;
  return [`$ git show ${hash}`, ...output.split("\n").slice(0, limit)].join("\n");
}

export async function getCommitHeatmap(cwd, on, limit = HEATMAP_LIMIT) {
  const result = await readGit(cwd, on, [
    "log",
    "--date=short",
    `--pretty=format:%ad${FIELD}%an`,
    "--all",
    "-n",
    String(limit),
    "--",
  ]);
  if (result.code === 0) return parseHeatmapOutput(result.stdout);
  if (noCommits(result)) return [];
  if (isNotRepo(result)) throw new Error("NOT_A_GIT_REPO");
  throw new Error(failure(result, "git log failed"));
}

export async function getCurrentUser(cwd, on) {
  const result = await readGit(cwd, on, ["config", "user.name"]).catch(() => null);
  return result && result.code === 0 ? result.stdout.trim() : "";
}

export function statusPaths(status) {
  const seen = new Set();
  const paths = [];
  for (const file of status?.staged ?? []) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    paths.push({ path: file.path, kind: "staged" });
  }
  for (const file of status?.unstaged ?? []) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    paths.push({ path: file.path, kind: "unstaged" });
  }
  for (const path of status?.untracked ?? []) {
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push({ path, kind: "untracked" });
  }
  return paths;
}

export async function githubRemote(cwd, on) {
  const result = await readGit(cwd, on, ["remote", "-v"]).catch(() => null);
  if (!result || result.code !== 0) return null;
  for (const line of result.stdout.split("\n")) {
    if (!line.includes("github.com")) continue;
    const name = line.split(/\s+/)[0];
    if (name) return name;
  }
  return null;
}
