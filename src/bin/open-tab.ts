#!/usr/bin/env node
// "Open Git Tab" action: opens the git tab in the calling workspace and
// focuses it.
//
// The pane MUST spawn with the plugin directory as its cwd: the `[[panes]]`
// entrypoint (`node dist/bin/launch-tab.js`) is relative and Node resolves
// it against the pane cwd, so passing the workspace dir here breaks the
// launch with MODULE_NOT_FOUND. `launch-tab` re-binds to the workspace's
// live shell cwd on boot and keeps following it from there.
//
// `--focus` on `plugin pane open` focuses the new pane, but the workspace's
// active tab does not always follow, so the open response is parsed and the
// workspace + tab are focused explicitly. Focus is best-effort: the tab
// already exists at that point, so a focus failure warns instead of failing
// the action.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ensureKeybinding, reloadConfig } from "../setupKeys.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Docs direct plugins at HERDR_BIN_PATH: a bare `herdr` breaks across Unix
// sockets vs Windows named pipes.
const herdr = process.env.HERDR_BIN_PATH ?? "herdr";
const workspace = process.env.HERDR_WORKSPACE_ID;

function run(args: string[]): string {
  return execFileSync(herdr, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}
/** Extract the new tab id from a `plugin pane open` JSON response with
 *  runtime narrowing; "" when the shape is unexpected. */
function tabIdFrom(out: string): string {
  const parsed: unknown = JSON.parse(out);
  if (!parsed || typeof parsed !== "object" || !("result" in parsed)) return "";
  const result: unknown = parsed.result;
  if (!result || typeof result !== "object" || !("plugin_pane" in result)) return "";
  const pluginPane: unknown = result.plugin_pane;
  if (!pluginPane || typeof pluginPane !== "object" || !("pane" in pluginPane)) return "";
  const pane: unknown = pluginPane.pane;
  if (!pane || typeof pane !== "object" || !("tab_id" in pane)) return "";
  const tabId: unknown = pane.tab_id;
  return typeof tabId === "string" ? tabId : "";
}

// Ensure keybinding is present in user's config.toml (self-healing fallback).
try {
  const { changed } = ensureKeybinding();
  if (changed) {
    void reloadConfig().catch(() => {});
  }
} catch {
  // Non-fatal
}



try {
  const openArgs = [
    "plugin",
    "pane",
    "open",
    "--plugin",
    "herdr-git-tab",
    "--entrypoint",
    "git-tab",
    "--placement",
    "tab",
    "--cwd",
    pluginRoot,
    "--focus",
  ];
  if (workspace) openArgs.push("--workspace", workspace);
  const out = run(openArgs);
  process.stdout.write(out);

  try {
    const tabId = tabIdFrom(out);
    if (tabId.length === 0) {
      throw new Error("open response has no tab_id");
    }
    if (workspace) run(["workspace", "focus", workspace]);
    run(["tab", "focus", tabId]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`open-tab warning: tab focus failed: ${msg}\n`);
  }
} catch (e) {
  const err = e as { status?: number; stderr?: Buffer | string; message?: string };
  const msg =
    typeof err.stderr === "string"
      ? err.stderr
      : Buffer.isBuffer(err.stderr)
        ? err.stderr.toString()
        : err.message ?? String(e);
  process.stderr.write(`open-tab failed: ${msg}\n`);
  process.exit(typeof err.status === "number" ? err.status : 1);
}
