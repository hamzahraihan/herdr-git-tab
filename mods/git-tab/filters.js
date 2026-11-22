// Local, case-insensitive filters. They never re-run git; typing is instant.

const needle = (query) => String(query ?? "").trim().toLowerCase();

export function filterCommits(commits, query) {
  const q = needle(query);
  if (!q) return commits;
  return commits.filter(
    (commit) =>
      String(commit.subject ?? "").toLowerCase().includes(q) ||
      String(commit.author ?? "").toLowerCase().includes(q) ||
      String(commit.shortHash ?? "").toLowerCase().includes(q),
  );
}

export function filterBranches(branches, query) {
  const q = needle(query);
  if (!q) return branches;
  return branches.filter((branch) => String(branch.name ?? "").toLowerCase().includes(q));
}

export function filterPRs(prs, query) {
  const q = needle(query);
  if (!q) return prs;
  return prs.filter(
    (pr) =>
      String(pr.title ?? "").toLowerCase().includes(q) ||
      String(pr.author ?? "").toLowerCase().includes(q) ||
      String(pr.number ?? "").includes(q),
  );
}

export function filterIssues(issues, query) {
  const q = needle(query);
  if (!q) return issues;
  return issues.filter(
    (issue) =>
      String(issue.title ?? "").toLowerCase().includes(q) ||
      String(issue.author ?? "").toLowerCase().includes(q) ||
      String(issue.number ?? "").includes(q),
  );
}
