import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AuthorStat, Branch, Commit, RepoStats, RepoStatus } from "./types.js";

const execFileAsync = promisify(execFile);
const TIMEOUT = 15000;
const HASH_RE = /[0-9a-f]{40}/;

function runGit(repo: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd: repo, timeout: TIMEOUT });
}

function errText(e: unknown): string {
  const err = e as { stderr?: unknown; stdout?: unknown; message?: string };
  if (typeof err?.stderr === "string" && err.stderr.length > 0) return err.stderr;
  if (Buffer.isBuffer(err?.stderr)) return String(err.stderr);
  return err?.message ?? String(e);
}

function errCode(e: unknown): number | undefined {
  const err = e as { code?: unknown };
  return typeof err?.code === "number" ? err.code : undefined;
}

function isErrnoEnt(e: unknown): boolean {
  const err = e as { code?: unknown };
  return err?.code === "ENOENT";
}

const FIELD_SEP = "";

/** Split one `git log --graph --pretty=format:...` line into graph glyphs + fields. */
export function parseHistoryLine(line: string): Commit | null {
  const m = HASH_RE.exec(line);
  if (!m || m.index === undefined) return null;
  const graph = line.slice(0, m.index);
  const rest = line.slice(m.index).split(FIELD_SEP);
  if (rest.length < 7) return null;
  const [hash, shortHash, author, date, subject, refsRaw, parentsRaw] = rest;
  const refs =
    refsRaw.trim().length === 0
      ? []
      : refsRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  const parents = parentsRaw.trim().length === 0 ? [] : parentsRaw.trim().split(" ");
  return { hash, shortHash, author, date, subject, refs, graph, parents };
}

export function parseHistoryOutput(stdout: string): Commit[] {
  const out: Commit[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    const c = parseHistoryLine(line);
    if (c) out.push(c);
  }
  return out;
}

export async function getHistory(repo: string, limit = 100): Promise<Commit[]> {

  try {
    const { stdout } = await runGit(repo, [
      "log",
      "--graph",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1f%D%x1f%P",
      "--all",
      "-n",
      String(limit),
      "--",
    ]);
    return parseHistoryOutput(stdout);
  } catch (e) {
    const text = errText(e);
    if (errCode(e) === 128 || /does not have any commits/i.test(text)) return [];
    if (isErrnoEnt(e)) throw new Error("GIT_UNAVAILABLE: git not found on PATH");
    throw new Error(text.trim().split("\n")[0] ?? "git log failed");
  }
}

export function parseBranchesOutput(stdout: string, headRef: string): Branch[] {
  if (headRef.trim() === "HEAD") {
    return [{ name: "(detached)", current: true, ahead: 0, behind: 0, lastCommit: "" }];
  }
  const branches: Branch[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim().length === 0) continue;
    const m = /^(\*?)\s*(\S+)\s+([0-9a-f]+)\s*(?:\[([^\]]+)\])?\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, star, name, , bracket, msg] = m;
    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;
    if (bracket) {
      const gone = /\bgone\b/i.test(bracket);
      if (gone) {
        upstream = "gone";
      } else {
        const parts = bracket.split(": ");
        upstream = parts[0].trim() || undefined;
        const rest = parts.slice(1).join(": ");
        const am = /ahead (\d+)/.exec(rest ?? bracket);
        const bm = /behind (\d+)/.exec(rest ?? bracket);
        if (am) ahead = Number(am[1]);
        if (bm) behind = Number(bm[1]);
      }
    }
    branches.push({
      name,
      current: star === "*",
      upstream,
      ahead,
      behind,
      lastCommit: (msg ?? "").trim(),
    });
  }
  return branches;
}

