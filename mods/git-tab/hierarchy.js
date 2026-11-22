// Horizontal branch hierarchy: the trunk first, then each branch lane.
// Commits come from the history pane; a commit may decorate several refs.

const TRUNK_NAMES = new Set(["main", "master"]);

/** `HEAD -> main` becomes main; a pull ref yields its PR number. */
export function describeRef(ref) {
  const cleaned = String(ref ?? "").replace(/^HEAD -> /, "").trim();
  const pr = /pull\/(\d+)\/head/.exec(cleaned);
  if (pr) {
    const label = cleaned.replace(`pull/${pr[1]}/head:`, "").trim();
    return { label, prNumber: Number(pr[1]) };
  }
  return { label: cleaned, prNumber: null };
}

function pushCommit(map, branch, hash) {
  const existing = map.get(branch);
  if (existing) existing.push(hash);
  else map.set(branch, [hash]);
}

/**
 * Group commits by the branches their refs name, then flatten a shallow tree:
 * the trunk, then every other lane directly beneath it. Real parent walking is
 * not needed for the lane drawing and costs a git call per commit.
 */
export function buildBranchHierarchy(commits, branches, prs, currentBranch) {
  if (!commits.length) return { rows: [], empty: true };

  const aheadBehind = new Map();
  for (const branch of branches ?? []) {
    aheadBehind.set(branch.name, { ahead: branch.ahead ?? 0, behind: branch.behind ?? 0 });
  }
  const prByBranch = new Map();
  for (const pr of prs ?? []) prByBranch.set(pr.branch, pr);

  const commitsByBranch = new Map();
  const prByBranchName = new Map();

  for (const commit of commits) {
    const seen = new Set();
    if (!commit.refs?.length) {
      if (currentBranch) {
        pushCommit(commitsByBranch, currentBranch, commit.shortHash);
        seen.add(currentBranch);
      }
      continue;
    }
    for (const ref of commit.refs) {
      const { label, prNumber } = describeRef(ref);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      pushCommit(commitsByBranch, label, commit.shortHash);
      if (prNumber !== null && !prByBranchName.has(label)) prByBranchName.set(label, prNumber);
    }
  }

  const branchNames = Array.from(commitsByBranch.keys());
  let trunk = null;
  if (currentBranch && TRUNK_NAMES.has(currentBranch)) trunk = currentBranch;
  if (!trunk) trunk = branchNames.find((name) => TRUNK_NAMES.has(name)) ?? null;
  if (!trunk) trunk = branchNames[0] ?? null;
  if (!trunk) {
    trunk =
      branches?.find((branch) => TRUNK_NAMES.has(branch.name))?.name ??
      branches?.[0]?.name ??
      "main";
  }

  const allNames = new Set([...branchNames, ...(branches ?? []).map((branch) => branch.name).filter((name) => name !== "(detached)")]);
  const ordered = [trunk];
  for (const name of branchNames) if (name !== trunk) ordered.push(name);
  for (const name of allNames) if (!ordered.includes(name)) ordered.push(name);

  const depthOf = new Map([[trunk, 0]]);
  for (const name of ordered) if (name !== trunk) depthOf.set(name, 1);

  const mergeShorts = new Set(commits.filter((commit) => (commit.parents?.length ?? 0) > 1).map((commit) => commit.shortHash));
  const rows = ordered.map((name) => {
    const commitsForBranch = commitsByBranch.get(name) ?? [];
    return {
      name,
      isMain: name === trunk,
      children: name === trunk ? ordered.filter((child) => child !== trunk) : [],
      depth: depthOf.get(name) ?? 1,
      commits: commitsForBranch,
      merges: commitsForBranch.filter((hash) => mergeShorts.has(hash)),
      merged: false,
      mergedInto: null,
      ahead: aheadBehind.get(name)?.ahead ?? 0,
      behind: aheadBehind.get(name)?.behind ?? 0,
      prNumber: prByBranchName.get(name) ?? prByBranch.get(name)?.number ?? null,
    };
  });

  return { rows, empty: false };
}

/** `["a"] -> "●"`, `["a","b"] -> "──●──●──>"`, merge hashes as ◆. */
export function renderBranchLine(commits, terminal = true, merges = new Set()) {
  if (!commits.length) return "";
  const nodes = commits.map((hash) => (merges.has(hash) ? "◆" : "●")).join("──");
  const prefix = commits.length > 1 ? "──" : "";
  return `${prefix}${nodes}${terminal ? "──>" : ""}`;
}
