# Git Tab — Global Loading Status Design

Date: 2026-09-09
Status: Approved, awaiting implementation plan

## Problem

`src/app.tsx` only shows `Loading <repo>…` on first paint
(`loading && commits.length === 0 && !status`). All subsequent
async work is silent except two ad-hoc cases:

- `checkingOut: string | null` spinner for `git checkout` / `gh pr checkout`
- `notice = "creating PR…"` for `startPRCreate`

Silent ops: manual `r` refresh, scope toggle (`m`), repo-follow switch,
branch/file/commit diff (`getBranchDiff`, `getFileDiff`, `getCommitDetail`),
PR/issue detail open + refresh (`getPRDetail`, `getIssueDetail`),
PR approve (`approvePR`), background `load()` refreshes.

User asked: a loading status for every refresh, checkout, commit fetch,
and everything that requires loading.

## Decisions (from brainstorming)

1. Display: single status line above the KeyBar (not per-pane spinners,
   not header+footer combo).
2. Scope: manual user-triggered ops only. Timed auto-refresh (30s) and
   repo-follow poll stay silent to avoid flicker/noise.

## Design — Approach A: unified `busy` status line

### Architecture

- No new files. All change in `src/app.tsx`.
- Introduce `const [busy, setBusy] = useState<string | null>(null)`.
- `busy` subsumes the `checkingOut` footer box and the transient
  `creating PR…` notice. Keep the `checkingOut` guard flag (prevents
  double-checkout) but render via `busy`; or keep both with `busy`
  as the single rendered line and `checkingOut` as the in-flight guard.
- Keep existing `loading` bool for the first-paint gate only.
- Render directly above KeyBar, same style as current checkout line:

```tsx
{busy ? (
  <box paddingX={1}>
    <text fg="cyan">● </text>
    <text>{truncateToWidth(busy, width)}</text>
  </box>
) : null}
```

### Data flow (label per op, set before await, clear in finally)

| Trigger | Call site in `app.tsx` | `busy` label |
|---|---|---|
| `r` manual refresh | `handleKeyInput` `input === "r"` | `Refreshing…` |
| scope toggle `m` | `setScope` sites (main list + detail) | `Refreshing…` |
| repo switch | repo/scope reset effect + `load({manual:true})` | `Refreshing…` then `Loading <repo>…` on empty |
| checkout branch (Enter / double-click) | `checkoutBranch(...).then(load)` | `Checking out <branch>…` |
| checkout PR (`c` in PR detail) | `checkoutPR(...)` | `Checking out PR #<n>…` |
| branch diff (`d` on pane 3) | `getBranchDiff` | `Loading diff <branch>…` |
| file diff (`d` on pane 6 / double-click) | `getFileDiff` | `Loading diff <path>…` |
| commit detail (history/flow double-click) | `getCommitDetail` | `Loading commit <short>…` |
| PR detail open / refresh | `openPRDetail` / `refreshPRDetail` | `Loading PR #<n>…` |
| issue detail open / refresh | `openIssueDetail` / `refreshIssueDetail` | `Loading issue #<n>…` |
| PR approve (`a` in detail) | `approvePR` | `Approving PR #<n>…` |
| PR create (`c` on pane 4) | `startPRCreate` | `Creating PR…` (replaces transient `notice`) |

`load()` signature becomes `load(opts?: { manual?: boolean })`:
auto-interval and follow-poll pass nothing/false (silent);
`r`, `m`, repo-change pass `{ manual: true }` (sets/clears `busy`).
Overlapping manual ops overwrite the label — acceptable (ops are
serial from keyboard); no counter/stack per YAGNI.

Detail panes keep their existing inline `Loading PR…` /
`Loading issue…` boxes for the empty state; `busy` additionally
covers the footer so refreshes of an already-open detail are visible.

### Error handling

- Every setter paired with `finally(() => setBusy(null))` — or for
  `load()`, cleared after `Promise.allSettled` + merged-branches step.
- Guard against stale clear on repo switch: the reset effect already
  clears `checkingOut`; extend it to `setBusy(null)`.
- Errors continue to flow to existing `error` / `prDetailError` /
  `issueDetailError` / `paneErrors`. No new error states.

### Testing

- `pnpm typecheck` + `pnpm test` (vitest) — no new unit surface except
  possibly a `busyLabel(op)` helper if extracted (then add table test).
- Manual TUI: `r` → footer `Refreshing…`; Enter on branch → `Checking
  out…`; `d` on branch/file → `Loading diff…`; Enter on PR/issue →
  `Loading PR/issue…`; `a` → `Approving…`; `c` on PRs pane →
  `Creating PR…`; background 30s tick → no footer flicker.

## Out of scope

- Per-pane skeletons, header spinner, progress %, cancellation,
  background-refresh indicator, non-TTY fallback changes.

## Self-review

- No TBD/TODO placeholders; labels concrete.
- Consistent with "single line" + "manual only" answers.
- Single-plan scope: one file (`app.tsx`), ~40 lines + render block.
- No ambiguity: label table is exhaustive over current `app.tsx` async
  call sites (`git.ts` / `github.ts` unchanged).
