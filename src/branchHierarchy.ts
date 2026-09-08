// Horizontal branch hierarchy builder.
//
// Walks commits (newest first) and groups them by branch, producing a tree of
// `BranchRow` entries rendered as stacked lanes:
//
//   main  ──●──◆──●──>
//        \
//        luvus/t2  ──●── ↑2 · PR #14
//        \
//        luvus/t3  ● ↑1
//
// Merge visibility comes from two signals. Commits with 2+ parents render as
// ◆ nodes, so a merge is visible at the exact point it lands on a lane. A
// branch fully merged into the trunk (via `git branch --merged`) rejoins it
// visually: its lane ends in ──╯ and carries a `merged → <trunk>` tag.
//
// Each branch row exposes the list of commit *short-hashes* (newest -> oldest)
// belonging to that branch, the branch's ahead/behind counters, and an optional
// associated PR number. The shape is purposely flat: the panel handles the
// parent/child geometry by ordering rows by depth below the parent branch.
import type { Branch, Commit, PR } from "./types.js";

export type BranchRow = {
  /** Branch name, e.g. "main" or "luvus/t2". */
  name: string;
  /** True for the trunk row (main/master). */
  isMain: boolean;
  /** Names of immediate child branches (rendered as `\` offshoots). */
  children: string[];
  /** Depth: 0 for trunk, 1 for direct child of trunk, etc. */
  depth: number;
  /** Commits on this branch, ordered newest -> oldest. */
  commits: string[];
  /** Short-hashes in `commits` that are merge commits (2+ parents). */
  merges: string[];
  /** True when the branch tip is fully merged into the trunk. */
  merged: boolean;
  /** Trunk name when `merged`, otherwise null. */
  mergedInto: string | null;
  /** Ahead/behind counters (from `Branch` list). */
  ahead: number;
  behind: number;
  /** PR number (from PR list match or `pull/N/head` ref). */
  prNumber: number | null;
};

export type BranchHierarchy = {
  /** Ordered list of branches (depth-first). The trunk is at index 0. */
  rows: BranchRow[];
  /** True when no commits exist. */
  empty: boolean;
};

const TRUNK_NAMES = new Set(["main", "master"]);

/** Extract a clean branch label from a `git log --decorate` ref string.
 *
 * Recognised shapes:
 *   "main"                              -> "main"
 *   "HEAD -> main"                      -> "main"  (HEAD pointer is stripped)
 *   "origin/main, HEAD -> main"        -> treated as separate refs upstream
 *   "pull/14/head:luvus/t2"             -> "luvus/t2" + PR 14
 *   "tag: v1.0"                         -> "tag: v1.0" (passthrough)
 */
export function describeRef(ref: string): { label: string; prNumber: number | null } {
  // Strip a leading "HEAD -> " marker if present.
  const cleaned = ref.replace(/^HEAD -> /, "").trim();
  const prMatch = /pull\/(\d+)\/head/.exec(cleaned);
  if (prMatch) {
    return {
      label: cleaned.replace(`pull/${prMatch[1]}/head:`, "").trim(),
      prNumber: Number(prMatch[1]),
    };
  }
  return { label: cleaned, prNumber: null };
}

