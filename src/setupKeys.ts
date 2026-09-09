// One-time keybinding setup for the git tab.
//
// Herdr plugin v1 has no manifest-declared keys and no install hook —
// keybindings live in the user's config.toml and Herdr owns that surface.
// So instead of silently rewriting user config at install time, this
// explicit, reviewable, idempotent command registers the binding:
//
//   node dist/bin/setup-keys.js [--key <binding>] [--no-reload]
//
// It appends one `[[keys.command]]` block (skipped when already present),
// creates the config file when missing, and asks the running server to
// reload (unless --no-reload).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix as posixPath, win32 as win32Path } from "node:path";

const execFileAsync = promisify(execFile);

export const DEFAULT_KEY = "prefix+.";
export const ACTION_ID = "herdr-git-tab.open-git-tab";

/** Resolve the user's Herdr config path. Honors HERDR_CONFIG_PATH, then the
 *  platform-default location. Throws when no home is known. */
export function configPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): string {
  const override = env.HERDR_CONFIG_PATH;
  if (override && override.length > 0) return override;
  if (platform === "win32") {
    const base =
      env.APPDATA ??
      (env.USERPROFILE ? win32Path.join(env.USERPROFILE, "AppData", "Roaming") : undefined);
    if (!base) throw new Error("Cannot locate Herdr config: set HERDR_CONFIG_PATH");
    return win32Path.join(base, "herdr", "config.toml");
  }
  const home = env.HOME;
  if (!home) throw new Error("Cannot locate Herdr config: set HERDR_CONFIG_PATH");
  return posixPath.join(home, ".config", "herdr", "config.toml");
}

export function keybindingBlock(key: string): string {
  return (
    `# herdr-git-tab: added by \`node dist/bin/setup-keys.js\`. Remove to unbind.\n` +
    `[[keys.command]]\n` +
    `key = "${key}"\n` +
    `type = "plugin_action"\n` +
    `command = "${ACTION_ID}"\n` +
    `description = "Open Git Tab"\n`
  );
}

/** Regex matching a commented-out herdr-git-tab keybinding block so installBlock can replace it cleanly. */
const COMMENTED_BLOCK_REGEX =
  /(?:^[ \t]*#[^\n]*herdr-git-tab[^\n]*\r?\n)?[ \t]*#[^\n]*\[\[keys\.command\]\][\s\S]*?^[ \t]*#[^\n]*command\s*=\s*["']herdr-git-tab\.open-git-tab["'][^\n]*(?:\r?\n[ \t]*#[^\n]*description[^\n]*)?/m;

/** True when the config does not contain an active (uncommented) reference to our action. */
export function needsInstall(content: string): boolean {
  const activeCommand = new RegExp(`^\\s*command\\s*=\\s*["']${ACTION_ID}["']`, "m");
  return !activeCommand.test(content);
}

/** Append the block, replacing any commented-out template and preserving trailing newline. */
export function installBlock(content: string, key: string): string {
  const cleaned = content.replace(COMMENTED_BLOCK_REGEX, "").replace(/\s+$/, "");
  if (cleaned.trim().length === 0) return `${keybindingBlock(key)}\n`;
  return `${cleaned}\n\n${keybindingBlock(key)}\n`;
}

export function ensureKeybinding(
  key: string = DEFAULT_KEY,
  filePath?: string,
): { path: string; changed: boolean } {
  const targetPath = filePath ?? configPath();
  mkdirSync(dirname(targetPath), { recursive: true });
  let content = "";
  try {
    content = readFileSync(targetPath, "utf8");
  } catch {
    content = "";
  }
  if (!needsInstall(content)) return { path: targetPath, changed: false };
  writeFileSync(targetPath, installBlock(content, key));
  return { path: targetPath, changed: true };
}

function herdrBin(): string {
  const fromEnv = process.env.HERDR_BIN_PATH;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return "herdr";
}

/** Ask the running server to pick up the new binding. False when Herdr is
 *  unreachable — the user then runs `herdr server reload-config` by hand. */
export async function reloadConfig(timeoutMs = 10000): Promise<boolean> {
  try {
    await execFileAsync(herdrBin(), ["server", "reload-config"], { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
