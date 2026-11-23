// Live repo resolution and the panel lifecycle.
// The panel follows the active space's focused terminal folder.

import { focused, home, nextCommand, panes, spaces, watchFolder } from "herdr";

import { TAB_KEYS } from "../constants.js";
import { isInside } from "../format.js";
import { buildHeatmapData, heatmapWeeks } from "../heatmap.js";
import { statusPaths } from "../git.js";
import { buildBranchHierarchy } from "../hierarchy.js";

export function contextKey(on, cwd) {
  return `${on ?? ""}|${cwd ?? ""}`;
}

export const locationMethods = {
  start(cx) {
    this.handle.focus();
    cx.timer.after(120, () => this.handle.focus());

    cx.timer.every(5000, (cx) => {
      if (!this.fixed) this.follow(cx);
    });

    cx.timer.every(30000, (cx) => {
      if (this.loading || this.busy || this.filterMode) return;
      this.refresh(cx, { manual: false });
    });

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") this.handle.focus();
        else if (command === "refresh") this.refresh(cx, { manual: true, force: true });
        else if (command === "filter") this.startFilter(cx);
        else if (command === "scope") this.setScope(this.scope === "repo" ? "mine" : "repo", cx);
        else if (TAB_KEYS.includes(command)) this.setTab(command, cx);
        cx.notify();
      }
    });

    this.refresh(cx, { manual: true, force: true });
  },

  /** Read the active space's focused terminal, else its own folder. */
  location() {
    const all = spaces();
    const f = focused();
    const space =
      all.find((candidate) => candidate.active) ??
      all.find((candidate) => candidate.id === f?.space) ??
      null;
    const pane = f?.pane ? panes().find((candidate) => candidate.pane === f.pane) : null;
    let on = space?.machine ?? null;
    let cwd = pane?.cwd ?? "";

    if (f && f.pane === null) {
      on = f.terminal?.includes("/") ? f.terminal.split("/")[0] : null;
      cwd = f.cwd ?? cwd;
    }
    if (!cwd) cwd = space?.folder ?? "";
    if (!cwd && !on && space) cwd = home();

    return { cwd, on, space: space?.id ?? null };
  },

  /** Follow folder changes without losing the current repository on a cd outside one. */
  follow(cx) {
    if (this.fixed) return;
    const loc = this.location();
    if (!loc.cwd) return;
    const key = contextKey(loc.on, loc.cwd);
    if (key === this.locationKey) return;
    if (this.loading) {
      this.pendingFollow = true;
      return;
    }
    if (
      this.root &&
      (loc.on ?? null) === (this.on ?? null) &&
      isInside(loc.cwd, this.root)
    ) {
      this.locationKey = key;
      this.currentFolder = loc.cwd;
      return;
    }
    this.refresh(cx, { manual: false });
  },

  watchRoot(cx) {
    const generation = ++this.watchGeneration;
    if (this.watch?.cancel) {
      try {
        this.watch.cancel();
      } catch {
        // already settled
      }
    }
    this.watch = null;
    const root = this.root;
    if (!root || this.on) return;

    cx.spawn(async (cx) => {
      while (this.watchGeneration === generation && this.root === root) {
        let watcher;
        try {
          watcher = watchFolder(root);
        } catch {
          break;
        }
        this.watch = watcher;
        try {
          await watcher;
        } catch {
          break;
        }
        if (this.watchGeneration !== generation || this.root !== root) break;
        this.watch = null;
        await cx.sleep(350);
        if (this.watchGeneration !== generation || this.root !== root) break;
        this.refresh(cx, { manual: false });
      }
    });
  },

  currentBranch() {
    return this.branches.find((branch) => branch.current)?.name ?? this.status?.branch ?? null;
  },

  currentUpstream() {
    return this.branches.find((branch) => branch.current)?.upstream;
  },

  changeCount() {
    return this.status ? statusPaths(this.status).length : 0;
  },

  trunkName() {
    const rows = buildBranchHierarchy(
      this.commits,
      this.branches,
      this.prs,
      this.currentBranch(),
    ).rows;
    return rows.find((row) => row.isMain)?.name ?? null;
  },

  heatmapFilter() {
    const query = this.query.trim();
    if (query) return query;
    if (this.scope === "mine") return this.user || "\u0000";
    return "";
  },

  heatmapData() {
    return buildHeatmapData(this.heatEntries, {
      numWeeks: heatmapWeeks(this.width),
      today: new Date(),
      filterQuery: this.heatmapFilter(),
    });
  },

  isCurrentRoot(root, on) {
    return this.root === root && (this.on ?? null) === (on ?? null);
  },

  setNotice(text, cx) {
    this.notice = text;
    this.error = null;
    const token = ++this.noticeToken;
    cx.notify();
    cx.timer.after(6000, (cx) => {
      if (token !== this.noticeToken) return;
      this.notice = null;
      cx.notify();
    });
  },

  setError(text, cx) {
    this.noticeToken++;
    this.notice = null;
    this.error = text;
    cx.notify();
  },
};

export default locationMethods;
