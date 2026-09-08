#!/usr/bin/env node
// Herdr `[[panes]]` wrapper. Herdr spawns the pane command in the per-pane
// cwd it persisted on the tab (which may be the plugin install dir if the
// tab was opened from a wrong context), so this script resolves the
// workspace's live cwd and chdirs into it before exec'ing the TUI.
//
// Precedence:
//   1. live sibling-pane cwd via `herdr pane list --workspace`
//      (follows the user's shell `cd` with no setup)
//   2. workspace worktree root via `herdr workspace list`
//   3. offline fallback in `repoResolver.ts` (sentinel, nearest .git, cwd)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getWorkspaceCwdSync } from "../herdrWorkspace.js";
import { findNearestGitRepo, resolveRepoPath } from "../repoResolver.js";

const raw = getWorkspaceCwdSync() ?? resolveRepoPath();
const target = findNearestGitRepo(raw) ?? raw;

if (target && target.length > 0 && existsSync(target)) {
  try {
    process.chdir(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`launch-tab: chdir(${target}) failed: ${msg}\n`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "cli.js");
try {
  const out = execFileSync("node", [cli, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.stdout.write(typeof out === "string" ? out : "");
} catch (e) {
  const err = e as { status?: number; signal?: string };
  if (err.signal) process.kill(process.pid, err.signal);
  process.exit(typeof err.status === "number" ? err.status : 1);
}
