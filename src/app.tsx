import React, { useCallback, useEffect, useRef, useState } from "react";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import type { Key } from "ink";
import Spinner from "ink-spinner";
import type { Branch, Commit, Issue, PR, RepoStats, RepoStatus } from "./types.js";
import { checkoutBranch, getBranches, getHistory, getMergedBranches, getRepoStats, getStatus } from "./git.js";
import { buildBranchHierarchy } from "./branchHierarchy.js";
import { getIssues, getPRs, hasGithubRemote } from "./github.js";
import { defaultShellCwdFile, findNearestGitRepo, readShellCwdFile } from "./repoResolver.js";
import { getWorkspaceCwd } from "./herdrWorkspace.js";
import { createPipeParser } from "./pipeInput.js";
import { terminalWidth, truncateToWidth } from "./width.js";
import {
  MOUSE_DISABLE,
  MOUSE_ENABLE,
  createMouseParser,
  rowIndexAt,
  tabRanges,
  type MouseEvent,
} from "./mouse.js";
import TabBar from "./views/TabBar.js";
import HistoryPanel, { historyVisibleRows } from "./views/HistoryPanel.js";
import FlowPanel, { flowVisibleRows } from "./views/FlowPanel.js";
import BranchesPanel, { filterBranches } from "./views/BranchesPanel.js";
import PRsPanel, { filterPRs } from "./views/PRsPanel.js";
import IssuesPanel, { filterIssues } from "./views/IssuesPanel.js";
import StatusPanel from "./views/StatusPanel.js";

