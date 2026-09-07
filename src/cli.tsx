#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import React from "react";
import { render } from "ink";
import App from "./app.js";

const execFileAsync = promisify(execFile);

function parseArgs(argv: string[]): { repo: string; refreshSecs: number; watch: boolean } {
  let repo = process.cwd();
  let refreshSecs = 30;
  let watch = true;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && i + 1 < argv.length) {
      repo = argv[++i];
    } else if (a.startsWith("--repo=")) {
      repo = a.slice("--repo=".length);
    } else if (a === "--refresh" && i + 1 < argv.length) {
      refreshSecs = Number(argv[++i]);
    } else if (a.startsWith("--refresh=")) {
      refreshSecs = Number(a.slice("--refresh=".length));
    } else if (a === "--no-watch") {
      watch = false;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: herdr-git-tab [--repo <path>] [--refresh <secs>] [--no-watch]");
      process.exit(0);
    }
  }
  if (!Number.isFinite(refreshSecs) || refreshSecs < 0) refreshSecs = 30;
  return { repo, refreshSecs, watch };
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

const { repo, refreshSecs, watch } = parseArgs(process.argv);

if (!process.stdout.isTTY) {
  process.exit(await nonTtyFallback(repo));
}

render(<App repo={repo} refreshSecs={refreshSecs} watch={watch} />);
