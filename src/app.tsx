import React, { useCallback, useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { scrollDelta } from "./doubleClick.js";
import { busyLabel } from "./busyStatus.js";
import type {
  Branch,
  Commit,
  Issue,
  IssueDetail,
  PR,
  PRDetail,
  RepoStats,
  RepoStatus,
  Scope,
} from "./types.js";
import {
  checkoutBranch,
  getBranchDiff,
  getBranches,
  getFileDiff,
  getCommitDetail,
  getHistory,
  getMergedBranches,
  getRepoStats,
  getStatus,
  statusPaths,
} from "./git.js";
import { buildBranchHierarchy } from "./branchHierarchy.js";
import {
  approvePR,
  checkoutPR,
  getIssueDetail,
  getIssues,
  getPRDetail,
  getPRs,
  hasGithubRemote,
  openIssueWeb,
  openPRWeb,
  startPRCreate,
} from "./github.js";
import { defaultShellCwdFile, findNearestGitRepo, readShellCwdFile } from "./repoResolver.js";
import { getWorkspaceCwd } from "./herdrWorkspace.js";
import { cellWidth, terminalWidth, truncateToWidth } from "./width.js";
import { KEYBAR_BG } from "./theme.js";
import HeaderBar from "./views/TabBar.js";
import HistoryPanel, { historyVisibleRows } from "./views/HistoryPanel.js";
import FlowPanel, { flowVisibleRows } from "./views/FlowPanel.js";
import BranchesPanel, { filterBranches } from "./views/BranchesPanel.js";
import PRsPanel, { filterPRs } from "./views/PRsPanel.js";
import IssuesPanel, { filterIssues } from "./views/IssuesPanel.js";
import StatusPanel from "./views/StatusPanel.js";
import PRDetailPanel from "./views/PRDetail.js";
import IssueDetailPanel from "./views/IssueDetail.js";
import DiffView from "./views/DiffView.js";

// Poll interval for following the workspace cwd. Kept short so `cd` in a
// sibling pane repoints the tab within seconds; data refresh stays on the
// slower `refreshSecs` cadence to avoid hammering git/gh.
const REPO_POLL_SECS = 2;

export default function App({
  initialRepo,
  fixedRepo = false,
  refreshSecs = 30,
  watch = true,
}: {
  initialRepo: string;
  fixedRepo?: boolean;
  refreshSecs?: number;
  watch?: boolean;
}) {
  const exit = () => process.exit(0);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [prs, setPrs] = useState<PR[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [paneErrors, setPaneErrors] = useState<Record<string, string>>({});
  const [ghError, setGhError] = useState<string | undefined>();
  const [noRemote, setNoRemote] = useState(false);
  // Branches fully merged into the trunk, for the flow panel's rejoin visual.
  const [mergedNames, setMergedNames] = useState<Set<string>>(new Set());
  // Repo-wide origin/contributor stats for the status panel.
  const [repoStats, setRepoStats] = useState<RepoStats | null>(null);
  const [activePane, setActivePane] = useState(1);
  const [filtering, setFiltering] = useState(false);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selH, setSelH] = useState(0);
  const [selB, setSelB] = useState(0);
  const [selPR, setSelPR] = useState(0);
  const [selIssue, setSelIssue] = useState(0);
  const [selStatus, setSelStatus] = useState(0);
  // `m` toggles list scope: this repo vs everything involving you.
  const [scope, setScope] = useState<Scope>("repo");
  // Detail reader: PR opens description + discussion with an info rail;
  // issues reuse the same reader shape. `diff` is the `d` overlay for
  // branches and changed status files — never launched from PR detail.
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [prDetailLoading, setPrDetailLoading] = useState(false);
  const [prDetailError, setPrDetailError] = useState("");
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [issueDetailLoading, setIssueDetailLoading] = useState(false);
  const [issueDetailError, setIssueDetailError] = useState("");
  const [detailScroll, setDetailScroll] = useState(0);
  const [diff, setDiff] = useState<{ title: string; body: string } | null>(null);
  const [diffScroll, setDiffScroll] = useState(0);
  // In-flight guard preventing double-checkout (`git checkout` / `gh pr checkout`).
  // `busy` drives the footer line; `checkingOut` only gates re-entry while one runs.
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Current repo. Follows the workspace's live shell cwd (via the Herdr
  // socket CLI) so `cd` in a sibling pane repoints the TUI automatically —
  // no manual path entry. `--repo <path>` pins a fixed repo instead.
  const [repo, setRepo] = useState<string>(initialRepo);

  // Live repo resolution. A fixed repo always wins; otherwise the workspace's
  // active shell cwd wins, then the legacy sentinel file. Each candidate is
  // walked up to its enclosing repo so subdirs bind the repo root — and a
  // cwd outside any repo keeps the current repo instead of stranding the tab
  // on the fatal screen (it follows again on the next `cd` into a repo).
  const resolveLiveRepo = useCallback(
    async (current: string): Promise<string> => {
      if (fixedRepo) return current;
      const live = await getWorkspaceCwd();
      if (live) {
        const inRepo = findNearestGitRepo(live);
        if (inRepo) return inRepo;
      }
      const sentinel = readShellCwdFile(defaultShellCwdFile());
      if (sentinel) {
        const inRepo = findNearestGitRepo(sentinel);
        if (inRepo) return inRepo;
      }
      return current;
    },
    [fixedRepo],
  );

  const load = useCallback(async (opts?: { manual?: boolean }) => {
    // Re-resolve first so the closure sees the freshest cwd before any work.
    const target = await resolveLiveRepo(repo);
    if (target !== repo) {
      setRepo(target);
      // The effect-driven reload after `repo` settles will pick up the new
      // path. Bail to avoid racing two loads against the same state batch.
      return;
    }
    if (opts?.manual) setBusy(busyLabel({ kind: "refresh" }));
    setLoading(true);
    const [h, b, s, p, i, r, st] = await Promise.allSettled([
      getHistory(target, 100),
      getBranches(target),
      getStatus(target),
      getPRs(target, scope),
      getIssues(target, scope),
      hasGithubRemote(target),
      getRepoStats(target),
    ]);
    const errs: Record<string, string> = {};
    if (s.status === "rejected" && paneError(s.reason) === "NOT_A_GIT_REPO") {
      setFatal(
        `Not a git repository: ${target}\ncd into a git checkout and the tab follows automatically, or pass --repo <path>, then press q to exit.`,
      );
      setLoading(false);
      if (opts?.manual) setBusy(null);
      return;
    }
    setFatal(null);
    if (h.status === "fulfilled") setCommits(h.value);
    else errs.history = paneError(h.reason);
    if (b.status === "fulfilled") setBranches(b.value);
    else errs.branches = paneError(b.reason);
    if (s.status === "fulfilled") setStatus(s.value);
    else errs.status = paneError((s as PromiseRejectedResult).reason);
    if (p.status === "fulfilled") setPrs(p.value);
    else if (paneError(p.reason).startsWith("GH_UNAVAILABLE")) setGhError(paneError(p.reason));
    else errs.prs = paneError((p as PromiseRejectedResult).reason);
    if (i.status === "fulfilled") setIssues(i.value);
    else if (paneError(i.reason).startsWith("GH_UNAVAILABLE")) setGhError(paneError(i.reason));
    else errs.issues = paneError((i as PromiseRejectedResult).reason);
    if (r.status === "fulfilled") setNoRemote(!r.value);
    if (st.status === "fulfilled") setRepoStats(st.value);
    else setRepoStats(null);
    // Merged-branch marking is best-effort: derive the trunk from the fresh
    // data, ask git which branches it contains, and let the flow panel mark
    // them. Any failure leaves the previous set (usually empty) in place.
    if (h.status === "fulfilled") {
      const branchList = b.status === "fulfilled" ? b.value : [];
      const current = branchList.find((br) => br.current)?.name ?? null;
      const trunk =
        buildBranchHierarchy(h.value, branchList, [], current).rows.find((row) => row.isMain)
          ?.name ?? null;
      if (trunk) {
        try {
          const merged = await getMergedBranches(target, trunk);
          setMergedNames(new Set(merged.filter((name) => name !== trunk)));
        } catch {
          setMergedNames(new Set());
        }
      } else {
        setMergedNames(new Set());
      }
    }
    setLoading(false);
    if (opts?.manual) setBusy(null);
  }, [repo, resolveLiveRepo, scope]);

  // Reset per-pane selection + filters when the repo or scope flips. Without
  // this the old branch/PR indices can land out of range in the new data.
  useEffect(() => {
    setSelH(0);
    setSelB(0);
    setSelPR(0);
    setSelIssue(0);
    setSelStatus(0);
    setQuery("");
    setBranchFilter("");
    setNotice("");
    setPrDetail(null);
    setPrDetailError("");
    setIssueDetail(null);
    setIssueDetailError("");
    setDetailScroll(0);
    setDiff(null);
    setDiffScroll(0);
    setCheckingOut(null);
    setBusy(null);
  }, [repo, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!watch || refreshSecs <= 0) return;
    const t = setInterval(() => void load(), refreshSecs * 1000);
    return () => clearInterval(t);
  }, [load, refreshSecs, watch]);

  // Fast follow poll: re-resolve the workspace cwd every couple of seconds
  // so `cd` next door repoints the tab promptly; the `repo` effect above
  // triggers the reload. Skipped for pinned (`--repo`) tabs.
  useEffect(() => {
    if (!watch || fixedRepo) return;
    const t = setInterval(() => {
      void resolveLiveRepo(repo).then((target) => {
        if (target !== repo) setRepo(target);
      });
    }, REPO_POLL_SECS * 1000);
    return () => clearInterval(t);
  }, [repo, resolveLiveRepo, watch, fixedRepo]);
  const closePRDetail = (): void => {
    setPrDetail(null);
    setPrDetailError("");
    setPrDetailLoading(false);
    setDetailScroll(0);
  };
  const closeIssueDetail = (): void => {
    setIssueDetail(null);
    setIssueDetailError("");
    setIssueDetailLoading(false);
    setDetailScroll(0);
  };
  const openPRDetail = (num: number): void => {
    setFiltering(false);
    setError("");
    setPrDetail(null);
    setPrDetailError("");
    setDetailScroll(0);
    setPrDetailLoading(true);
    setBusy(busyLabel({ kind: "pr", number: num }));
    getPRDetail(repo, num)
      .then((d) => setPrDetail(d))
      .catch((e: unknown) => setPrDetailError(paneError(e)))
      .finally(() => {
        setPrDetailLoading(false);
        setBusy(null);
      });
  };
  const openIssueDetail = (num: number): void => {
    setFiltering(false);
    setError("");
    setIssueDetail(null);
    setIssueDetailError("");
    setDetailScroll(0);
    setIssueDetailLoading(true);
    setBusy(busyLabel({ kind: "issue", number: num }));
    getIssueDetail(repo, num)
      .then((d) => setIssueDetail(d))
      .catch((e: unknown) => setIssueDetailError(paneError(e)))
      .finally(() => {
        setIssueDetailLoading(false);
        setBusy(null);
      });
  };
  const openCommitDetail = (commitOrHash: string | Commit): void => {
    const hash = typeof commitOrHash === "string" ? commitOrHash : commitOrHash.hash;
    const short = typeof commitOrHash === "string" ? commitOrHash.slice(0, 7) : commitOrHash.shortHash;
    const subject = typeof commitOrHash === "string" ? "" : commitOrHash.subject;
    const title = subject ? `commit ${short}: ${subject}` : `commit ${short}`;
    setFiltering(false);
    setError("");
    setDiffScroll(0);
    setBusy(busyLabel({ kind: "commit", short }));
    getCommitDetail(repo, hash)
      .then((body) => setDiff({ title, body }))
      .catch((e: unknown) => setError(paneError(e)))
      .finally(() => setBusy(null));
  };
  const refreshPRDetail = (num: number): void => {
    setPrDetailLoading(true);
    setBusy(busyLabel({ kind: "pr", number: num }));
    getPRDetail(repo, num)
      .then((d) => {
        setPrDetail(d);
        setPrDetailError("");
      })
      .catch((e: unknown) => setPrDetailError(paneError(e)))
      .finally(() => {
        setPrDetailLoading(false);
        setBusy(null);
      });
  };
  const refreshIssueDetail = (num: number): void => {
    setIssueDetailLoading(true);
    setBusy(busyLabel({ kind: "issue", number: num }));
    getIssueDetail(repo, num)
      .then((d) => {
        setIssueDetail(d);
        setIssueDetailError("");
      })
      .catch((e: unknown) => setIssueDetailError(paneError(e)))
      .finally(() => {
        setIssueDetailLoading(false);
        setBusy(null);
      });
  };
  // Single keyboard entry point for OpenTUI's native input (raw + Herdr
  // panes). Mouse is handled natively via onMouseDown/onMouseScroll, so no
  // stdin byte filtering is needed here.
  const handleKeyInput = (input: string, key: KeyEvent) => {
    if (key.ctrl && key.name === "c") {
      exit();
      return;
    }
    if (filtering) {
      if (key.name === "escape") {
        setFiltering(false);
        if (activePane === 3) setBranchFilter("");
        return;
      }
      if (key.name === "return") {
        setFiltering(false);
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        if (activePane === 3) setBranchFilter((q) => q.slice(0, -1));
        else setQuery((q) => q.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        if (activePane === 3) setBranchFilter((q) => q + input);
        else setQuery((q) => q + input);
      }
      return;
    }
    // Diff overlay (`d` for branches / status files) sits on top: scroll it
    // or dismiss it; nothing else runs while it is open.
    if (diff) {
      if (key.name === "escape" || input === "q") {
        setDiff(null);
        setDiffScroll(0);
        return;
      }
      if (input >= "1" && input <= "6") {
        setActivePane(Number(input));
        setDiff(null);
        setDiffScroll(0);
        return;
      }
      if (input === "j" || key.name === "down") {
        setDiffScroll((v) => v + 1);
        return;
      }
      if (input === "k" || key.name === "up") {
        setDiffScroll((v) => Math.max(0, v - 1));
        return;
      }
      return;
    }
    const showingPRDetail =
      activePane === 4 && (prDetail !== null || prDetailLoading || prDetailError !== "");
    const showingIssueDetail =
      activePane === 5 &&
      (issueDetail !== null || issueDetailLoading || issueDetailError !== "");
    // PR detail: read description + discussion, then approve or check out.
    // No merge, ready, or terminal diff commands run from here by design.
    if (showingPRDetail) {
      if (key.name === "escape" || input === "q") {
        closePRDetail();
        return;
      }
      if (input >= "1" && input <= "6") {
        setActivePane(Number(input));
        closePRDetail();
        return;
      }
      if (input === "j" || key.name === "down") {
        setDetailScroll((v) => v + 1);
        return;
      }
      if (input === "k" || key.name === "up") {
        setDetailScroll((v) => Math.max(0, v - 1));
        return;
      }
      if (input === "m") {
        setScope((s) => (s === "repo" ? "mine" : "repo"));
        void load({ manual: true });
        closePRDetail();
        return;
      }
      if (input === "r") {
        const num = prDetail?.number ?? filterPRs(prs, query)[Math.min(selPR, Math.max(0, filterPRs(prs, query).length - 1))]?.number;
        if (num !== undefined) refreshPRDetail(num);
        return;
      }
      if (input === "o") {
        const num = prDetail?.number;
        if (num !== undefined) openPRWeb(repo, num);
        return;
      }
      if (input === "a") {
        const num = prDetail?.number;
        if (num !== undefined) {
          setError("");
          setBusy(busyLabel({ kind: "approve", number: num }));
          approvePR(repo, num)
            .then(() => refreshPRDetail(num))
            .catch((e: unknown) => {
              setError(paneError(e));
              setBusy(null);
            });
        }
        return;
      }
      if (input === "c" || key.name === "return") {
        const num = prDetail?.number;
        if (num !== undefined && !checkingOut) {
          setError("");
          setCheckingOut(`PR #${num}`);
          setBusy(busyLabel({ kind: "checkout-pr", number: num }));
          checkoutPR(repo, num)
            .then(() => void load({ manual: true }))
            .catch((e: unknown) => setError(paneError(e)))
            .finally(() => {
              setCheckingOut(null);
              setBusy(null);
            });
        }
        return;
      }
      // `d` is intentionally a no-op here: PR detail never launches merge,
      // ready, or terminal diff commands.
      return;
    }
    if (showingIssueDetail) {
      if (key.name === "escape" || input === "q") {
        closeIssueDetail();
        return;
      }
      if (input >= "1" && input <= "6") {
        setActivePane(Number(input));
        closeIssueDetail();
        return;
      }
      if (input === "j" || key.name === "down") {
        setDetailScroll((v) => v + 1);
        return;
      }
      if (input === "k" || key.name === "up") {
        setDetailScroll((v) => Math.max(0, v - 1));
        return;
      }
      if (input === "m") {
        setScope((s) => (s === "repo" ? "mine" : "repo"));
        void load({ manual: true });
        closeIssueDetail();
        return;
      }
      if (input === "r") {
        const num =
          issueDetail?.number ??
          filterIssues(issues, query)[Math.min(selIssue, Math.max(0, filterIssues(issues, query).length - 1))]?.number;
        if (num !== undefined) refreshIssueDetail(num);
        return;
      }
      if (input === "o") {
        const num = issueDetail?.number;
        if (num !== undefined) openIssueWeb(repo, num);
        return;
      }
      return;
    }
    if (input >= "1" && input <= "6") {
      setActivePane(Number(input));
      return;
    }
    if (key.name === "escape") return;
    if (input === "q") {
      exit();
      return;
    }
    if (input === "r") {
      setNotice("");
      void load({ manual: true });
      return;
    }
    if (input === "/") {
      setFiltering(true);
      return;
    }
    if (input === "m") {
      setScope((s) => (s === "repo" ? "mine" : "repo"));
      void load({ manual: true });
      return;
    }
    if (input === "j" || key.name === "down") {
      if (activePane === 1 || activePane === 2) setSelH((v) => v + 1);
      else if (activePane === 3) setSelB((v) => Math.min(v + 1, branches.length - 1));
      else if (activePane === 4) setSelPR((v) => Math.min(v + 1, prs.length - 1));
      else if (activePane === 5) setSelIssue((v) => Math.min(v + 1, issues.length - 1));
      else if (activePane === 6) {
        const total = status ? statusPaths(status).length : 0;
        setSelStatus((v) => Math.min(v + 1, Math.max(0, total - 1)));
      }
      return;
    }
    if (input === "k" || key.name === "up") {
      if (activePane === 1 || activePane === 2) setSelH((v) => Math.max(0, v - 1));
      else if (activePane === 3) setSelB((v) => Math.max(0, v - 1));
      else if (activePane === 4) setSelPR((v) => Math.max(0, v - 1));
      else if (activePane === 5) setSelIssue((v) => Math.max(0, v - 1));
      else if (activePane === 6) setSelStatus((v) => Math.max(0, v - 1));
      return;
    }
    if (input === "d") {
      if (activePane === 3) {
        const shown = filterBranches(branches, branchFilter);
        const b = shown[Math.min(selB, Math.max(0, shown.length - 1))];
        if (!b || b.name === "(detached)") {
          setError("nothing to diff");
          return;
        }
        if (b.name.startsWith("remotes/")) {
          setError("remote branch: checkout first to diff");
          return;
        }
        setError("");
        setDiffScroll(0);
        setBusy(busyLabel({ kind: "diff-branch", name: b.name }));
        getBranchDiff(repo, b.name)
          .then((body) => setDiff({ title: `diff ${b.name}`, body }))
          .catch((e: unknown) => setError(paneError(e)))
          .finally(() => setBusy(null));
        return;
      }
      if (activePane === 6) {
        if (!status) {
          setError("nothing to diff");
          return;
        }
        const paths = statusPaths(status);
        const sel = paths[Math.min(selStatus, Math.max(0, paths.length - 1))];
        if (!sel) {
          setError("working tree clean: nothing to diff");
          return;
        }
        if (sel.kind === "untracked") {
          setDiffScroll(0);
          setDiff({ title: `diff ${sel.path}`, body: `(untracked ${sel.path}: no diff)` });
          return;
        }
        setError("");
        setDiffScroll(0);
        setBusy(busyLabel({ kind: "diff-file", path: sel.path }));
        getFileDiff(repo, sel.path)
          .then((body) => setDiff({ title: `diff ${sel.path}`, body }))
          .catch((e: unknown) => setError(paneError(e)))
          .finally(() => setBusy(null));
        return;
      }
      return;
    }
    if (input === "c" && activePane === 4) {
      setError("");
      setBusy(busyLabel({ kind: "create-pr" }));
      setNotice("");
      startPRCreate(repo)
        .then((url) => {
          setNotice(url ? `created ${url}` : "created PR");
          void load({ manual: true });
        })
        .catch((e: unknown) => {
          setNotice("");
          setError(paneError(e));
        })
        .finally(() => setBusy(null));
      return;
    }
    if (key.name === "return") {
      if (activePane === 3) {
        const shown = filterBranches(branches, branchFilter);
        const b = shown[Math.min(selB, Math.max(0, shown.length - 1))] ?? branches[selB];
        if (b && !b.name.startsWith("remotes/") && b.name !== "(detached)" && !checkingOut) {
          setError("");
          setCheckingOut(b.name);
          setBusy(busyLabel({ kind: "checkout-branch", name: b.name }));
          checkoutBranch(repo, b.name)
            .then(() => void load({ manual: true }))
            .catch((e: unknown) => setError(paneError(e)))
            .finally(() => {
              setCheckingOut(null);
              setBusy(null);
            });
        }
        return;
      }
      if (activePane === 4) {
        const shown = filterPRs(prs, query);
        const p = shown[Math.min(selPR, Math.max(0, shown.length - 1))];
        if (p) openPRDetail(p.number);
        return;
      }
      if (activePane === 5) {
        const shown = filterIssues(issues, query);
        const iss = shown[Math.min(selIssue, Math.max(0, shown.length - 1))];
        if (iss) openIssueDetail(iss.number);
        return;
      }
    }
  };

  useKeyboard((key) => {
    handleKeyInput(key.sequence || key.name || "", key);
  });

  const width = terminalWidth();
  if (fatal) {
    return (
      <box flexDirection="column" padding={1}>
        {fatal.split("\n").map((line, i) => (
          <text key={i} fg={i === 0 ? "red" : "gray"}>
            {truncateToWidth(line, width)}
          </text>
        ))}
        <text fg="gray">{truncateToWidth(`q quit · ${repo}`, width)}</text>
      </box>
    );
  }

  const showingPRDetail =
    activePane === 4 && (prDetail !== null || prDetailLoading || prDetailError !== "");
  const showingIssueDetail =
    activePane === 5 &&
    (issueDetail !== null || issueDetailLoading || issueDetailError !== "");
  const scopeLabel = scope === "mine" ? "mine" : "repo";
  let footerHint = `1-6 focus · / filter · m scope:${scopeLabel} · r refresh · q quit · ${repo}${fixedRepo ? "" : " (auto)"}`;
  if (diff) footerHint = `j/k scroll · q/Esc back · ${repo}`;
  else if (showingPRDetail)
    footerHint = `j/k scroll · c/Enter checkout · a approve · o open · r refresh · q/Esc back · ${repo}`;
  else if (showingIssueDetail)
    footerHint = `j/k scroll · o open · r refresh · q/Esc back · ${repo}`;
  else if (activePane === 3)
    footerHint = `Enter checkout · d diff · / filter · m scope:${scopeLabel} · r refresh · q quit · ${repo}${fixedRepo ? "" : " (auto)"}`;
  else if (activePane === 4)
    footerHint = `Enter open · c create · m scope:${scopeLabel} · / filter · r refresh · q quit · ${repo}${fixedRepo ? "" : " (auto)"}`;
  else if (activePane === 6)
    footerHint = `j/k select · d diff · m scope:${scopeLabel} · r refresh · q quit · ${repo}${fixedRepo ? "" : " (auto)"}`;

  return (
    <box flexDirection="column" width="100%">
      {loading && commits.length === 0 && !status ? (
        <box paddingX={1}>
          <text fg="cyan">● </text>
          <text> {truncateToWidth(`Loading ${repo}…`, width)}</text>
        </box>
      ) : null}
      <box paddingX={1}>
        <HeaderBar
          active={activePane}
          repo={repoName(repo)}
          current={branches.find((b) => b.current)?.name ?? null}
          upstream={branches.find((b) => b.current)?.upstream}
          changes={status ? statusPaths(status).length : 0}
          onSelectTab={setActivePane}
        />
      </box>
      <box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {diff ? (
          <DiffView
            title={diff.title}
            body={diff.body}
            scroll={diffScroll}
            onScroll={(d) => setDiffScroll((v) => Math.max(0, v + d))}
          />
        ) : null}
        {!diff && activePane === 1 && (
          <HistoryPanel
            commits={commits}
            selected={selH}
            query={query}
            onSelect={(i) => setSelH(i)}
            onDoubleClick={(c) => openCommitDetail(c)}
          />
        )}
        {!diff && activePane === 2 && (
          <FlowPanel
            commits={commits}
            branches={branches}
            prs={prs}
            selected={selH}
            query={query}
            mergedNames={mergedNames}
            onSelect={(i) => setSelH(i)}
            onDoubleClick={(row) => {
              const hash = row.commits[0];
              if (hash) openCommitDetail(hash);
            }}
          />
        )}
        {!diff && activePane === 3 && (
          <BranchesPanel
            branches={branches}
            selected={selB}
            filter={branchFilter}
            error={paneErrors.branches}
            onSelect={(i) => setSelB(i)}
            onDoubleClick={(b) => {
              if (!b.name.startsWith("remotes/") && b.name !== "(detached)" && !checkingOut) {
                setError("");
                setCheckingOut(b.name);
                setBusy(busyLabel({ kind: "checkout-branch", name: b.name }));
                checkoutBranch(repo, b.name)
                  .then(() => void load({ manual: true }))
                  .catch((e: unknown) => setError(paneError(e)))
                  .finally(() => {
                    setCheckingOut(null);
                    setBusy(null);
                  });
              }
            }}
          />
        )}
        {!diff && activePane === 4 && !showingPRDetail && (
          <PRsPanel
            prs={prs}
            selected={selPR}
            query={query}
            ghError={ghError}
            noRemote={noRemote}
            error={paneErrors.prs}
            onSelect={(i) => setSelPR(i)}
            onDoubleClick={(p) => openPRDetail(p.number)}
          />
        )}
        {!diff && activePane === 4 && showingPRDetail && (
          <box
            flexDirection="column"
            onMouseScroll={(e) => {
              const d = scrollDelta(e);
              if (d !== 0) setDetailScroll((v) => Math.max(0, v + d));
            }}
          >
            {prDetailLoading && !prDetail ? (
              <box>
                <text fg="cyan">● </text>
                <text> Loading PR…</text>
              </box>
            ) : null}
            {prDetailError && !prDetail ? (
              <box flexDirection="column">
                <text fg="red">{truncateToWidth(prDetailError, width)}</text>
                <text fg="gray">r retries · q/Esc back</text>
              </box>
            ) : null}
            {prDetail ? <PRDetailPanel detail={prDetail} scroll={detailScroll} /> : null}
          </box>
        )}
        {!diff && activePane === 5 && !showingIssueDetail && (
          <IssuesPanel
            issues={issues}
            selected={selIssue}
            query={query}
            ghError={ghError}
            noRemote={noRemote}
            error={paneErrors.issues}
            onSelect={(i) => setSelIssue(i)}
            onDoubleClick={(iss) => openIssueDetail(iss.number)}
          />
        )}
        {!diff && activePane === 5 && showingIssueDetail && (
          <box
            flexDirection="column"
            onMouseScroll={(e) => {
              const d = scrollDelta(e);
              if (d !== 0) setDetailScroll((v) => Math.max(0, v + d));
            }}
          >
            {issueDetailLoading && !issueDetail ? (
              <box>
                <text fg="cyan">● </text>
                <text> Loading issue…</text>
              </box>
            ) : null}
            {issueDetailError && !issueDetail ? (
              <box flexDirection="column">
                <text fg="red">{truncateToWidth(issueDetailError, width)}</text>
                <text fg="gray">r retries · q/Esc back</text>
              </box>
            ) : null}
            {issueDetail ? <IssueDetailPanel detail={issueDetail} scroll={detailScroll} /> : null}
          </box>
        )}
        {!diff && activePane === 6 && (
          <StatusPanel
            status={status}
            error={paneErrors.status}
            stats={repoStats}
            selected={selStatus}
            onSelect={(i) => setSelStatus(i)}
            onDoubleClick={(path) => {
              if (!status) return;
              const paths = statusPaths(status);
              const sel = paths.find((p) => p.path === path);
              if (!sel) return;
              if (sel.kind === "untracked") {
                setDiffScroll(0);
                setDiff({ title: `diff ${sel.path}`, body: `(untracked ${sel.path}: no diff)` });
              } else {
                setError("");
                setDiffScroll(0);
                setBusy(busyLabel({ kind: "diff-file", path: sel.path }));
                getFileDiff(repo, sel.path)
                  .then((body) => setDiff({ title: `diff ${sel.path}`, body }))
                  .catch((e: unknown) => setError(paneError(e)))
                  .finally(() => setBusy(null));
              }
            }}
          />
        )}
      </box>
      {filtering ? (
        <box paddingX={1}>
          <text fg="cyan">
            /{truncateToWidth(activePane === 3 ? branchFilter : query, Math.max(8, width - 16))}
          </text>
          <text fg="gray"> (esc/ent done)</text>
        </box>
      ) : null}
      {busy ? (
        <box paddingX={1}>
          <text fg="cyan">● </text>
          <text>{truncateToWidth(busy, width)}</text>
        </box>
      ) : null}
      {notice ? (
        <box paddingX={1}>
          <text fg="green">{truncateToWidth(notice, width)}</text>
        </box>
      ) : null}
      {error ? (
        <box paddingX={1}>
          <text fg="red">{truncateToWidth(error, width)}</text>
        </box>
      ) : null}
      {(prDetailError && prDetail) || (issueDetailError && issueDetail) ? (
        <box paddingX={1}>
          <text fg="red">
            {truncateToWidth((prDetailError || issueDetailError) as string, width)}
          </text>
        </box>
      ) : null}
      <box>
        <KeyBar text={footerHint} width={width} />
      </box>
    </box>
  );
}
function KeyBar({ text, width }: { text: string; width: number }) {
  const label = truncateToWidth(text, Math.max(8, width - 2));
  const fill = " ".repeat(Math.max(0, width - cellWidth(label) - 2));
  return (
    <text bg={KEYBAR_BG} fg="white">
      {` ${label} `}
      {fill}
    </text>
  );
}

function repoName(path: string): string {
  const clean = path.replace(/[/\\]+$/, "");
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function paneError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}