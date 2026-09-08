#!/usr/bin/env node
// "Open Git Tab" action: opens the git tab in the calling workspace.
//
// The pane MUST spawn with the plugin directory as its cwd: the `[[panes]]`
// entrypoint (`node dist/bin/launch-tab.js`) is relative and Node resolves
// it against the pane cwd, so passing the workspace dir here breaks the
// launch with MODULE_NOT_FOUND. `launch-tab` re-binds to the workspace's
// live shell cwd on boot and keeps following it from there.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  const out = execFileSync(
    "herdr",
    [
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
    ],
    { stdio: "inherit", env: process.env },
  );
  process.stdout.write(typeof out === "string" ? out : "");
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
