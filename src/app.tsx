import React, { useCallback, useEffect, useState } from "react";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Branch, Commit, Issue, PR, RepoStatus } from "./types.js";
import { checkoutBranch, getBranches, getHistory, getStatus } from "./git.js";
import { getIssues, getPRs, hasGithubRemote } from "./github.js";
import HistoryPane from "./views/HistoryPane.js";
import GraphPane from "./views/GraphPane.js";
import BranchesPane from "./views/BranchesPane.js";
import PRsPane from "./views/PRsPane.js";
import IssuesPane from "./views/IssuesPane.js";
import StatusPane from "./views/StatusPane.js";

const execFileAsync = promisify(execFile);

function paneError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App({
  repo,
  refreshSecs = 30,
  watch = true,
}: {
  repo: string;
  refreshSecs?: number;
  watch?: boolean;
}) {
  const { exit } = useApp();
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
  const [activePane, setActivePane] = useState(1);
  const [filtering, setFiltering] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selH, setSelH] = useState(0);
  const [selB, setSelB] = useState(0);
  const [selPR, setSelPR] = useState(0);
  const [selIssue, setSelIssue] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [h, b, s, p, i, r] = await Promise.allSettled([
      getHistory(repo, 100),
      getBranches(repo),
      getStatus(repo),
      getPRs(repo),
      getIssues(repo),
      hasGithubRemote(repo),
    ]);
    const errs: Record<string, string> = {};
    if (s.status === "rejected" && paneError(s.reason) === "NOT_A_GIT_REPO") {
      setFatal(`Not a git repository: ${repo}\nRun inside a git checkout or pass --repo <path>, then press q to exit.`);
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
    setPaneErrors(errs);
    setSelH((v) => Math.max(0, v));
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!watch || refreshSecs <= 0) return;
    const t = setInterval(() => void load(), refreshSecs * 1000);
    return () => clearInterval(t);
  }, [load, refreshSecs, watch]);

  useInput((input, key) => {
    if (filtering) {
      if (key.escape) {
        setFiltering(false);
        return;
      }
      if (key.return) {
        setFiltering(false);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) setQuery((q) => q + input);
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
      if (activePane <= 2) setSelH((v) => v + 1);
      else if (activePane === 3) setSelB((v) => Math.min(v + 1, branches.length - 1));
      else if (activePane === 4) setSelPR((v) => Math.min(v + 1, prs.length - 1));
      else if (activePane === 5) setSelIssue((v) => Math.min(v + 1, issues.length - 1));
      return;
    }
    if (input === "k" || key.upArrow) {
      if (activePane <= 2) setSelH((v) => Math.max(0, v - 1));
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
        if (p) execFileAsync("gh", ["pr", "view", "--web", String(p.number)], { cwd: repo }).catch(() => {});
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
  });

  if (fatal) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{fatal}</Text>
        <Text color="gray">q quit · {repo}</Text>
      </Box>
    );
  }

  const border = (n: number) => (activePane === n ? "cyan" : "gray");

  return (
    <Box flexDirection="column" width="100%">
      {loading && commits.length === 0 && !status ? (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Loading {repo}…</Text>
        </Box>
      ) : null}
      <Box flexGrow={2} width="100%">
        <Box flexDirection="column" width="60%">
          <Box borderStyle="single" borderColor={border(1)} flexDirection="column" flexGrow={1}>
            <Text bold color={activePane === 1 ? "cyan" : "white"}>
              1 History{paneErrors.history ? ` — ${paneErrors.history}` : ""}
            </Text>
            {paneErrors.history ? (
              <Text color="red">{paneErrors.history}</Text>
            ) : (
              <HistoryPane commits={commits} selected={selH} query={query} />
            )}
          </Box>
        </Box>
        <Box flexDirection="column" width="40%">
          <Box borderStyle="single" borderColor={border(2)} flexDirection="column" flexGrow={1}>
            <Text bold color={activePane === 2 ? "cyan" : "white"}>
              2 Graph
            </Text>
            <GraphPane commits={commits} selected={selH} query={query} />
          </Box>
        </Box>
      </Box>
      <Box flexGrow={1} width="100%">
        <Box borderStyle="single" borderColor={border(3)} flexDirection="column" flexGrow={1}>
          <Text bold color={activePane === 3 ? "cyan" : "white"}>
            3 Branches{paneErrors.branches ? ` — ${paneErrors.branches}` : ""}
          </Text>
          {paneErrors.branches ? (
            <Text color="red">{paneErrors.branches}</Text>
          ) : (
            <BranchesPane branches={branches} selected={selB} />
          )}
        </Box>
        <Box borderStyle="single" borderColor={border(4)} flexDirection="column" flexGrow={1}>
          <Text bold color={activePane === 4 ? "cyan" : "white"}>
            4 PRs{noRemote && !ghError ? " (no GitHub remote)" : ""}
            {paneErrors.prs ? ` — ${paneErrors.prs}` : ""}
          </Text>
          {paneErrors.prs ? (
            <Text color="red">{paneErrors.prs}</Text>
          ) : (
            <PRsPane prs={prs} selected={selPR} query={query} ghError={ghError} noRemote={noRemote} />
          )}
        </Box>
        <Box borderStyle="single" borderColor={border(5)} flexDirection="column" flexGrow={1}>
          <Text bold color={activePane === 5 ? "cyan" : "white"}>
            5 Issues{noRemote && !ghError ? " (no GitHub remote)" : ""}
            {paneErrors.issues ? ` — ${paneErrors.issues}` : ""}
          </Text>
          {paneErrors.issues ? (
            <Text color="red">{paneErrors.issues}</Text>
          ) : (
            <IssuesPane
              issues={issues}
              selected={selIssue}
              query={query}
              ghError={ghError}
              noRemote={noRemote}
            />
          )}
        </Box>
        <Box borderStyle="single" borderColor={border(6)} flexDirection="column" flexGrow={1}>
          <Text bold color={activePane === 6 ? "cyan" : "white"}>
            6 Status{paneErrors.status ? ` — ${paneErrors.status}` : ""}
          </Text>
          {paneErrors.status ? (
            <Text color="red">{paneErrors.status}</Text>
          ) : (
            <StatusPane status={status} />
          )}
        </Box>
      </Box>
      {filtering ? (
        <Box>
          <Text color="cyan">/{query}</Text>
          <Text color="gray"> (esc/ent done)</Text>
        </Box>
      ) : null}
      {error ? (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <Box>
        <Text color="gray">
          1-6 focus · / filter · r refresh · q quit · {repo}
        </Text>
      </Box>
    </Box>
  );
}
