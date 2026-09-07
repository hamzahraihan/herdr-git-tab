import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Branch, Commit, RepoStatus } from "./types.js";

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
    try {
      const r = await runGit(repo, ["log", "-1", "--format=%h%an%s", "HEAD"]);
      const parts = r.stdout.trim().split("");
      if (parts.length >= 3) lastCommit = `${parts[0]} ${parts[1]} ${parts[2]}`;
      else lastCommit = r.stdout.trim();
    } catch {
      lastCommit = "";
    }
    return [{ name: "(detached)", current: true, ahead: 0, behind: 0, lastCommit }];
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
  // Enrich lastCommit via `git log -1` per local branch; best-effort, keep -vv msg on failure.
  await Promise.all(
    branches
      .filter((b) => !b.name.startsWith("remotes/"))
      .map(async (b) => {
        try {
          const r = await runGit(repo, ["log", "-1", "--format=%h%an%s", b.name, "--"]);
          const parts = r.stdout.trim().split("");
          if (parts.length >= 3) b.lastCommit = `${parts[0]} ${parts[1]} ${parts[2]}`;
          else if (r.stdout.trim()) b.lastCommit = r.stdout.trim();
        } catch {
          // keep -vv message
        }
      }),
  );
  return branches;
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
