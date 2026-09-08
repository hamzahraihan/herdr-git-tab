import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";

import { defaultShellCwdFile, findNearestGitRepo, readShellCwdFile, resolveRepoPath } from "../src/repoResolver.js";

describe("defaultShellCwdFile", () => {
  it("honors HERDR_GIT_TAB_CWD_FILE when set", () => {
    const saved = process.env.HERDR_GIT_TAB_CWD_FILE;
    process.env.HERDR_GIT_TAB_CWD_FILE = "/custom/path/cwd";
    try {
      expect(defaultShellCwdFile()).toBe("/custom/path/cwd");
    } finally {
      if (saved === undefined) delete process.env.HERDR_GIT_TAB_CWD_FILE;
      else process.env.HERDR_GIT_TAB_CWD_FILE = saved;
    }
  });

  it("falls back to platform-default path when env var is unset", () => {
    const saved = process.env.HERDR_GIT_TAB_CWD_FILE;
    delete process.env.HERDR_GIT_TAB_CWD_FILE;
    try {
      const path = defaultShellCwdFile();
      expect(path.length).toBeGreaterThan(0);
      expect(path).toContain("herdr-git-tab-cwd");
    } finally {
      if (saved !== undefined) process.env.HERDR_GIT_TAB_CWD_FILE = saved;
    }
  });
});

describe("readShellCwdFile", () => {
  it("returns trimmed content of an existing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-shell-"));
    const file = join(dir, "cwd");
    writeFileSync(file, "  /home/me/proj  \n");
    try {
      expect(readShellCwdFile(file)).toBe("/home/me/proj");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null for missing file", () => {
    expect(readShellCwdFile("/nonexistent/path/cwd")).toBeNull();
  });

  it("returns null for empty file", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-shell-"));
    const file = join(dir, "cwd");
    writeFileSync(file, "");
    try {
      expect(readShellCwdFile(file)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


describe("findNearestGitRepo", () => {
  it("returns the start directory when it contains .git", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    mkdirSync(join(dir, ".git"));
    try {
      expect(findNearestGitRepo(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walks upward through nested directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "src", "deep", "sub");
    mkdirSync(nested, { recursive: true });
    try {
      expect(findNearestGitRepo(nested)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recognizes a .git file (linked worktree)", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    writeFileSync(join(dir, ".git"), "gitdir: /elsewhere\n");
    try {
      expect(findNearestGitRepo(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null when no .git exists up to the filesystem root", () => {
    expect(findNearestGitRepo("/nonexistent/herdr-no-such-dir/inner/deep")).toBeNull();
  });

});

describe("resolveRepoPath", () => {
  it("reads the shell-cwd sentinel before falling back to cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-shell-"));
    const file = join(dir, "cwd");
    writeFileSync(file, "/from/shell\n");
    try {
      expect(resolveRepoPath("/cwd", file)).toBe("/from/shell");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walks up to the nearest git repo when no sentinel exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "src", "deep");
    mkdirSync(nested, { recursive: true });
    try {
      expect(resolveRepoPath(nested, "/nonexistent/path/cwd")).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to cwd when no sentinel or git repo exists", () => {
    expect(resolveRepoPath("/cwd", "/nonexistent/path/cwd")).toBe("/cwd");
  });

  it("walks the sentinel up to its enclosing repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "work", "tree");
    mkdirSync(nested, { recursive: true });
    const shell = mkdtempSync(join(tmpdir(), "herdr-shell-"));
    const file = join(shell, "cwd");
    writeFileSync(file, nested);
    try {
      expect(resolveRepoPath("/cwd", file)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(shell, { recursive: true, force: true });
    }
  });

  it("ignores a sentinel outside any repo when cwd is inside one", () => {
    const plain = mkdtempSync(join(tmpdir(), "herdr-plain-"));
    const shell = mkdtempSync(join(tmpdir(), "herdr-shell-"));
    const file = join(shell, "cwd");
    writeFileSync(file, plain);
    const repo = mkdtempSync(join(tmpdir(), "herdr-repo-"));
    mkdirSync(join(repo, ".git"));
    try {
      expect(resolveRepoPath(repo, file)).toBe(repo);
    } finally {
      rmSync(plain, { recursive: true, force: true });
      rmSync(shell, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  });
});