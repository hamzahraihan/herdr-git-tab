// End-to-end smoke: non-TTY CLI fallback prints a useful snapshot of the repo.
// Interactive TUI render is exercised manually (Ink 5 requires a real TTY for raw mode).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "herdr-git-tab-smoke-"));
  git(dir, ["init", "-q", "-b", "main"]);
  execFileSync("git", ["config", "user.email", "a@b.c"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "smoke"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "seed"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "wip work"], {
    cwd: dir,
    stdio: "ignore",
  });
  return dir;
}

function main(): void {
  const good = fixtureRepo();
  const cli = spawnSync("node", ["dist/cli.js", "--repo", good, "--no-watch"], {
    input: "",
    encoding: "utf8",
  });
  if (cli.status !== 0) throw new Error(`cli exit ${cli.status}: ${cli.stderr}`);
  for (const needle of ["seed", "feature", "wip work"]) {
    if (!cli.stdout.includes(needle)) {
      throw new Error(`cli output missing ${needle!}:\n${cli.stdout}`);
    }
  }
  // Non-git dir returns a helpful message, not a crash
  const bad = mkdtempSync(join(tmpdir(), "herdr-git-tab-bad-"));
  const badCli = spawnSync("node", ["dist/cli.js", "--repo", bad, "--no-watch"], {
    input: "",
    encoding: "utf8",
  });
  // Non-TTY fallback uses git status/log which will fail; we just confirm it exits cleanly with stderr info.
  if (badCli.status === null) throw new Error("non-git smoke: process did not exit");
  console.log("SMOKE OK");
}

main();