export async function getBranches(repo: string): Promise<Branch[]> {
  let headRef = "";
  try {
    const r = await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
    headRef = r.stdout.trim();
  } catch (e) {
    const text = errText(e);
    if (errCode(e) === 128) throw new Error("NOT_A_GIT_REPO");
    if (isErrnoEnt(e)) throw new Error("GIT_UNAVAILABLE: git not found on PATH");
    throw new Error(text.trim().split("\n")[0] ?? "git rev-parse failed");
  }
  if (headRef === "HEAD") {
    let lastCommit = "";
    let lastCommitDate: string | undefined;
    try {
      const r = await runGit(repo, ["log", "-1", "--format=%h%x1f%an%x1f%cI%x1f%s", "HEAD"]);
      ({ subject: lastCommit, date: lastCommitDate } = parseTipLine(r.stdout));
    } catch {
      lastCommit = "";
    }
    return [{ name: "(detached)", current: true, ahead: 0, behind: 0, lastCommit, lastCommitDate }];
  }
  let stdout = "";
  try {
    const r = await runGit(repo, ["branch", "-vv", "--all"]);
    stdout = r.stdout;
  } catch (e) {
    const text = errText(e);
    if (errCode(e) === 128 || /does not have any commits/i.test(text)) return [];
    throw new Error(text.trim().split("\n")[0] ?? "git branch failed");
  }
  const branches = parseBranchesOutput(stdout, headRef);
  // Enrich tip subject + date via `git log -1` per local branch; best-effort,
  // keep the -vv message on failure. Unit separators keep author names with
  // spaces intact.
  await Promise.all(
    branches
      .filter((b) => !b.name.startsWith("remotes/"))
      .map(async (b) => {
        try {
          const r = await runGit(repo, ["log", "-1", "--format=%h%x1f%an%x1f%cI%x1f%s", b.name, "--"]);
          const tip = parseTipLine(r.stdout);
          if (tip.subject) b.lastCommit = tip.subject;
          if (tip.date) b.lastCommitDate = tip.date;
        } catch {
          // keep -vv message
        }
      }),
  );
  return branches;
}

/** Split one `git log -1 --format=%h%x1f%an%x1f%cI%x1f%s` line into the tip
 *  subject (shown in the branches view) and its ISO date (right-hand age).
 *  Empty when git prints nothing (e.g. unborn branch). */
export function parseTipLine(stdout: string): { subject: string; date?: string } {
  const first = stdout.split("\n")[0] ?? "";
  const parts = first.split(String.fromCharCode(31));
  const date = (parts[2] ?? "").trim();
  return { subject: (parts[3] ?? "").trim(), date: date ? date : undefined };
}

/** Parse `git branch --all --merged <trunk> --format=%(refname:short)` output
 *  into branch names. Drops empties, symref arrows, and HEAD pointers. */
export function parseMergedBranches(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(" -> ") && !line.endsWith("/HEAD"));
}

/** Names fully merged into `trunk` (local + remote). Best-effort: resolves
 *  to [] when the trunk is unknown or git fails; callers degrade silently. */
export async function getMergedBranches(repo: string, trunk: string): Promise<string[]> {
  const { stdout } = await runGit(repo, [
    "branch",
    "--all",
    "--merged",
    trunk,
    "--format=%(refname:short)",
  ]);
  return parseMergedBranches(stdout);
}

