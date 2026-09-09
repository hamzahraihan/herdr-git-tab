# Git Tab Loading Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a single footer loading line for every manual git/gh operation in the git tab.

**Architecture:** Add a pure `busyLabel()` helper in a new `src/busyStatus.ts`, add one `busy` state to `src/app.tsx`, set/clear it around each manual async op, render it above the KeyBar. Background auto-refresh stays silent.

**Tech Stack:** TypeScript, React 19, OpenTUI (@opentui/react), vitest

## Global Constraints

- Single status line above KeyBar, cyan `● ` prefix, `truncateToWidth(busy, width)` — matches existing checkout line style.
- Manual ops only show `busy`; timed auto-refresh (30s) and repo-follow poll stay silent.
- `busy` always cleared in `finally`; repo/scope reset effect clears `busy`.
- No changes to `src/git.ts` / `src/github.ts`; no non-TTY fallback changes.

---

### Task 1: Busy-label helper + unit test

**Files:**
- Create: `src/busyStatus.ts`
- Test: `test/busyStatus.test.ts`

**Interfaces:**
- Consumes: nothing (pure helper, no imports).
- Produces: `export type BusyOp = { kind: "refresh" } | { kind: "checkout-branch"; name: string } | { kind: "checkout-pr"; number: number } | { kind: "diff-branch"; name: string } | { kind: "diff-file"; path: string } | { kind: "commit"; short: string } | { kind: "pr"; number: number } | { kind: "issue"; number: number } | { kind: "approve"; number: number } | { kind: "create-pr" };` and `export function busyLabel(op: BusyOp): string` used by Task 2 and Task 3 via `import { busyLabel } from "./busyStatus.js";`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { busyLabel } from "../src/busyStatus.js";

