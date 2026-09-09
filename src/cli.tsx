#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import React from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import App from "./app.js";
import { findNearestGitRepo } from "./repoResolver.js";

const execFileAsync = promisify(execFile);

function parseArgs(argv: string[]): {
  initialRepo: string;
  fixedRepo: boolean;
  refreshSecs: number;
  watch: boolean;
} {
  let initialRepo = findNearestGitRepo(process.cwd()) ?? process.cwd();
  let fixedRepo = false;
  let refreshSecs = 30;
  let watch = true;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && i + 1 < argv.length) {
      initialRepo = argv[++i]!;
      fixedRepo = true;
    } else if (a.startsWith("--repo=")) {
      initialRepo = a.slice("--repo=".length);
      fixedRepo = true;
    } else if (a === "--refresh" && i + 1 < argv.length) {
      refreshSecs = Number(argv[++i]);
    } else if (a.startsWith("--refresh=")) {
      refreshSecs = Number(a.slice("--refresh=".length));
    } else if (a === "--no-watch") {
      watch = false;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: herdr-git-tab [--repo <path>] [--refresh <secs>] [--no-watch]\n" +
          "Follows the active Herdr workspace automatically. --repo <path> pins a fixed repo instead.",
      );
      process.exit(0);
    }
  }
  if (!Number.isFinite(refreshSecs) || refreshSecs < 0) refreshSecs = 30;
  return { initialRepo, fixedRepo, refreshSecs, watch };
}

async function nonTtyFallback(repo: string): Promise<number> {
  try {
    const [st, log] = await Promise.all([
      execFileAsync("git", ["status", "-sb"], { cwd: repo, timeout: 15000 }).catch(
        (e: unknown) => ({ stdout: String(e instanceof Error ? e.message : e), stderr: "" }),
      ),
      execFileAsync("git", ["log", "--oneline", "-20"], { cwd: repo, timeout: 15000 }).catch(
        (e: unknown) => ({ stdout: String(e instanceof Error ? e.message : e), stderr: "" }),
      ),
    ]);
    process.stdout.write(`${st.stdout}\n${log.stdout}\n`);
    return 0;
  } catch {
    return 1;
  }
}

const { initialRepo, fixedRepo, refreshSecs, watch } = parseArgs(process.argv);

if (!process.stdout.isTTY) {
  process.exit(await nonTtyFallback(initialRepo));
}

let renderer;
try {
  renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    useMouse: true,
  });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(
    `herdr-git-tab: failed to start the TUI renderer: ${msg}\n` +
      `This build uses OpenTUI, which requires Node >= 26.4 (you have ${process.version}). ` +
      `Upgrade Node (e.g. winget install OpenJS.NodeJS.LTS) or run under Bun >= 1.3, then rebuild.\n`,
  );
  process.exit(1);
}

createRoot(renderer).render(
  <App initialRepo={initialRepo} fixedRepo={fixedRepo} refreshSecs={refreshSecs} watch={watch} />,
);
