import { beforeEach, describe, expect, it, vi } from "vitest";
import { startPRCreate } from "../src/github.js";

type ExecResult = { stdout: string; stderr: string };
type SpawnedChild = {
  args: string[];
  emitExit: (code: number | null, signal: string | null) => void;
  emitError: (err: unknown) => void;
  emitStderr: (data: string) => void;
};

const state: {
  calls: Array<{ cmd: string; args: string[]; cwd: string }>;
  children: SpawnedChild[];
  execImpl: (cmd: string, args: string[]) => Promise<ExecResult>;
} = {
  calls: [],
  children: [],
  execImpl: () => Promise.reject(new Error("unexpected exec call")),
};

vi.mock("node:child_process", () => ({
  execFile: (file: string, args: string[], opts: { cwd: string; timeout: number }) => {
    state.calls.push({ cmd: file, args, cwd: opts.cwd });
    return state.execImpl(file, args);
  },
  spawn: (_file: string, args: string[], _opts: unknown) => {
    const exitCbs: Array<(code: number | null, signal: string | null) => void> = [];
    const errorCbs: Array<(err: unknown) => void> = [];
    const stderrCbs: Array<(data: string) => void> = [];
    const child: SpawnedChild = {
      args,
      emitExit: (code, signal) => {
        for (const cb of exitCbs) cb(code, signal);
      },
      emitError: (err) => {
        for (const cb of errorCbs) cb(err);
      },
      emitStderr: (data) => {
        for (const cb of stderrCbs) cb(data);
      },
    };
    state.children.push(child);
    return {
      stderr: {
        on: (_evt: string, cb: (data: string) => void) => {
          stderrCbs.push(cb);
        },
      },
      on: (evt: string, cb: (code: number | null, signal: string | null) => void) => {
        if (evt === "exit") exitCbs.push(cb);
        else if (evt === "error") errorCbs.push(cb as unknown as (err: unknown) => void);
      },
    };
  },
}));
vi.mock("node:util", () => ({
  promisify: <T extends (...a: never[]) => unknown>(fn: T): T => fn,
}));

const REMOTE =
  "origin\thttps://github.com/x/y.git (fetch)\norigin\thttps://github.com/x/y.git (push)\n";

function ok(stdout: string): Promise<ExecResult> {
  return Promise.resolve({ stdout, stderr: "" });
}

function fail(stderr: string): Promise<ExecResult> {
  return Promise.reject(Object.assign(new Error("Command failed"), { stderr }));
}

function baseImpl(cmd: string, args: string[]): Promise<ExecResult> {
  if (cmd === "git" && args[0] === "branch") return ok("feat\n");
  if (cmd === "git" && args[0] === "remote") return ok(REMOTE);
  if (cmd === "gh" && args[0] === "pr" && args[1] === "list") return ok("[]");
  if (cmd === "git" && args[0] === "rev-parse") return ok("origin/feat\n");
  if (cmd === "git" && args[0] === "push") return ok("");
  if (cmd === "gh" && args[0] === "pr" && args[1] === "create")
    return ok("https://github.com/x/y/pull/12\n");
  return Promise.reject(new Error(`unexpected: ${cmd} ${args.join(" ")}`));
}

