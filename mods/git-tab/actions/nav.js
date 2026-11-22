import { TABS, TAB_KEYS } from "../constants.js";
import { clamp } from "../format.js";

export const navMethods = {
  setTab(key, cx) {
    if (!TAB_KEYS.includes(key)) return;
    const changed = this.active !== key;
    this.active = key;
    try {
      localStorage.setItem("git-tab.active", key);
    } catch {
      // storage is optional
    }
    this.view = null;
    this.filterMode = null;
    this.notice = null;
    this.error = null;
    this.detailBlocks = 0;
    if (changed) {
      this.reveal = { pane: key, index: this.safeIndex(key, this.listLength(key)) };
    }
    this.handle.focus();
    this.ensureTabData(cx);
    cx.notify();
  },

  setScope(scope, cx) {
    if (scope !== "repo" && scope !== "mine") return;
    if (scope === this.scope) return;
    if (this.busy) return;
    this.scope = scope;
    try {
      localStorage.setItem("git-tab.scope", scope);
    } catch {
      // storage is optional
    }
    this.view = null;
    this.filterMode = null;
    this.notice = null;
    this.error = null;
    this.detailBlocks = 0;
    this.prs = [];
    this.issues = [];
    this.ghError = null;
    this.sel.prs = 0;
    this.sel.issues = 0;
    this.sel.heatW = null;
    this.sel.heatD = null;
    this.reveal = { pane: this.active, index: 0 };
    this.handle.focus();
    this.refresh(cx, { manual: false });
    cx.notify();
  },

  startFilter(cx) {
    if (this.view || this.busy) return;
    const branch = this.active === "branches";
    this.filterMode = branch ? "branch" : "query";
    if (branch) this.branchInput?.set_value(this.branchFilter);
    else this.queryInput?.set_value(this.query);
    this.handle.focus();
    cx.notify();
    cx.timer.after(30, () => {
      if (branch) this.branchInput?.focus();
      else this.queryInput?.focus();
    });
  },

  endFilter(cx) {
    if (!this.filterMode) return;
    this.filterMode = null;
    this.handle.focus();
    cx.notify();
  },

  moveSelection(cx, delta) {
    if (this.active === "heatmap") {
      this.moveHeat(cx, 0, delta);
      return;
    }
    const panel = this.active;
    const length = this.listLength(panel);
    if (!length) return;
    const next = clamp(this.safeIndex(panel, length) + delta, 0, length - 1);
    this.sel[panel] = next;
    this.reveal = { pane: panel, index: next };
    this.handle.focus();
    cx.notify();
  },

  moveHeat(cx, weeks, days) {
    const count = this.heatWeekCount || this.heatmapData().weeks.length;
    if (!count) return;
    const week = Number.isFinite(this.heatWeekIndex) ? this.heatWeekIndex : count - 1;
    const day = Number.isFinite(this.heatDayIndex) ? this.heatDayIndex : new Date().getDay();
    this.sel.heatW = clamp(week + weeks, 0, count - 1);
    this.sel.heatD = clamp(day + days, 0, 6);
    this.handle.focus();
    cx.notify();
  },

  moveWeek(cx, delta) {
    if (this.active === "heatmap") this.moveHeat(cx, delta, 0);
  },

  key(event, cx) {
    const key = String(event.key ?? "").toLowerCase();
    const modifiers = event.modifiers ?? {};
    if (modifiers.control || modifiers.platform || modifiers.alt) return;

    if (this.filterMode) {
      if (key === "escape" || key === "enter") {
        cx.stop_propagation();
        this.endFilter(cx);
      }
      return;
    }

    const digit = Number(key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= TABS.length) {
      cx.stop_propagation();
      this.setTab(TABS[digit - 1].id, cx);
      return;
    }

    if (this.view) {
      this.viewKey(key, cx);
      return;
    }

    const handled = this.listKey(key, cx);
    if (handled) cx.stop_propagation();
  },

  viewKey(key, cx) {
    if (key === "escape" || key === "q") {
      this.closeView(cx);
      return true;
    }
    if (this.view.kind === "pr") {
      if (key === "enter" || key === "c") {
        this.checkoutPRFromView(cx);
        return true;
      }
      if (key === "a") {
        this.approvePRFromView(cx);
        return true;
      }
      if (key === "o") {
        this.openPRBrowser(cx);
        return true;
      }
      if (key === "r") {
        this.reloadPR(cx);
        return true;
      }
      if (key === "m") {
        this.setScope(this.scope === "repo" ? "mine" : "repo", cx);
        return true;
      }
    }
    if (this.view.kind === "issue") {
      if (key === "o") {
        this.openIssueBrowser(cx);
        return true;
      }
      if (key === "r") {
        this.reloadIssue(cx);
        return true;
      }
      if (key === "m") {
        this.setScope(this.scope === "repo" ? "mine" : "repo", cx);
        return true;
      }
    }
    if (key === "j" || key === "down") {
      this.detailScrollBy(cx, 1);
      return true;
    }
    if (key === "k" || key === "up") {
      this.detailScrollBy(cx, -1);
      return true;
    }
    return false;
  },

  listKey(key, cx) {
    if (key === "j" || key === "down") {
      this.moveSelection(cx, 1);
      return true;
    }
    if (key === "k" || key === "up") {
      this.moveSelection(cx, -1);
      return true;
    }
    if (key === "h" || key === "left") {
      this.moveWeek(cx, -1);
      return true;
    }
    if (key === "l" || key === "right") {
      this.moveWeek(cx, 1);
      return true;
    }
    if (key === "/" || key === "slash" || key === "divide") {
      this.startFilter(cx);
      return true;
    }
    if (key === "m") {
      this.setScope(this.scope === "repo" ? "mine" : "repo", cx);
      return true;
    }
    if (key === "r") {
      if (!this.busy) this.refresh(cx, { manual: true, force: true });
      return true;
    }
    if (key === "enter" || key === "return") {
      this.activateSelection(cx);
      return true;
    }
    if (key === "d") {
      this.diffSelection(cx);
      return true;
    }
    if (key === "c") {
      if (this.active === "prs") this.createPR(cx);
      return true;
    }
    return false;
  },

  closeView(cx) {
    if (!this.view) return;
    this.view = null;
    this.detailBlocks = 0;
    this.reveal = { pane: this.active, index: this.safeIndex(this.active, this.listLength(this.active)) };
    this.handle.focus();
    cx.notify();
  },

  detailScrollBy(cx, delta) {
    if (!this.view) return;
    const max =
      this.view.kind === "diff"
        ? Math.max(0, (this.view.lines?.length ?? 1) - 1)
        : Math.max(0, this.detailBlocks - 1);
    this.view.scroll = clamp((this.view.scroll ?? 0) + delta, 0, max);
    this.reveal = { pane: this.view.kind === "diff" ? "diff" : "detail", index: this.view.scroll };
    cx.notify();
  },
};

export default navMethods;