const execFileAsync = promisify(execFile);

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
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
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
  const [selH, setSelH] = useState(0);
  const [selB, setSelB] = useState(0);
  const [selPR, setSelPR] = useState(0);
  const [selIssue, setSelIssue] = useState(0);
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

  const load = useCallback(async () => {
    // Re-resolve first so the closure sees the freshest cwd before any work.
    const target = await resolveLiveRepo(repo);
    if (target !== repo) {
      setRepo(target);
      // The effect-driven reload after `repo` settles will pick up the new
      // path. Bail to avoid racing two loads against the same state batch.
      return;
    }
    setLoading(true);
    const [h, b, s, p, i, r, st] = await Promise.allSettled([
      getHistory(target, 100),
      getBranches(target),
      getStatus(target),
      getPRs(target),
      getIssues(target),
      hasGithubRemote(target),
      getRepoStats(target),
    ]);
    const errs: Record<string, string> = {};
    if (s.status === "rejected" && paneError(s.reason) === "NOT_A_GIT_REPO") {
      setFatal(
        `Not a git repository: ${target}\ncd into a git checkout and the tab follows automatically, or pass --repo <path>, then press q to exit.`,
      );
      setLoading(false);
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
  }, [repo, resolveLiveRepo]);

  // Reset per-pane selection + filters when the repo flips. Without this the
  // old branch/PR indices can land out of range in the new repo.
  useEffect(() => {
    setSelH(0);
    setSelB(0);
    setSelPR(0);
    setSelIssue(0);
    setQuery("");
    setBranchFilter("");
  }, [repo]);

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
  // Named so both Ink's raw-mode input and the pipe reader below share it.
  const handleKeyInput = (input: string, key: Key) => {
    // Mouse-reporting ghosts: click/wheel bytes Ink's key decoder doesn't
    // understand (the pipe decoder swallows them; raw mode can't intercept,
    // so the distinctive shapes are dropped here before they type anything).
    if (/^\[<\d+;\d+;\d+[Mm]$/.test(input) || /^\[M[\s\S]{3}$/.test(input)) return;
    if (filtering) {
      if (key.escape) {
        setFiltering(false);
        if (activePane === 3) setBranchFilter("");
        return;
      }
      if (key.return) {
        setFiltering(false);
        return;
      }
      if (key.backspace || key.delete) {
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
    if (input >= "1" && input <= "6") {
      setActivePane(Number(input));
      return;
    }
    if (input === "q") {
      exit();
      return;
    }
    if (input === "r") {
      void load();
      return;
    }
    if (input === "/") {
      setFiltering(true);
      return;
    }
    if (input === "j" || key.downArrow) {
      if (activePane === 1 || activePane === 2) setSelH((v) => v + 1);
      else if (activePane === 3) setSelB((v) => Math.min(v + 1, branches.length - 1));
      else if (activePane === 4) setSelPR((v) => Math.min(v + 1, prs.length - 1));
      else if (activePane === 5) setSelIssue((v) => Math.min(v + 1, issues.length - 1));
      return;
    }
    if (input === "k" || key.upArrow) {
      if (activePane === 1 || activePane === 2) setSelH((v) => Math.max(0, v - 1));
      else if (activePane === 3) setSelB((v) => Math.max(0, v - 1));
      else if (activePane === 4) setSelPR((v) => Math.max(0, v - 1));
      else if (activePane === 5) setSelIssue((v) => Math.max(0, v - 1));
      return;
    }
    if (key.return) {
      if (activePane === 3) {
        const b = branches[selB];
        if (b && !b.name.startsWith("remotes/") && b.name !== "(detached)") {
          checkoutBranch(repo, b.name)
            .then(() => void load())
            .catch((e: unknown) => setError(paneError(e)));
        }
        return;
      }
      if (activePane === 4) {
        const p = prs[selPR];
        if (p)
          execFileAsync("gh", ["pr", "view", "--web", String(p.number)], { cwd: repo }).catch(
            () => {},
          );
        return;
      }
      if (activePane === 5) {
        const iss = issues[selIssue];
        if (iss)
          execFileAsync("gh", ["issue", "view", "--web", String(iss.number)], { cwd: repo }).catch(
            () => {},
          );
        return;
      }
    }
  };

  useInput(handleKeyInput, { isActive: isRawModeSupported === true });

  // Piped stdin (Herdr panes) has no raw mode, so Ink's useInput stays off
  // and keypresses are decoded from `data` events instead. A ref mirrors the
  // latest handler so the subscription is installed once.
  const keyHandlerRef = useRef(handleKeyInput);
  keyHandlerRef.current = handleKeyInput;
  useEffect(() => {
    if (isRawModeSupported) return;
    const parser = createPipeParser();
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    const onData = (data: string) => {
      for (const press of parser.push(data)) {
        if (press.key.ctrl && press.input === "c") {
          exit();
          return;
        }
        keyHandlerRef.current(press.input, press.key);
      }
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
    };
  }, [isRawModeSupported, exit]);

  // Mouse: left-click the tab strip or a row to select it, wheel to move the
  // selection. Geometry mirrors the render tree: optional loading line, the
  // bordered tab strip (3 rows: top border, labels, bottom border), one blank
  // padding row, then content rows (each exactly one visual row for history —
  // see width.ts), so terminal cells map deterministically.
  const TAB_STRIP_HEIGHT = 3;
  const handleMouseInput = (m: MouseEvent) => {
    if (m.button === "wheel-up" || m.button === "wheel-down") {
      const d = m.button === "wheel-up" ? -1 : 1;
      if (activePane === 1 || activePane === 2) setSelH((v) => Math.max(0, v + d));
      else if (activePane === 3)
        setSelB((v) => Math.min(Math.max(0, v + d), branches.length - 1));
      else if (activePane === 4)
        setSelPR((v) => Math.min(Math.max(0, v + d), prs.length - 1));
      else if (activePane === 5)
        setSelIssue((v) => Math.min(Math.max(0, v + d), issues.length - 1));
      return;
    }
    if (m.button !== "left") return;
    const loadingLine = loading && commits.length === 0 && !status;
    const tabbarY = loadingLine ? 2 : 1;
    if (m.y >= tabbarY && m.y < tabbarY + TAB_STRIP_HEIGHT) {
      const hit = tabRanges().find((t) => m.x >= t.x0 && m.x <= t.x1);
      if (hit) setActivePane(hit.id);
      return;
    }
    if (m.x < 2 || m.x > width) return;
    const dy = m.y - (tabbarY + TAB_STRIP_HEIGHT + 1);
    if (dy < 0) return;
    if (activePane === 1) {
      const { rows, start } = historyVisibleRows(commits, query, selH);
      const k = rowIndexAt(
        dy,
        rows.map(() => 1),
      );
      if (k !== null) setSelH(start + k);
    } else if (activePane === 2) {
      const { view, start } = flowVisibleRows(commits, branches, prs, query, mergedNames, selH);
      const k = rowIndexAt(
        dy,
        view.map((r) => (r.isMain ? 1 : 2)),
      );
      if (k !== null) setSelH(start + k);
    } else if (activePane === 3) {
      const shown = filterBranches(branches, branchFilter).slice(0, 30);
      const k = rowIndexAt(
        dy,
        shown.map(() => 1),
      );
      if (k !== null) setSelB(k);
    } else if (activePane === 4) {
      const shown = filterPRs(prs, query).slice(0, 30);
      const k = rowIndexAt(
        dy,
        shown.map(() => 2),
      );
      if (k !== null) setSelPR(k);
    } else if (activePane === 5) {
      const shown = filterIssues(issues, query).slice(0, 20);
      const k = rowIndexAt(
        dy,
        shown.map(() => 3),
      );
      if (k !== null) setSelIssue(k);
    }
  };

  // Opt the terminal into click/wheel reporting (SGR mode). Restored on exit
  // so the surrounding shell keeps normal selection behavior. Unsupported
  // terminals ignore the codes and nothing changes for them.
  useEffect(() => {
    if (!process.stdout.isTTY) return;
    process.stdout.write(MOUSE_ENABLE);
    return () => {
      process.stdout.write(MOUSE_DISABLE);
    };
  }, []);

  // Mouse bytes share stdin with keys in both raw and pipe modes; the mouse
  // decoder only reacts to click/wheel sequences and ignores the rest.
  const mouseHandlerRef = useRef(handleMouseInput);
  mouseHandlerRef.current = handleMouseInput;
  useEffect(() => {
    const parser = createMouseParser();
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    const onData = (data: string) => {
      for (const ev of parser.push(data)) {
        if (ev.pressed) mouseHandlerRef.current(ev);
      }
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
    };
  }, []);

  const width = terminalWidth();
  if (fatal) {
    return (
      <Box flexDirection="column" padding={1}>
        {fatal.split("\n").map((line, i) => (
          <Text key={i} color={i === 0 ? "red" : "gray"}>
            {truncateToWidth(line, width)}
          </Text>
        ))}
        <Text color="gray">{truncateToWidth(`q quit · ${repo}`, width)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {loading && commits.length === 0 && !status ? (
        <Box paddingX={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {truncateToWidth(`Loading ${repo}…`, width)}</Text>
        </Box>
      ) : null}
      <Box paddingX={1}>
        <TabBar active={activePane} />
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {activePane === 1 && (
          <HistoryPanel commits={commits} selected={selH} query={query} />
        )}
        {activePane === 2 && (
          <FlowPanel commits={commits} branches={branches} prs={prs} selected={selH} query={query} mergedNames={mergedNames} />
        )}
        {activePane === 3 && (
          <BranchesPanel
            branches={branches}
            selected={selB}
            filter={branchFilter}
            error={paneErrors.branches}
          />
        )}
        {activePane === 4 && (
          <PRsPanel
            prs={prs}
            selected={selPR}
            query={query}
            ghError={ghError}
            noRemote={noRemote}
            error={paneErrors.prs}
          />
        )}
        {activePane === 5 && (
          <IssuesPanel
            issues={issues}
            selected={selIssue}
            query={query}
            ghError={ghError}
            noRemote={noRemote}
            error={paneErrors.issues}
          />
        )}
        {activePane === 6 && <StatusPanel status={status} error={paneErrors.status} stats={repoStats} />}
      </Box>
      {filtering ? (
        <Box paddingX={1}>
          <Text color="cyan">
            /{truncateToWidth(activePane === 3 ? branchFilter : query, Math.max(8, width - 16))}
          </Text>
          <Text color="gray"> (esc/ent done)</Text>
        </Box>
      ) : null}
      {error ? (
        <Box paddingX={1}>
          <Text color="red">{truncateToWidth(error, width)}</Text>
        </Box>
      ) : null}
      <Box paddingX={1}>
        <Text color="gray">
          {truncateToWidth(`1-6 focus · / filter · r refresh · q quit · ${repo}${fixedRepo ? "" : " (auto)"}`, width)}
        </Text>
      </Box>
    </Box>
  );
}

function paneError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}