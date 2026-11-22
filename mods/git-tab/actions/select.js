import { filterBranches, filterCommits, filterIssues, filterPRs } from "../filters.js";
import { buildBranchHierarchy } from "../hierarchy.js";
import {
  checkoutBranch,
  getBranchDiff,
  getCommitDetail,
  getFileDiff,
  statusPaths,
} from "../git.js";
import { errorLine } from "./helpers.js";

export const selectMethods = {
  selectedCommit() {
    const commits = filterCommits(this.commits, this.query);
    return commits[this.safeIndex("commits", commits.length)];
  },

  selectedFlow() {
    const commits = filterCommits(this.commits, this.query);
    const rows = buildBranchHierarchy(
      commits,
      this.branches,
      this.prs,
      this.currentBranch(),
    ).rows;
    return rows[this.safeIndex("flow", rows.length)];
  },

  selectedBranch() {
    const branches = filterBranches(this.branches, this.branchFilter);
    return branches[this.safeIndex("branches", branches.length)];
  },

  selectedPR() {
    const prs = filterPRs(this.prs, this.query);
    return prs[this.safeIndex("prs", prs.length)];
  },

  selectedIssue() {
    const issues = filterIssues(this.issues, this.query);
    return issues[this.safeIndex("issues", issues.length)];
  },

  selectedPath() {
    const paths = statusPaths(this.status);
    return paths[this.safeIndex("status", paths.length)];
  },

  openDiffView(title, body) {
    this.view = {
      kind: "diff",
      title,
      body: String(body ?? ""),
      scroll: 0,
    };
    this.view.lines = this.view.body.split("\n");
    this.reveal = { pane: "diff", index: 0 };
    this.handle.focus();
  },

  openCommit(commit, cx) {
    if (!commit || !this.root || this.busy) return;
    const root = this.root;
    const on = this.on;
    const short = commit.shortHash || String(commit.hash ?? "").slice(0, 7);
    const label = `Loading commit ${short}…`;
    this.busy = label;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const bodyTemp = await getCommitDetail(root, on, commit.hash);
        if (!this.isCurrentRoot(root, on)) return;
        this.openDiffView(
          commit.subject ? `commit ${short}: ${commit.subject}` : `commit ${short}`,
          bodyTemp,
        );
        cx.notify();
      } catch (error) {
        if (this.isCurrentRoot(root, on)) {
          this.setError(`Cannot open ${short}: ${errorLine(error, "git show failed")}`, cx);
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  openFlowCommit(row, cx) {
    if (!row || !row.commits.length) {
      this.setNotice(`No commits on ${row?.name ?? "this branch"} in the loaded history.`, cx);
      return;
    }
    const short = row.commits[0];
    const commit = this.commits.find((item) => item.shortHash === short);
    this.openCommit(commit ?? { hash: short, shortHash: short, subject: "" }, cx);
  },

  activateSelection(cx) {
    if (this.view || this.busy) return;
    if (this.active === "commits") {
      const commit = this.selectedCommit();
      if (commit) this.openCommit(commit, cx);
      return;
    }
    if (this.active === "flow") {
      const row = this.selectedFlow();
      if (row) this.openFlowCommit(row, cx);
      return;
    }
    if (this.active === "branches") {
      this.checkoutSelectedBranch(cx);
      return;
    }
    if (this.active === "prs") {
      const pr = this.selectedPR();
      if (pr) this.openPR(pr.number, cx);
      return;
    }
    if (this.active === "issues") {
      const issue = this.selectedIssue();
      if (issue) this.openIssue(issue.number, cx);
      return;
    }
    if (this.active === "status") {
      const pathItem = this.selectedPath();
      if (pathItem) this.openFileDiff(pathItem, cx);
    }
  },

  diffSelection(cx) {
    if (this.view || this.busy) return;
    if (this.active === "branches") {
      const branch = this.selectedBranch();
      if (!branch) return;
      if (branch.name === "(detached)") {
        this.setError("nothing to diff", cx);
        return;
      }
      if (branch.name.startsWith("remotes/")) {
        this.setError("remote branch: checkout first to diff", cx);
        return;
      }
      this.openBranchDiff(branch.name, cx);
      return;
    }
    if (this.active === "status") {
      const pathItem = this.selectedPath();
      if (!pathItem) {
        this.setError("working tree clean: nothing to diff", cx);
        return;
      }
      this.openFileDiff(pathItem, cx);
    }
  },

  openFileDiff(file, cx) {
    if (!file || !this.root || this.busy) return;
    const path = file.path;
    if (file.kind === "untracked") {
      this.openDiffView(`diff ${path}`, `(untracked ${path}: no diff)`);
      cx.notify();
      return;
    }
    const root = this.root;
    const on = this.on;
    const label = `Loading diff ${path}…`;
    this.busy = label;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const body = await getFileDiff(root, on, path);
        if (!this.isCurrentRoot(root, on)) return;
        this.openDiffView(`diff ${path}`, body);
        cx.notify();
      } catch (error) {
        if (this.isCurrentRoot(root, on)) {
          this.setError(`Cannot diff ${path}: ${errorLine(error, "git diff failed")}`, cx);
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  openBranchDiff(name, cx) {
    if (!name || !this.root || this.busy) return;
    const root = this.root;
    const on = this.on;
    const label = `Loading diff ${name}…`;
    this.busy = label;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const body = await getBranchDiff(root, on, name);
        if (!this.isCurrentRoot(root, on)) return;
        this.openDiffView(`diff ${name}`, body);
        cx.notify();
      } catch (error) {
        if (this.isCurrentRoot(root, on)) {
          this.setError(`Cannot diff ${name}: ${errorLine(error, "git diff failed")}`, cx);
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  checkoutSelectedBranch(cx) {
    if (this.loading || this.busy) return;
    const branch = this.selectedBranch();
    if (!branch) return;
    if (branch.name === "(detached)") {
      this.setError("nothing to checkout", cx);
      return;
    }
    if (branch.name.startsWith("remotes/")) {
      this.setError("remote branch: check it out locally in a terminal first", cx);
      return;
    }
    if (branch.current) {
      this.setNotice(`Already on ${branch.name}`, cx);
      return;
    }

    const root = this.root;
    const on = this.on;
    const name = branch.name;
    const label = `Checking out ${name}…`;
    this.busy = label;
    this.notice = null;
    this.error = null;
    cx.notify();

    let ok = false;
    cx.spawn(async (cx) => {
      try {
        await checkoutBranch(root, on, name);
        ok = true;
        this.setNotice(`Checked out ${name}`, cx);
      } catch (error) {
        if (this.isCurrentRoot(root, on)) {
          this.setError(`Cannot check out ${name}: ${errorLine(error, "git checkout failed")}`, cx);
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
      if (ok) this.refresh(cx, { manual: true });
    });
  },
};

export default selectMethods;
