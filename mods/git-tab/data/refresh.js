import { checking } from "herdr";

import { firstLine, isInside, messageOf } from "../format.js";
import {
  getBranches,
  getCommitHeatmap,
  getCurrentUser,
  getHistory,
  getRefFingerprint,
  getRepoStats,
  getStatus,
  gitTop,
  githubRemote,
  isGitUnavailable,
} from "../git.js";
import { contextKey } from "./location.js";

function errorLine(error, fallback) {
  return firstLine(messageOf(error), fallback);
}

function stripPrefix(text) {
  return String(text ?? "").replace(/^(GH|GIT)_UNAVAILABLE:\s*/, "");
}

export const refreshMethods = {
  resetData() {
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
    this.statsLoadId++;
    this.heatLoadId++;
    this.ghLoadedFor = null;
    this.ghLoadedAt = null;
    this.ghLoading = false;
    this.ghDeadFor = null;
    this.ghLoadId++;
    this.lastRefFingerprint = null;

    this.loadedOnce = false;
    this.busy = null;
    this.paneErrors = {};
    this.ghError = null;
    this.noRemote = false;
    this.notice = null;
    this.error = null;
    this.pendingRefresh = null;
    this.pendingFollow = false;

    this.query = "";
    this.branchFilter = "";
    this.filterMode = null;
    this.view = null;

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

    this.generation++;
  },

  showFatal(title, detail, folder, cx) {
    this.root = null;
    this.on = null;
    this.resetData();
    this.fatal = { title, detail, folder };
    this.currentFolder = folder;
    cx.notify();
  },

  refresh(cx, options = {}) {
    if (checking()) return;
    const manual = Boolean(options.manual);
    const force = Boolean(options.force);
    if (this.loading) {
      this.pendingRefresh = {
        manual: manual || Boolean(this.pendingRefresh?.manual),
        force: force || Boolean(this.pendingRefresh?.force),
      };
      return;
    }

    const loc = this.fixed ?? this.location();
    if (!loc.cwd) {
      this.showFatal("No folder", "Focus a space with a folder, or give this mod a folder prop.", "", cx);
      return;
    }
    const key = contextKey(loc.on, loc.cwd);
    this.currentFolder = loc.cwd;
    this.locationKey = key;
    this.loading = true;
    if (manual) this.error = null;

    cx.spawn(async (cx) => {
      try {
        const startGeneration = this.generation;
        let root = this.root;
        let on = this.on ?? null;
        const wantedOn = loc.on ?? null;

        if (!root || force || on !== wantedOn || !isInside(loc.cwd, root)) {
          let top = null;
          try {
            top = await gitTop(loc.cwd, wantedOn);
          } catch (error) {
            if (this.generation !== startGeneration) return;
            if (!root) {
              this.showFatal(
                isGitUnavailable(error) ? "Git unavailable" : "Cannot read this folder",
                stripPrefix(errorLine(error, "git failed")),
                loc.cwd,
                cx,
              );
              return;
            }
            this.paneErrors.commits = stripPrefix(errorLine(error, "git failed"));
            return;
          }
          if (this.generation !== startGeneration) return;
          if (top) {
            root = top;
            on = wantedOn;
          } else if (!root) {
            this.showFatal(
              "Not a git repository",
              "Focus a terminal inside a git checkout; this panel follows the active space's folder.",
              loc.cwd,
              cx,
            );
            return;
          }
        }

        if (!root) {
          this.showFatal(
            "Not a git repository",
            "Focus a terminal inside a git checkout; this panel follows the active space's folder.",
            loc.cwd,
            cx,
          );
          return;
        }

        if (root !== this.root || (on ?? null) !== (this.on ?? null)) {
          this.root = root;
          this.on = on;
          this.resetData();
          this.currentFolder = loc.cwd;
          this.locationKey = key;
          this.watchRoot(cx);
        }

        const generation = this.generation;
        this.fatal = null;
        const wantStats = manual || this.active === "status" || !this.statsLoaded;
        const wantHeat = manual || this.active === "heatmap" || !this.heatLoaded;

        // Staleness gate: one in-memory for-each-ref probe, no history walk.
        // On a periodic refresh, if no ref moved, only the working tree can
        // have changed — re-read just the status and keep the cached history,
        // branches, stats and heatmap.
        let stamp = null;
        try {
          stamp = await getRefFingerprint(root, on);
        } catch {
          // probe unavailable — fall back to a full refresh
        }
        if (this.generation !== generation) return;
        const light =
          !manual &&
          stamp !== null &&
          stamp === this.lastRefFingerprint &&
          this.loadedOnce;

        if (!light) {
          const settled = await Promise.allSettled([
            getHistory(root, on),
            getBranches(root, on),
            getStatus(root, on),
            getCurrentUser(root, on),
            githubRemote(root, on),
            wantStats ? getRepoStats(root, on) : Promise.resolve(null),
            wantHeat ? getCommitHeatmap(root, on) : Promise.resolve(null),
          ]);
          if (this.generation !== generation) return;

          if (settled[0].status === "fulfilled") {
            this.commits = settled[0].value;
            this.paneErrors.commits = null;
          } else {
            this.paneErrors.commits = stripPrefix(errorLine(settled[0].reason, "git log failed"));
          }
          if (settled[1].status === "fulfilled") {
            this.branches = settled[1].value;
            this.paneErrors.branches = null;
          } else {
            this.paneErrors.branches = stripPrefix(errorLine(settled[1].reason, "git branch failed"));
          }
          if (settled[2].status === "fulfilled") {
            this.status = settled[2].value;
            this.paneErrors.status = null;
          } else {
            this.paneErrors.status = stripPrefix(errorLine(settled[2].reason, "git status failed"));
          }
          if (settled[3].status === "fulfilled") this.user = settled[3].value ?? "";
          if (settled[5].status === "fulfilled" && settled[5].value) {
            this.stats = settled[5].value;
            this.statsLoaded = true;
            this.paneErrors.stats = null;
          } else if (settled[5].status === "rejected") {
            this.paneErrors.stats = stripPrefix(errorLine(settled[5].reason, "git stats failed"));
            this.statsLoaded = false;
          }
          if (settled[6].status === "fulfilled" && settled[6].value) {
            this.heatEntries = settled[6].value;
            this.heatLoaded = true;
            this.paneErrors.heatmap = null;
          } else if (settled[6].status === "rejected") {
            this.paneErrors.heatmap = stripPrefix(errorLine(settled[6].reason, "git log failed"));
            this.heatLoaded = false;
          }
          if (settled[4].status === "fulfilled") this.noRemote = !settled[4].value;
        } else {
          const settled = await Promise.allSettled([getStatus(root, on), githubRemote(root, on)]);
          if (this.generation !== generation) return;
          if (settled[0].status === "fulfilled") {
            this.status = settled[0].value;
            this.paneErrors.status = null;
          } else {
            this.paneErrors.status = stripPrefix(errorLine(settled[0].reason, "git status failed"));
          }
          if (settled[1].status === "fulfilled") this.noRemote = !settled[1].value;
        }
        if (stamp !== null) this.lastRefFingerprint = stamp;

        this.loadedOnce = true;
        this.clampSelection();
        if (this.active === "flow" || manual) this.loadMerged(cx, light ? false : true);
        if (manual || this.active === "prs" || this.active === "issues") this.loadGh(cx, manual);
      } catch (error) {
        this.paneErrors.commits = stripPrefix(errorLine(error, "Could not read the repository."));
      } finally {
        this.loading = false;
        this.loadedOnce = this.loadedOnce || Boolean(this.root);
        const pending = this.pendingRefresh;
        this.pendingRefresh = null;
        this.clampSelection();
        cx.notify();
        if (pending) {
          cx.timer.after(50, () => this.refresh(cx, pending));
        }
        if (this.pendingFollow) {
          this.pendingFollow = false;
          cx.timer.after(250, () => this.follow(cx));
        }
      }
    });
  },
};

export default refreshMethods;
