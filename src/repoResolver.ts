// Sync fallback helpers for picking which repo path to target. Kept free of
// React/OpenTUI so it can be unit-tested without rendering.
//
// The live source of truth is the Herdr socket CLI (`herdrWorkspace.ts`):
// sibling-pane cwd, then the workspace worktree root. This module is only the
// offline fallback used at startup and in plain terminals:
//   1. shell-cwd sentinel — legacy HERDR_GIT_TAB_CWD_FILE fallback
//      (kept for back-compat; no setup required anymore)
//   2. nearest git repo  — walk upward from `cwd` looking for .git, so a
//                          plugin pane spawned in the wrong dir still binds
//                          to the user's actual repo
//   3. cwd               — last-resort fallback
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Walk upward from `start` looking for a directory or file named `.git`.
 *  Returns the containing directory on success, `null` if none found before
 *  hitting the filesystem root. */
export function findNearestGitRepo(start: string): string | null {
  let cur = resolve(start);
  while (true) {
    if (existsSync(`${cur}/.git`)) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function defaultShellCwdFile(): string {
  const override = process.env.HERDR_GIT_TAB_CWD_FILE;
  if (override && override.length > 0) return override;
  if (process.platform === "win32") {
    return `${process.env.TEMP ?? process.env.TMP ?? "C:\\Temp"}\\herdr-git-tab-cwd`;
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime && runtime.length > 0) return `${runtime}/herdr-git-tab-cwd`;
  return `${process.env.TMPDIR ?? "/tmp"}/herdr-git-tab-cwd`;
}

/** Read the shell-cwd sentinel file. Returns the trimmed path on success,
 *  `null` if the file is missing, unreadable, or empty. */
export function readShellCwdFile(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function resolveRepoPath(
  cwd: string = process.cwd(),
  shellCwdFile: string | null = defaultShellCwdFile(),
): string {
  const candidates: string[] = [];
  if (shellCwdFile) {
    const fromShell = readShellCwdFile(shellCwdFile);
    if (fromShell) candidates.push(fromShell);
  }
  candidates.push(cwd);
  for (const candidate of candidates) {
    const nearest = findNearestGitRepo(candidate);
    if (nearest) return nearest;
  }
  return candidates[0]!;
}