/** Drain the preflight microtask chain (branch → remote → list) so spawn has
 *  run. Microtasks only: no wall-clock wait, deterministic under load. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  state.calls.length = 0;
  state.children.length = 0;
  state.execImpl = baseImpl;
});

describe("startPRCreate preflight", () => {
  it("rejects on detached HEAD before spawning", async () => {
    state.execImpl = (cmd, args) =>
      cmd === "git" && args[0] === "branch" ? ok("") : baseImpl(cmd, args);
    await expect(startPRCreate("C:/repo", { interactive: true })).rejects.toThrow(/detached HEAD/);
    expect(state.children).toHaveLength(0);
  });

  it("rejects with no GitHub remote", async () => {
    state.execImpl = (cmd, args) => {
      if (cmd === "git" && args[0] === "branch") return ok("feat\n");
      if (cmd === "git" && args[0] === "remote") return ok("");
      return baseImpl(cmd, args);
    };
    await expect(startPRCreate("C:/repo", { interactive: true })).rejects.toThrow(
      /no GitHub remote/,
    );
    expect(state.children).toHaveLength(0);
  });

  it("refuses when an open PR already exists for the branch", async () => {
    state.execImpl = (cmd, args) =>
      cmd === "gh" && args[1] === "list" ? ok('[{"number": 7}]') : baseImpl(cmd, args);
    await expect(startPRCreate("C:/repo", { interactive: true })).rejects.toThrow(
      /PR #7 already exists/,
    );
    expect(state.children).toHaveLength(0);
  });

  it("forwards cwd to git", async () => {
    const p = startPRCreate("C:/repo", { interactive: true });
    await flush();
    state.children[0]?.emitExit(0, null);
    await p;
    expect(state.calls[0]).toMatchObject({ cmd: "git", cwd: "C:/repo" });
  });
});

describe("startPRCreate interactive", () => {
  it("rejects with gh's stderr instead of a bare exit code", async () => {
    const p = startPRCreate("C:/repo", { interactive: true });
    await flush();
    expect(state.children).toHaveLength(1);
    expect(state.children[0]?.args).toEqual(["pr", "create"]);
    state.children[0]?.emitStderr(
      "must provide --title and --body when not running interactively\n\nUsage: gh pr create\n",
    );
    state.children[0]?.emitExit(1, null);
    await expect(p).rejects.toThrow(/must provide --title and --body/);
  });

  it("resolves on exit 0", async () => {
    const p = startPRCreate("C:/repo", { interactive: true });
    await flush();
    state.children[0]?.emitExit(0, null);
    await expect(p).resolves.toBe("");
  });

  it("maps spawn ENOENT to GH_UNAVAILABLE", async () => {
    const p = startPRCreate("C:/repo", { interactive: true });
    await flush();
    state.children[0]?.emitError(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }));
    await expect(p).rejects.toThrow(/^GH_UNAVAILABLE/);
  });

  it("names the signal when killed without stderr", async () => {
    const p = startPRCreate("C:/repo", { interactive: true });
    await flush();
    state.children[0]?.emitExit(null, "SIGTERM");
    await expect(p).rejects.toThrow(/killed by SIGTERM/);
  });
});

describe("startPRCreate headless (piped stdin)", () => {
  it("pushes a branch without upstream, then creates with --fill and resolves the URL", async () => {
    state.execImpl = (cmd, args) =>
      cmd === "git" && args[0] === "rev-parse"
        ? fail("fatal: no upstream configured for branch\n")
        : baseImpl(cmd, args);
    await expect(startPRCreate("C:/repo")).resolves.toBe("https://github.com/x/y/pull/12");
    expect(state.calls.find((c) => c.args[0] === "push")?.args).toEqual([
      "push",
      "-u",
      "origin",
      "HEAD",
    ]);
    expect(state.calls.find((c) => c.cmd === "gh" && c.args[1] === "create")?.args).toEqual([
      "pr",
      "create",
      "--fill",
    ]);
    expect(state.children).toHaveLength(0);
  });

  it("skips push when upstream exists", async () => {
    await expect(startPRCreate("C:/repo")).resolves.toBe("https://github.com/x/y/pull/12");
    expect(state.calls.some((c) => c.args[0] === "push")).toBe(false);
  });

  it("surfaces gh's failure message", async () => {
    state.execImpl = (cmd, args) =>
      cmd === "gh" && args[1] === "create"
        ? fail('head branch "feat" is the same as base branch "main", cannot create a pull request\n')
        : baseImpl(cmd, args);
    await expect(startPRCreate("C:/repo")).rejects.toThrow(/same as base branch/);
  });

  it("makes push failures actionable", async () => {
    state.execImpl = (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse")
        return fail("fatal: no upstream configured for branch\n");
      if (cmd === "git" && args[0] === "push") return fail("Permission denied (publickey)\n");
      return baseImpl(cmd, args);
    };
    await expect(startPRCreate("C:/repo")).rejects.toThrow(/push the branch/);
  });
});
