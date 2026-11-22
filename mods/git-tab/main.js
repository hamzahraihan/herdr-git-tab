// A git + GitHub workspace panel: history, branch flow, branches, PRs, issues,
// working tree, and a contribution heatmap. It follows the focused space's
// folder and runs git/gh on that space's machine.
//
// The app reads main.js, mod.json and every module next to them. Render methods
// live in views.js; loading, key handling and the shell are separate files so
// each can be read on its own.

import { View } from "gpui-kit";
import { ScrollHandle, InputState } from "gpui-base";
import { checking, props } from "herdr";
import { TABS } from "./constants.js";
import { shellMethods } from "./shell.js";
import { dataMethods } from "./data.js";
import { actionMethods } from "./actions.js";
import viewMethods from "./views.js";

const tabFromStorage = () => {
  try {
    const saved = localStorage.getItem("git-tab.active");
    return TABS.some((tab) => tab.id === saved) ? saved : "commits";
  } catch {
    return "commits";
  }
};

const scopeFromStorage = () => {
  try {
    return localStorage.getItem("git-tab.scope") === "mine" ? "mine" : "repo";
  } catch {
    return "repo";
  }
};

class GitTab extends View {
  init(_props, cx) {
    this.scope = scopeFromStorage();
    this.query = "";
    this.branchFilter = "";
    this.filterMode = null;

    this.root = null;
    this.on = null;
    this.currentFolder = "";
    this.locationKey = null;
    this.fixed = null;
    const propsValue = props() ?? {};
    if (propsValue.folder) {
      this.fixed = {
        cwd: String(propsValue.folder),
        on: propsValue.machine ?? null,
      };
    }

    this.commits = [];
    this.branches = [];
    this.status = null;
    this.prs = [];
    this.issues = [];
    this.stats = null;
    this.heatEntries = [];
    this.user = "";
    this.mergedNames = new Set();

    this.statsLoaded = false;
    this.heatLoaded = false;
    this.mergedLoadedFor = null;
    this.statsLoading = false;
    this.heatLoading = false;
    this.mergedLoading = false;
    this.statsLoadId = 0;
    this.heatLoadId = 0;

    this.loadedOnce = false;
    this.loading = false;
    this.busy = null;
    this.fatal = null;
    this.paneErrors = {};
    this.ghError = null;
    this.noRemote = false;
    this.notice = null;
    this.error = null;
    this.pendingRefresh = null;

    this.generation = 0;
    this.watchGeneration = 0;
    this.watch = null;
    this.pendingFollow = false;
    this.noticeToken = 0;
    this.detailBlocks = 0;
    this.heatWeekIndex = 0;
    this.heatDayIndex = 0;
    this.heatWeekCount = 0;

    this.sel = {
      commits: 0,
      flow: 0,
      branches: 0,
      prs: 0,
      issues: 0,
      status: 0,
      heatW: null,
      heatD: null,
    };
    this.reveal = null;
    this.view = null;
    this.width = 0;
    this.height = 0;

    this.handle = cx.focus_handle();
    this.scrolls = {};
    for (const key of ["commits", "flow", "branches", "prs", "issues", "status"]) {
      this.scrolls[key] = ScrollHandle.new();
    }
    this.detailScroll = ScrollHandle.new();
    this.diffScroll = ScrollHandle.new();

    if (checking()) {
      this.root = this.fixed?.cwd ?? null;
      this.on = this.fixed?.on ?? null;
      return;
    }

    this.queryInput = InputState.new({ placeholder: "Filter commits, PRs, issues…" });
    this.queryInput.on("change", (_event, cx) => {
      if (this.filterMode !== "query") return;
      this.query = this.queryInput.value();
      this.sel.commits = 0;
      this.sel.flow = 0;
      this.sel.prs = 0;
      this.sel.issues = 0;
      this.reveal = { pane: this.active, index: 0 };
      cx.notify();
    });
    this.queryInput.on("submit", (_event, cx) => this.endFilter(cx));
    this.queryInput.on("blur", (_event, cx) => {
      if (this.filterMode === "query") {
        this.filterMode = null;
        cx.notify();
      }
    });

    this.branchInput = InputState.new({ placeholder: "Filter branches…" });
    this.branchInput.on("change", (_event, cx) => {
      if (this.filterMode !== "branch") return;
      this.branchFilter = this.branchInput.value();
      this.sel.branches = 0;
      this.reveal = { pane: "branches", index: 0 };
      cx.notify();
    });
    this.branchInput.on("submit", (_event, cx) => this.endFilter(cx));
    this.branchInput.on("blur", (_event, cx) => {
      if (this.filterMode === "branch") {
        this.filterMode = null;
        cx.notify();
      }
    });

    this.start(cx);
  }
}

Object.assign(GitTab.prototype, shellMethods, dataMethods, actionMethods, viewMethods);

export default GitTab;
