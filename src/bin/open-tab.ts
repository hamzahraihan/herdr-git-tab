#!/usr/bin/env node
// Right-click "Open Git Tab" action: opens the git tab in the workspace's cwd.
import { execFileSync } from "node:child_process";

const cwd = process.env.HERDR_WORKSPACE_CWD ?? process.cwd();

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
      cwd,
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
