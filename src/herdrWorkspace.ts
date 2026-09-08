// Live workspace-cwd tracking via the Herdr socket CLI.
//
// The TUI runs inside a Herdr-managed pane. Herdr injects the caller's
// context (HERDR_WORKSPACE_ID / HERDR_PANE_ID) and tracks every pane's live
// `cwd`, so the git tab can follow the user's shell `cd` with no hooks or
// manual `:cd` step: on each poll it reads the sibling panes of its own
// workspace and binds to the active one's directory.
//
// `pickWorkspaceCwd` is pure (unit-tested); the `get*` helpers shell out to
// `herdr` and degrade to `null` when the CLI is unavailable (plain terminal),
// letting callers fall back to the sentinel / process.cwd() chain.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HerdrPane {
  pane_id?: string;
  workspace_id?: string;
  cwd?: string;
  focused?: boolean;
}

function herdrBin(): string {
  const fromEnv = process.env.HERDR_BIN_PATH;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return "herdr";
}
export function normalizeHerdrPath(raw: string): string {
  let p = raw.trim().replace(/^\\\\\?\\/, "");
  while (
    p.length > 1 &&
    (p.endsWith("/") || p.endsWith("\\")) &&
    !/^[A-Za-z]:[\\/]$/.test(p)
  ) {
    p = p.slice(0, -1);
  }
  return p;
}

/** Pick the directory this tab should bind to: the focused sibling pane's
 *  cwd, else the first sibling with a cwd. The tab's own pane is excluded —
 *  its cwd is frozen at spawn (usually the plugin install dir). Returns
 *  `null` when no sibling reports a directory. */
export function pickWorkspaceCwd(
  panes: HerdrPane[],
  workspaceId: string | undefined,
  ownPaneId: string | undefined,
): string | null {
  if (!workspaceId) return null;
  const siblings = panes.filter(
    (p) => p.workspace_id === workspaceId && p.pane_id !== ownPaneId,
  );
  const withCwd = siblings.filter(
    (p): p is HerdrPane & { cwd: string } =>
      typeof p.cwd === "string" && p.cwd.trim().length > 0,
  );
  if (withCwd.length === 0) return null;
  const focused = withCwd.find((p) => p.focused === true);
  return normalizeHerdrPath((focused ?? withCwd[0]!).cwd);
}

function extractPanes(stdout: string): HerdrPane[] {
  try {
    const parsed = JSON.parse(stdout) as {
      result?: { panes?: HerdrPane[] };
    };
    const panes = parsed?.result?.panes;
    return Array.isArray(panes) ? panes : [];
  } catch {
    return [];
  }
}

function extractWorktreeRoot(stdout: string, workspaceId: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as {
      result?: {
        workspaces?: Array<{
          workspace_id?: string;
          worktree?: { checkout_path?: string };
        }>;
      };
    };
    const list = parsed?.result?.workspaces;
    if (!Array.isArray(list)) return null;
    const ws = list.find((w) => w.workspace_id === workspaceId);
    const root = ws?.worktree?.checkout_path;
    if (typeof root !== "string" || root.trim().length === 0) return null;
    return normalizeHerdrPath(root);
  } catch {
    return null;
  }
}

function workspaceIdFromEnv(): string | undefined {
  const id = process.env.HERDR_WORKSPACE_ID;
  return id && id.length > 0 ? id : undefined;
}

function ownPaneIdFromEnv(): string | undefined {
  const id = process.env.HERDR_PANE_ID;
  return id && id.length > 0 ? id : undefined;
}

/** Async live lookup for the long-lived TUI: sibling cwd first, then the
 *  workspace worktree root. Resolves `null` on any failure. */
export async function getWorkspaceCwd(
  workspaceId: string | undefined = workspaceIdFromEnv(),
  ownPaneId: string | undefined = ownPaneIdFromEnv(),
  timeoutMs = 5000,
): Promise<string | null> {
  if (!workspaceId || !process.env.HERDR_ENV) return null;
  try {
    const { stdout } = await execFileAsync(
      herdrBin(),
      ["pane", "list", "--workspace", workspaceId],
      { timeout: timeoutMs },
    );
    const picked = pickWorkspaceCwd(extractPanes(stdout), workspaceId, ownPaneId);
    if (picked) return picked;
  } catch {
    // Fall through to the worktree lookup below.
  }
  return getWorkspaceWorktreeRoot(workspaceId, timeoutMs);
}

/** Worktree-root fallback used when a workspace has no sibling panes yet. */
export async function getWorkspaceWorktreeRoot(
  workspaceId: string | undefined = workspaceIdFromEnv(),
  timeoutMs = 5000,
): Promise<string | null> {
  if (!workspaceId || !process.env.HERDR_ENV) return null;
  try {
    const { stdout } = await execFileAsync(herdrBin(), ["workspace", "list"], {
      timeout: timeoutMs,
    });
    return extractWorktreeRoot(stdout, workspaceId);
  } catch {
    return null;
  }
}

/** Sync variant for short-lived spawn wrappers (launch-tab / open-tab). */
export function getWorkspaceCwdSync(
  workspaceId: string | undefined = workspaceIdFromEnv(),
  ownPaneId: string | undefined = ownPaneIdFromEnv(),
  timeoutMs = 3000,
): string | null {
  if (!workspaceId || !process.env.HERDR_ENV) return null;
  try {
    const out = execFileSync(herdrBin(), ["pane", "list", "--workspace", workspaceId], {
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const picked = pickWorkspaceCwd(extractPanes(out), workspaceId, ownPaneId);
    if (picked) return picked;
  } catch {
    // Fall through to the worktree lookup below.
  }
  try {
    const out = execFileSync(herdrBin(), ["workspace", "list"], {
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return extractWorktreeRoot(out, workspaceId);
  } catch {
    return null;
  }
}
