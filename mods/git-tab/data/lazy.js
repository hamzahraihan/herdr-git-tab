import { clamp, firstLine, messageOf } from "../format.js";
import { filterBranches, filterCommits, filterIssues, filterPRs } from "../filters.js";
import { buildBranchHierarchy } from "../hierarchy.js";
import { getCommitHeatmap, getMergedBranches, getRepoStats, statusPaths } from "../git.js";
import { getIssues, getPRs } from "../github.js";

// gh list calls hit the network; the panel re-reads them at most every 60s
// (the docs' "list reloads every 60s"). Deads (no gh / not signed in / no
// GitHub remote) are remembered per location so we don't retry every cycle.
const GH_REFRESH_MS = 60000;

function errorLine(error, fallback) {
  return firstLine(messageOf(error), fallback);
}

function stripPrefix(text) {
  return String(text ?? "").replace(/^(GH|GIT)_UNAVAILABLE:\s*/, "");
}

export const lazyMethods = {
  safeIndex(key, length) {
    const max = Math.max(0, length - 1);
    const current = Number(this.sel[key]);
    const safe = clamp(Number.isFinite(current) ? current : 0, 0, max);
    this.sel[key] = safe;
    return safe;
  },

  listLength(key) {
    if (key === "commits") return filterCommits(this.commits, this.query).length;
    if (key === "flow") {
      const commits = filterCommits(this.commits, this.query);
      return buildBranchHierarchy(commits, this.branches, this.prs, this.currentBranch()).rows.length;
    }
    if (key === "branches") return filterBranches(this.branches, this.branchFilter).length;
    if (key === "prs") return filterPRs(this.prs, this.query).length;
    if (key === "issues") return filterIssues(this.issues, this.query).length;
    if (key === "status") return statusPaths(this.status).length;
    return 0;
  },

  clampSelection() {
    for (const key of ["commits", "flow", "branches", "prs", "issues", "status"]) {
      const length = this.listLength(key);
      const current = Number(this.sel[key]);
      this.sel[key] = clamp(Number.isFinite(current) ? current : 0, 0, Math.max(0, length - 1));
    }
  },

  ensureTabData(cx) {
    if (!this.root) return;
    if (this.active === "status" && !this.statsLoaded) this.loadStats(cx);
    if (this.active === "heatmap" && !this.heatLoaded) this.loadHeatmap(cx);
    if (this.active === "flow") this.loadMerged(cx, false);
    if (this.active === "prs" || this.active === "issues") this.loadGh(cx, false);
  },

  /** gh pr/issue lists. Skips when already fresh, when a load is in
   *  flight, or when this location/dead is remembered. */
  loadGh(cx, manual = false) {
    if (!this.root) return;
    if (this.ghLoading) return;
    const key = `${this.on ?? ""}|${this.root}|${this.scope}`;
    if (!manual) {
      if (this.ghDeadFor === key) return;
      if (this.ghLoadedFor === key && Date.now() - Number(this.ghLoadedAt ?? 0) < GH_REFRESH_MS) return;
    }
    const root = this.root;
    const on = this.on;
    const scope = this.scope;
    const generation = this.generation;
    const id = ++this.ghLoadId;
    this.ghLoading = true;

    cx.spawn(async (cx) => {
      if (this.noRemote) {
        if (generation !== this.generation || id !== this.ghLoadId) return;
        this.prs = [];
        this.issues = [];
        this.paneErrors.prs = null;
        this.paneErrors.issues = null;
        this.ghLoading = false;
        cx.notify();
        return;
      }
      const [prs, issues] = await Promise.allSettled([getPRs(root, on, scope), getIssues(root, on, scope)]);
      if (generation !== this.generation || id !== this.ghLoadId) return;
      this.prs = [];
      this.issues = [];
      const ghProblems = [];
      if (prs.status === "fulfilled") {
        this.prs = prs.value;
      } else {
        const text = errorLine(prs.reason, "gh pr list failed");
        if (/^GH_UNAVAILABLE/.test(text)) ghProblems.push(text);
        else this.paneErrors.prs = stripPrefix(text);
      }
      if (issues.status === "fulfilled") {
        this.issues = issues.value;
      } else {
        const text = errorLine(issues.reason, "gh issue list failed");
        if (/^GH_UNAVAILABLE/.test(text)) ghProblems.push(text);
        else this.paneErrors.issues = stripPrefix(text);
      }
      this.ghError = ghProblems.length ? ghProblems[0] : null;
      if (ghProblems.length) {
        this.paneErrors.prs = null;
        this.paneErrors.issues = null;
        this.ghDeadFor = key;
        this.ghLoadedFor = null;
      } else {
        this.ghDeadFor = null;
        this.ghLoadedFor = key;
        this.ghLoadedAt = Date.now();
      }
      this.ghLoading = false;
      cx.notify();
    });
  },

  loadStats(cx) {
    if (!this.root || this.statsLoading) return;
    const root = this.root;
    const on = this.on;
    const generation = this.generation;
    const id = ++this.statsLoadId;
    this.statsLoading = true;
    cx.notify();

    cx.spawn(async (cx) => {
      let stats = null;
      let problem = null;
      try {
        stats = await getRepoStats(root, on);
      } catch (error) {
        problem = stripPrefix(errorLine(error, "Could not read repository stats."));
      }
      if (generation !== this.generation || id !== this.statsLoadId) return;
      if (problem) {
        this.paneErrors.stats = problem;
        this.statsLoaded = false;
      } else {
        this.stats = stats;
        this.statsLoaded = true;
        this.paneErrors.stats = null;
      }
      this.statsLoading = false;
      cx.notify();
    });
  },

  loadHeatmap(cx) {
    if (!this.root || this.heatLoading) return;
    const root = this.root;
    const on = this.on;
    const generation = this.generation;
    const id = ++this.heatLoadId;
    this.heatLoading = true;
    cx.notify();

    cx.spawn(async (cx) => {
      let entries = null;
      let problem = null;
      try {
        entries = await getCommitHeatmap(root, on);
      } catch (error) {
        problem = stripPrefix(errorLine(error, "Could not read commit dates."));
      }
      if (generation !== this.generation || id !== this.heatLoadId) return;
      if (problem) {
        this.paneErrors.heatmap = problem;
        this.heatLoaded = false;
      } else {
        this.heatEntries = entries ?? [];
        this.heatLoaded = true;
        this.paneErrors.heatmap = null;
      }
      this.heatLoading = false;
      cx.notify();
    });
  },

  loadMerged(cx, force = false) {
    if (!this.root) return;
    const trunk = this.trunkName();
    if (!trunk) return;
    const key = `${this.root}|${trunk}`;
    if (this.mergedLoading || (!force && this.mergedLoadedFor === key)) return;

    const root = this.root;
    const on = this.on;
    const generation = this.generation;
    this.mergedLoading = true;
    this.mergedLoadedFor = key;

    cx.spawn(async (cx) => {
      let names = [];
      try {
        names = await getMergedBranches(root, on, trunk);
      } catch {
        names = [];
      }
      if (generation !== this.generation) return;
      this.mergedNames = new Set(names.filter((name) => name !== trunk));
      this.mergedLoading = false;
      cx.notify();
    });
  },
};

export default lazyMethods;