describe("busyLabel", () => {
  it("labels every manual op", () => {
    expect(busyLabel({ kind: "refresh" })).toBe("Refreshing…");
    expect(busyLabel({ kind: "checkout-branch", name: "main" })).toBe("Checking out main…");
    expect(busyLabel({ kind: "checkout-pr", number: 12 })).toBe("Checking out PR #12…");
    expect(busyLabel({ kind: "diff-branch", name: "feat" })).toBe("Loading diff feat…");
    expect(busyLabel({ kind: "diff-file", path: "src/a.ts" })).toBe("Loading diff src/a.ts…");
    expect(busyLabel({ kind: "commit", short: "9f2c3a1" })).toBe("Loading commit 9f2c3a1…");
    expect(busyLabel({ kind: "pr", number: 7 })).toBe("Loading PR #7…");
    expect(busyLabel({ kind: "issue", number: 9 })).toBe("Loading issue #9…");
    expect(busyLabel({ kind: "approve", number: 7 })).toBe("Approving PR #7…");
    expect(busyLabel({ kind: "create-pr" })).toBe("Creating PR…");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/busyStatus.test.ts`
Expected: FAIL with "Failed to resolve import ../src/busyStatus.js" (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
export type BusyOp =
  | { kind: "refresh" }
  | { kind: "checkout-branch"; name: string }
  | { kind: "checkout-pr"; number: number }
  | { kind: "diff-branch"; name: string }
  | { kind: "diff-file"; path: string }
  | { kind: "commit"; short: string }
  | { kind: "pr"; number: number }
  | { kind: "issue"; number: number }
  | { kind: "approve"; number: number }
  | { kind: "create-pr" };

export function busyLabel(op: BusyOp): string {
  switch (op.kind) {
    case "refresh":
      return "Refreshing…";
    case "checkout-branch":
      return `Checking out ${op.name}…`;
    case "checkout-pr":
      return `Checking out PR #${op.number}…`;
    case "diff-branch":
      return `Loading diff ${op.name}…`;
    case "diff-file":
      return `Loading diff ${op.path}…`;
    case "commit":
      return `Loading commit ${op.short}…`;
    case "pr":
      return `Loading PR #${op.number}…`;
    case "issue":
      return `Loading issue #${op.number}…`;
    case "approve":
      return `Approving PR #${op.number}…`;
    case "create-pr":
      return "Creating PR…";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/busyStatus.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add src/busyStatus.ts test/busyStatus.test.ts
git commit -m "feat: add busyLabel helper for git tab loading status"
```

### Task 2: Busy state for refresh path + footer render

**Files:**
- Modify: `src/app.tsx:1-10` (add `import { busyLabel } from "./busyStatus.js";`)
- Modify: `src/app.tsx:112-119` (add `const [busy, setBusy] = useState<string | null>(null);` next to `checkingOut` state)
- Modify: `src/app.tsx:144-208` (change `const load = useCallback(async () => {` to `const load = useCallback(async (opts?: { manual?: boolean }) => {`, wrap body: `if (opts?.manual) setBusy(busyLabel({ kind: "refresh" }));` at top after repo-resolve, `setBusy(null)` before every `return` and at end after `setLoading(false)`)
- Modify: `src/app.tsx:212-252` (reset effect: add `setBusy(null);`; `void load()` initial mount stays silent; interval `void load()` stays silent; `r` key site and `m` scope sites pass `{ manual: true }`)
- Modify: `src/app.tsx:816-821` (replace `{checkingOut ? (` footer box with `{busy ? (<box paddingX={1}><text fg="cyan">● </text><text>{truncateToWidth(busy, width)}</text></box>) : null}`)
- Test: `pnpm typecheck` + `pnpm vitest run test/busyStatus.test.ts`

**Interfaces:**
- Consumes: `busyLabel` and `BusyOp` from Task 1.
- Produces: `busy: string | null` state + `load(opts?: { manual?: boolean })` signature used by Task 3 (`void load({ manual: true })` after checkout/create).

- [ ] **Step 1: Add import, state, and footer render**

```tsx
import { busyLabel } from "./busyStatus.js";
const [busy, setBusy] = useState<string | null>(null);
{busy ? (
  <box paddingX={1}>
    <text fg="cyan">● </text>
    <text>{truncateToWidth(busy, width)}</text>
  </box>
) : null}
```

Delete the old `{checkingOut ? (...Checking out ${checkingOut}…...)}` footer box and replace it with the block above. Keep the `checkingOut` state variable itself as the double-checkout guard.

- [ ] **Step 2: Change load to accept manual flag and drive busy**

```typescript
const load = useCallback(async (opts?: { manual?: boolean }) => {
  const target = await resolveLiveRepo(repo);
  if (target !== repo) {
    setRepo(target);
    return;
  }
  if (opts?.manual) setBusy(busyLabel({ kind: "refresh" }));
  setLoading(true);
  // ... existing Promise.allSettled body unchanged ...
  if (s.status === "rejected" && paneError(s.reason) === "NOT_A_GIT_REPO") {
    setFatal(`Not a git repository: ${target}\ncd into a git checkout and the tab follows automatically, or pass --repo <path>, then press q to exit.`);
    setLoading(false);
    if (opts?.manual) setBusy(null);
    return;
  }
  // ... existing setters unchanged ...
  setLoading(false);
  if (opts?.manual) setBusy(null);
}, [repo, resolveLiveRepo, scope]);
```

- [ ] **Step 3: Wire manual triggers, keep background silent**

```typescript
useEffect(() => {
  void load();
}, [load]);

useEffect(() => {
  if (!watch || refreshSecs <= 0) return;
  const t = setInterval(() => void load(), refreshSecs * 1000);
  return () => clearInterval(t);
}, [load, refreshSecs, watch]);
```

`r` key handler becomes `void load({ manual: true });`. Both `m` scope toggles (`setScope((s) => (s === "repo" ? "mine" : "repo"))` in main list and in detail panes) are followed by nothing today — the `load` effect re-runs on `scope` change automatically, so add an explicit effect: in the repo/scope reset `useEffect` add `setBusy(busyLabel({ kind: "refresh" }));` at the top and rely on the `load` effect's manual pass. Simplest correct wiring: in the reset effect (`useEffect(() => {...}, [repo, scope])`) add `setBusy(null);` only, and change the `load`-triggering effect to `void load({ manual: true })` ONLY when triggered by scope/repo change — implement by tracking previous scope/repo with a ref is overkill; instead call `void load({ manual: true })` from the `r` handler and from `m` handlers directly after `setScope`, and keep mount/interval silent:

```typescript
if (input === "r") {
  setNotice("");
  void load({ manual: true });
  return;
}
if (input === "m") {
  setScope((s) => (s === "repo" ? "mine" : "repo"));
  void load({ manual: true });
  return;
}
```

Repo-follow `setRepo(target)` path: the `load` effect fires on `[repo]` change — leave silent per spec (auto-follow is background).

- [ ] **Step 4: Run typecheck and unit test**

Run: `pnpm typecheck`
Expected: PASS (no errors).

Run: `pnpm vitest run test/busyStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app.tsx
git commit -m "feat: footer busy line for manual refresh"
```

### Task 3: Busy for checkout, diff, detail, approve, create

**Files:**
- Modify: `src/app.tsx:265-320` (`openPRDetail`, `openIssueDetail`, `openCommitDetail`, `refreshPRDetail`, `refreshIssueDetail`)
- Modify: `src/app.tsx:424-435` (PR detail `c` checkout), `src/app.tsx:562-574` (`c` create), `src/app.tsx:518-558` (`d` diff), `src/app.tsx:576-602` (Enter checkout / detail open)
- Modify: `src/app.tsx:693-710` (BranchesPanel double-click checkout)
- Test: `pnpm typecheck` + full `pnpm vitest run`

**Interfaces:**
- Consumes: `busy` state and `load(opts)` from Task 2; `busyLabel` from Task 1.
- Produces: nothing new (end of plan; all Table 1 labels visible in footer).

- [ ] **Step 1: Checkout ops set busy and reload manual**

```typescript
// Enter on branch (activePane === 3):
setCheckingOut(b.name);
setBusy(busyLabel({ kind: "checkout-branch", name: b.name }));
checkoutBranch(repo, b.name)
  .then(() => void load({ manual: true }))
  .catch((e: unknown) => setError(paneError(e)))
  .finally(() => {
    setCheckingOut(null);
    setBusy(null);
  });

// PR detail c / Enter checkout:
setCheckingOut(`PR #${num}`);
setBusy(busyLabel({ kind: "checkout-pr", number: num }));
checkoutPR(repo, num)
  .then(() => void load({ manual: true }))
  .catch((e: unknown) => setError(paneError(e)))
  .finally(() => {
    setCheckingOut(null);
    setBusy(null);
  });
```

Apply the same shape to the BranchesPanel `onDoubleClick` checkout block. Keep `!checkingOut` guards unchanged.

- [ ] **Step 2: Diff ops set busy while git diff runs**

```typescript
// d on branch:
setBusy(busyLabel({ kind: "diff-branch", name: b.name }));
getBranchDiff(repo, b.name)
  .then((body) => setDiff({ title: `diff ${b.name}`, body }))
  .catch((e: unknown) => setError(paneError(e)))
  .finally(() => setBusy(null));

// d on status file / double-click:
setBusy(busyLabel({ kind: "diff-file", path: sel.path }));
getFileDiff(repo, sel.path)
  .then((body) => setDiff({ title: `diff ${sel.path}`, body }))
  .catch((e: unknown) => setError(paneError(e)))
  .finally(() => setBusy(null));

// history/flow commit open:
setBusy(busyLabel({ kind: "commit", short }));
getCommitDetail(repo, hash)
  .then((body) => setDiff({ title, body }))
  .catch((e: unknown) => setError(paneError(e)))
  .finally(() => setBusy(null));
```

Untracked-file `(untracked …)` path sets no busy (synchronous, no await).

- [ ] **Step 3: Detail open/refresh, approve, create**

```typescript
const openPRDetail = (num: number): void => {
  setFiltering(false);
  setError("");
  setPrDetail(null);
  setPrDetailError("");
  setDetailScroll(0);
  setPrDetailLoading(true);
  setBusy(busyLabel({ kind: "pr", number: num }));
  getPRDetail(repo, num)
    .then((d) => setPrDetail(d))
    .catch((e: unknown) => setPrDetailError(paneError(e)))
    .finally(() => {
      setPrDetailLoading(false);
      setBusy(null);
    });
};
// Mirror for openIssueDetail (kind: "issue"), refreshPRDetail,
// refreshIssueDetail (same labels, same finally clearing both
// *Loading flag and busy).

// approve (a in PR detail):
setBusy(busyLabel({ kind: "approve", number: num }));
approvePR(repo, num)
  .then(() => refreshPRDetail(num))
  .catch((e: unknown) => {
    setError(paneError(e));
    setBusy(null);
  });
// refreshPRDetail sets its own busy; on success path do not clear
// twice — refreshPRDetail's finally clears.

// create (c on pane 4):
setBusy(busyLabel({ kind: "create-pr" }));
setNotice("");
startPRCreate(repo)
  .then((url) => {
    setNotice(url ? `created ${url}` : "created PR");
    void load({ manual: true });
  })
  .catch((e: unknown) => {
    setNotice("");
    setError(paneError(e));
  })
  .finally(() => setBusy(null));
```

Remove the old `setNotice("creating PR…")` line — `busy` replaces it.

- [ ] **Step 4: Run full verification**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm vitest run`
Expected: PASS (all suites, including new `test/busyStatus.test.ts`).

Manual TUI check: `pnpm dev -- --repo <path>`: press `r` (Refreshing…), Enter on branch (Checking out…), `d` on branch/file (Loading diff…), Enter on PR/issue (Loading PR/issue…), `a` (Approving…), `c` on PRs pane (Creating PR…); wait 30s — no footer flicker from background tick.

- [ ] **Step 5: Commit**

```bash
git add src/app.tsx
git commit -m "feat: busy status for checkout, diff, detail, approve, create"
```