export function parseStatusOutput(stdout: string): RepoStatus {
  const lines = stdout.split("\n");
  const header = (lines[0] ?? "").replace(/^##\s*/, "");
  let branch = header;
  let ahead = 0;
  let behind = 0;
  // Forms: "main...origin/main [ahead 2, behind 1]", "main", "No commits yet on main",
  // "HEAD (no branch)", "main...origin/main [gone]"
  const branchMatch = /^(.*?)(?:\.\.\.([^\s\[]+))?(?:\s*\[([^\]]+)\])?\s*$/.exec(header);
  if (branchMatch) {
    branch = (branchMatch[1] ?? header).trim() || header;
    const bracket = branchMatch[3] ?? "";
    const am = /ahead (\d+)/.exec(bracket);
    const bm = /behind (\d+)/.exec(bracket);
    if (am) ahead = Number(am[1]);
    if (bm) behind = Number(bm[1]);
    if (/^No commits yet on /.test(branch)) branch = branch.replace(/^No commits yet on /, "");
  }
  const status: RepoStatus = { branch, ahead, behind, staged: [], unstaged: [], untracked: [] };
  for (const raw of lines.slice(1)) {
    if (raw.length < 4) continue;
    const x = raw[0];
    const y = raw[1];
    let p = raw.slice(3);
    if (p.includes(" -> ")) p = p.split(" -> ").pop()!;
    if (x === "?" && y === "?") {
      status.untracked.push(p);
      continue;
    }
    if (x !== " " && x !== "?" && x !== "!") {
      status.staged.push({ path: p, staged: x, unstaged: y });
    }
    if (y !== " " && y !== "?" && y !== "!") {
      status.unstaged.push({ path: p, staged: x, unstaged: y });
    }
  }
  return status;
}

export async function getStatus(repo: string): Promise<RepoStatus> {
  try {
    const { stdout } = await runGit(repo, ["status", "--porcelain=v1", "-b"]);
    return parseStatusOutput(stdout);
  } catch (e) {
    const text = errText(e);
    if (errCode(e) === 128) throw new Error("NOT_A_GIT_REPO");
    if (isErrnoEnt(e)) throw new Error("GIT_UNAVAILABLE: git not found on PATH");
    throw new Error(text.trim().split("\n")[0] ?? "git status failed");
  }
}

export async function checkoutBranch(repo: string, name: string): Promise<void> {
  try {
    await runGit(repo, ["checkout", name, "--"]);
  } catch (e) {
    throw new Error(errText(e).trim().split("\n")[0] ?? `git checkout ${name} failed`);
  }
}

/** Parse `git shortlog -s -n --all` output (`<count>\t<name>` per line). */
export function parseShortlog(stdout: string): AuthorStat[] {
  const authors: AuthorStat[] = [];
  for (const raw of stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(raw);
    if (!m) continue;
    authors.push({ name: (m[2] ?? "").trim(), count: Number(m[1]) });
  }
  return authors.filter((a) => a.name.length > 0 && Number.isFinite(a.count));
}

/** Display form of a remote URL: `github.com/user/repo`. Handles https/http
 *  (with or without `.git`) and `user@host:path` ssh forms. Falls back to
 *  the trimmed input when unrecognized. */
export function normalizeRemoteUrl(raw: string): string {
  const url = raw.trim().replace(/\.git$/, "");
  const https = /^(?:https?:\/\/)?([^/]+)\/(.+)$/.exec(url);
  if (https && !url.includes("@")) return `${https[1]}/${https[2]}`;
  const ssh = /^(?:[^@]+@)?([^:]+):(.+)$/.exec(url);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  return url;
}

const DAY_MS = 86_400_000;

/** Human span between two ISO timestamps: `3 days`, `4 weeks`, `2 months`,
 *  `1 year`. Null when either end is missing or unparsable. */
export function humanizeSpan(oldest: string | null, newest: string | null): string | null {
  if (!oldest || !newest) return null;
  const from = Date.parse(oldest);
  const to = Date.parse(newest);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  const days = Math.floor((to - from) / DAY_MS);
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** Repo-wide stats for the status panel: origin remote, total commits,
 *  history span, and per-author counts. Best-effort — individual failures
 *  degrade to null/empty rather than throwing. */
export async function getRepoStats(repo: string): Promise<RepoStats> {
  const stats: RepoStats = { remote: null, total: 0, oldest: null, newest: null, authors: [] };
  try {
    const [remote, total, newest, roots, shortlog] = await Promise.all([
      runGit(repo, ["remote", "get-url", "origin"]).then(
        (r) => r.stdout.trim(),
        () => "",
      ),
      runGit(repo, ["rev-list", "--count", "--all"]).then(
        (r) => Number(r.stdout.trim()),
        () => NaN,
      ),
      runGit(repo, ["log", "-1", "--format=%cI", "--all"]).then(
        (r) => r.stdout.trim(),
        () => "",
      ),
      runGit(repo, ["rev-list", "--all", "--timestamp", "--max-parents=0"]).then(
        (r) => r.stdout,
        () => "",
      ),
      runGit(repo, ["shortlog", "-s", "-n", "--all"]).then(
        (r) => r.stdout,
        () => "",
      ),
    ]);
    if (remote) stats.remote = normalizeRemoteUrl(remote);
    if (Number.isFinite(total)) stats.total = total;
    if (newest) stats.newest = newest;
    let oldestEpoch = Infinity;
    for (const line of roots.split("\n")) {
      const epoch = Number((line.trim().split(/\s+/, 1)[0] ?? "").trim());
      if (Number.isFinite(epoch) && epoch > 0 && epoch < oldestEpoch) oldestEpoch = epoch;
    }
    if (oldestEpoch !== Infinity) stats.oldest = new Date(oldestEpoch * 1000).toISOString();
    stats.authors = parseShortlog(shortlog);
  } catch {
    // Fall through with whatever resolved; callers hide empty blocks.
  }
  return stats;
}

/** `d` on a branch: recent log plus diff stat against the merge base.
 *  Best-effort text for the diff overlay; throws a one-line message. */
export async function getBranchDiff(repo: string, branch: string): Promise<string> {
  try {
    const [log, stat] = await Promise.all([
      runGit(repo, ["log", "--oneline", "-20", branch, "--"]).then((r) => r.stdout, () => ""),
      runGit(repo, ["diff", "--stat", `${branch}@{u}...${branch}`]).then(
        (r) => r.stdout,
        () => "",
      ),
    ]);
    const upstreamStat = stat.trim();
    const fallbackStat = upstreamStat
      ? ""
      : await runGit(repo, ["diff", "--stat", "HEAD"]).then((r) => r.stdout, () => "");
    const lines = [`$ git log --oneline -20 ${branch}`, log.trim() || "(no commits)"];
    const statText = (upstreamStat || fallbackStat).trim();
    if (statText) lines.push("", `$ git diff --stat`, statText);
    return lines.join("\n");
  } catch (e) {
    throw new Error(errText(e).trim().split("\n")[0] ?? `git diff ${branch} failed`);
  }
}

/** `d` on a changed status file: `git diff HEAD -- <path>` capped for the
 *  overlay. Untracked files have no diff — callers show `(untracked)` text. */
export async function getFileDiff(repo: string, path: string, limit = 100): Promise<string> {
  try {
    const { stdout } = await runGit(repo, ["diff", "HEAD", "--", path]);
    const out = stdout.trim();
    if (!out) return `(no diff for ${path})`;
    const lines = out.split("\n").slice(0, limit);
    return [`$ git diff HEAD -- ${path}`, ...lines].join("\n");
  } catch (e) {
    throw new Error(errText(e).trim().split("\n")[0] ?? `git diff ${path} failed`);
  }
}

/** Commit detail for history/flow double-click: `git show` capped for the
 *  overlay. Returns `$ git show <hash>` header plus show output. */
export async function getCommitDetail(repo: string, hash: string, limit = 200): Promise<string> {
  try {
    const { stdout } = await runGit(repo, ["show", "--stat", "-p", "--format=fuller", hash, "--"]);
    const out = stdout.trim();
    if (!out) return `(no detail for ${hash})`;
    const lines = out.split("\n").slice(0, limit);
    return [`$ git show ${hash}`, ...lines].join("\n");
  } catch (e) {
    throw new Error(errText(e).trim().split("\n")[0] ?? `git show ${hash} failed`);
  }
}

/** Ordered status paths for `d` + status selection: staged, unstaged, untracked. */
export function statusPaths(status: RepoStatus): { path: string; kind: string }[] {
  const seen = new Set<string>();
  const out: { path: string; kind: string }[] = [];
  for (const f of status.staged) {
    if (!seen.has(f.path)) {
      seen.add(f.path);
      out.push({ path: f.path, kind: "staged" });
    }
  }
  for (const f of status.unstaged) {
    if (!seen.has(f.path)) {
      seen.add(f.path);
      out.push({ path: f.path, kind: "unstaged" });
    }
  }
  for (const p of status.untracked) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push({ path: p, kind: "untracked" });
    }
  }
  return out;
}
