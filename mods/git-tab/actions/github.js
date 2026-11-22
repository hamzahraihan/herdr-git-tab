import { clamp } from "../format.js";
import {
  approvePR as approvePullRequest,
  checkoutPR as checkoutPullRequest,
  getIssueDetail,
  getPRDetail,
  openIssueWeb,
  openPRWeb,
  startPRCreate,
} from "../github.js";
import { errorLine, stripPrefix } from "./helpers.js";

export const githubMethods = {
  openPR(number, cx) {
    if (!this.root || this.busy) return;
    this.view = {
      kind: "pr",
      number,
      detail: null,
      loading: true,
      error: null,
      scroll: 0,
    };
    this.reveal = { pane: "detail", index: 0 };
    this.loadPR(number, cx);
  },

  loadPR(number, cx) {
    if (!this.root) return;
    const view = this.view;
    if (!view || view.kind !== "pr" || view.number !== number) return;
    const root = this.root;
    const on = this.on;
    const label = `Loading PR #${number}…`;
    this.busy = label;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const detail = await getPRDetail(root, on, number);
        if (this.view !== view || !this.isCurrentRoot(root, on)) return;
        view.detail = detail;
        view.loading = false;
        view.error = null;
        view.scroll = clamp(view.scroll ?? 0, 0, Math.max(0, this.detailBlocks - 1));
        this.reveal = { pane: "detail", index: view.scroll ?? 0 };
      } catch (error) {
        if (this.view === view && this.isCurrentRoot(root, on)) {
          view.loading = false;
          view.error = stripPrefix(errorLine(error, `gh pr view ${number} failed`));
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  reloadPR(cx) {
    if (!this.view || this.view.kind !== "pr" || this.busy) return;
    this.view.error = null;
    this.loadPR(this.view.number, cx);
  },

  checkoutPRFromView(cx) {
    const view = this.view;
    if (!view || view.kind !== "pr" || !view.detail || this.busy) return;
    const root = this.root;
    const on = this.on;
    const number = view.number;
    const label = `Checking out PR #${number}…`;
    this.busy = label;
    this.error = null;
    view.error = null;
    cx.notify();

    let ok = false;
    cx.spawn(async (cx) => {
      try {
        await checkoutPullRequest(root, on, number);
        ok = true;
        this.setNotice(`Checked out PR #${number}`, cx);
      } catch (error) {
        if (this.view === view && this.isCurrentRoot(root, on)) {
          view.error = stripPrefix(errorLine(error, `gh pr checkout ${number} failed`));
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
      if (ok) this.refresh(cx, { manual: true });
    });
  },

  approvePRFromView(cx) {
    const view = this.view;
    if (!view || view.kind !== "pr" || !view.detail || this.busy) return;
    const root = this.root;
    const on = this.on;
    const number = view.number;
    const label = `Approving PR #${number}…`;
    this.busy = label;
    this.error = null;
    view.error = null;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        await approvePullRequest(root, on, number);
        const detail = await getPRDetail(root, on, number);
        if (this.view === view && this.isCurrentRoot(root, on)) {
          view.detail = detail;
          this.setNotice(`Approved PR #${number}`, cx);
        }
      } catch (error) {
        if (this.view === view && this.isCurrentRoot(root, on)) {
          view.error = stripPrefix(errorLine(error, `gh pr review ${number} failed`));
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  openPRBrowser(cx) {
    const view = this.view;
    if (!view || view.kind !== "pr" || !view.detail) return;
    openPRWeb(this.root, this.on, view.number);
    this.setNotice("Opening on GitHub…", cx);
  },

  openIssue(number, cx) {
    if (!this.root || this.busy) return;
    this.view = {
      kind: "issue",
      number,
      detail: null,
      loading: true,
      error: null,
      scroll: 0,
    };
    this.reveal = { pane: "detail", index: 0 };
    this.loadIssue(number, cx);
  },

  loadIssue(number, cx) {
    if (!this.root) return;
    const view = this.view;
    if (!view || view.kind !== "issue" || view.number !== number) return;
    const root = this.root;
    const on = this.on;
    const label = `Loading issue #${number}…`;
    this.busy = label;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const detail = await getIssueDetail(root, on, number);
        if (this.view !== view || !this.isCurrentRoot(root, on)) return;
        view.detail = detail;
        view.loading = false;
        view.error = null;
        view.scroll = clamp(view.scroll ?? 0, 0, Math.max(0, this.detailBlocks - 1));
        this.reveal = { pane: "detail", index: view.scroll ?? 0 };
      } catch (error) {
        if (this.view === view && this.isCurrentRoot(root, on)) {
          view.loading = false;
          view.error = stripPrefix(errorLine(error, `gh issue view ${number} failed`));
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
    });
  },

  reloadIssue(cx) {
    if (!this.view || this.view.kind !== "issue" || this.busy) return;
    this.view.error = null;
    this.loadIssue(this.view.number, cx);
  },

  openIssueBrowser(cx) {
    const view = this.view;
    if (!view || view.kind !== "issue" || !view.detail) return;
    openIssueWeb(this.root, this.on, view.number);
    this.setNotice("Opening on GitHub…", cx);
  },

  createPR(cx) {
    if (this.active !== "prs" || !this.root || this.busy) return;
    const root = this.root;
    const on = this.on;
    const label = "Creating PR…";
    this.busy = label;
    this.notice = null;
    this.error = null;
    cx.notify();

    let ok = false;
    cx.spawn(async (cx) => {
      try {
        const url = await startPRCreate(root, on);
        ok = true;
        if (this.isCurrentRoot(root, on)) {
          this.setNotice(url ? `Created ${url}` : "Created PR", cx);
        }
      } catch (error) {
        if (this.isCurrentRoot(root, on)) {
          this.setError(errorLine(error, "gh pr create failed"), cx);
        }
      } finally {
        if (this.busy === label) this.busy = null;
        cx.notify();
      }
      if (ok) this.refresh(cx, { manual: true });
    });
  },
};

export default githubMethods;