function prFromRefs(refs: string[]): number | null {
  for (const r of refs) {
    const m = /pull\/(\d+)\//.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Group commits by branch label and assemble a hierarchy.
 *
 * Each commit may carry zero or more `refs`; each ref is interpreted as a
 * branch name (or PR-head) and the commit is added to that branch's row.
 * Commits with no refs fall back to whichever branch is currently checked out
 * (`currentBranch`) — this matches `git log --decorate` output where the
 * current branch label is implicit.
 */
export function buildBranchHierarchy(
  commits: Commit[],
  branches: Branch[],
  prs: PR[],
  currentBranch: string | null,
): BranchHierarchy {
  if (commits.length === 0) return { rows: [], empty: true };

  const aheadBehindOf = new Map<string, { ahead: number; behind: number }>();
  for (const b of branches) {
    aheadBehindOf.set(b.name, { ahead: b.ahead, behind: b.behind });
  }
  const prByBranch = new Map<string, PR>();
  for (const p of prs) prByBranch.set(p.branch, p);

  // Branch label -> list of short-hashes (in order seen = newest first).
  const commitsByBranch = new Map<string, string[]>();
  // Branch label -> PR number (resolved from refs *or* matching PR list).
  const prByBranchName = new Map<string, number>();

  for (const c of commits) {
    const seenFor = new Set<string>();
    if (c.refs.length === 0) {
      // Implicit: belongs to the current branch.
      if (currentBranch) {
        pushCommit(commitsByBranch, currentBranch, c.shortHash);
        seenFor.add(currentBranch);
      }
    } else {
      for (const ref of c.refs) {
        const { label, prNumber } = describeRef(ref);
        if (!label || seenFor.has(label)) continue;
        seenFor.add(label);
        pushCommit(commitsByBranch, label, c.shortHash);
        if (prNumber !== null && !prByBranchName.has(label)) {
          prByBranchName.set(label, prNumber);
        }
      }
    }
  }

  // Pick trunk. Prefer `currentBranch` if it's main/master, then look for
  // any branch named main or master; fall back to the first branch with
  // commits; finally the first known branch.
  const branchNames = Array.from(commitsByBranch.keys());
  let trunk: string | null = null;
  if (currentBranch && TRUNK_NAMES.has(currentBranch)) trunk = currentBranch;
  if (!trunk) {
    for (const name of branchNames) {
      if (TRUNK_NAMES.has(name)) {
        trunk = name;
        break;
      }
    }
  }
  if (!trunk && branchNames.length > 0) trunk = branchNames[0]!;
  if (!trunk) {
    const fallback = branches.find((b) => TRUNK_NAMES.has(b.name))?.name ?? branches[0]?.name;
    trunk = fallback ?? "main";
  }

  // Resolve children: a branch is a child of the trunk if its first commit's
  // parent chain leads to the trunk's tip. Cheap heuristic without parent
  // traversal: any non-trunk branch becomes a child of the trunk at depth 1.
  // Deeper hierarchies collapse into depth 1 since horizontal layout focuses
  // on trunk + immediate offshoots.
  const allBranchNames = new Set<string>([
    ...branchNames,
    ...branches.map((b) => b.name).filter((n) => n !== "(detached)"),
  ]);

  // Order: trunk first, then the rest sorted by first-seen order.
  const ordered: string[] = [trunk];
  for (const name of branchNames) {
    if (name !== trunk) ordered.push(name);
  }
  for (const name of allBranchNames) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  // Build children adjacency. Default: child of trunk. Real parent resolution
  // can be added by walking parents; for now we keep it visually simple —
  // trunk + offshoots stacked vertically.
  const childrenOf = new Map<string, string[]>();
  for (const name of ordered) {
    if (name === trunk) {
      childrenOf.set(name, ordered.filter((n) => n !== trunk));
    } else {
      childrenOf.set(name, []);
    }
  }

  // Assign depths via BFS.
  const depthOf = new Map<string, number>();
  depthOf.set(trunk, 0);
  const queue: string[] = [trunk];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const kids = childrenOf.get(cur) ?? [];
    for (const k of kids) {
      if (!depthOf.has(k)) {
        depthOf.set(k, (depthOf.get(cur) ?? 0) + 1);
        queue.push(k);
      }
    }
  }
  // Any unreached branch gets depth 1.
  for (const name of ordered) {
    if (!depthOf.has(name)) depthOf.set(name, 1);
  }

  // Depth-first emission so children sit directly below their parent.
  const emitted = new Set<string>();
  const dfs: string[] = [];
  function visit(name: string) {
    if (emitted.has(name)) return;
    emitted.add(name);
    dfs.push(name);
    for (const child of childrenOf.get(name) ?? []) visit(child);
  }
  visit(trunk);

  const mergeShorts = new Set(
    commits.filter((c) => c.parents.length > 1).map((c) => c.shortHash),
  );
  const rows: BranchRow[] = dfs.map((name) => {
    const ab = aheadBehindOf.get(name) ?? { ahead: 0, behind: 0 };
    const prFromList = prByBranch.get(name);
    const prNumber = prByBranchName.get(name) ?? prFromList?.number ?? null;
    const commitsForBranch = commitsByBranch.get(name) ?? [];
    return {
      name,
      isMain: name === trunk,
      children: childrenOf.get(name) ?? [],
      depth: depthOf.get(name) ?? 0,
      commits: commitsForBranch,
      merges: commitsForBranch.filter((h) => mergeShorts.has(h)),
      // Fully-merged marking is applied by the panel, which owns the
      // `git branch --merged` result; the model defaults to unmerged.
      merged: false,
      mergedInto: null,
      ahead: ab.ahead,
      behind: ab.behind,
      prNumber,
    };
  });

  return { rows, empty: false };
}

function pushCommit(map: Map<string, string[]>, branch: string, shortHash: string) {
  const existing = map.get(branch);
  if (existing) existing.push(shortHash);
  else map.set(branch, [shortHash]);
}

/**
 * Render a single branch's commit list into a horizontal string of glyphs.
 * Merge commits (in `merges`) render as ◆ so merges are visible at the exact
 * point they land on a lane.
 *
 *   []                       -> ""
 *   ["abc1234"]              -> "●"
 *   ["abc1234", "def5678"]   -> "──●──●──>"
 *   (merges={"def5678"})     -> "──●──◆──>"
 */
export function renderBranchLine(
  commits: string[],
  terminal = true,
  merges: Set<string> = new Set(),
): string {
  if (commits.length === 0) return "";
  const nodes = commits.map((h) => (merges.has(h) ? "◆" : "●")).join("──");
  const prefix = commits.length > 1 ? "──" : "";
  const suffix = terminal ? "──>" : "";
  return `${prefix}${nodes}${suffix}`;
}