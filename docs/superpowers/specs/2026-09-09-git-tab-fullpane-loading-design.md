# Git Tab — Full-Pane Loading View Design (v2)

Date: 2026-09-09
Status: Approved, awaiting implementation plan
Supersedes (render only): `2026-09-09-git-tab-loading-status-design.md`
(prior `busy` setter wiring, label table, and manual-only scope all stand)

## Problem

The footer-line status (v1) leaves stale content visible during loads.
User wants: the whole content view IS the loading status; results appear
only after loading completes.

## Decisions (from brainstorming)

1. Scope: content pane only. Header tabs + keybar footer stay visible.
2. Replace-all: stale panels/diffs/details are hidden while loading.

## Design — busy-driven pane takeover

### Render (`src/app.tsx` only)

The content pane (the `flexGrow` box between `HeaderBar` and the
filter/notice/error lines) renders:

1. `busy != null` → centered `LoadingView` showing `● {busy}`
   (cyan dot, `truncateToWidth`), reusing the v1 `busyLabel` strings.
2. Else if first paint (`loading && commits.length === 0 && !status`) →
   same `LoadingView` with `Loading <repo>…` (replaces today's top-line
   loader box).
3. Else → today's panels / diff overlay / PR-issue detail, unchanged.

`LoadingView` is a tiny inline component (or small new file
`src/views/LoadingView.tsx` if the implementer prefers): a centered box
with the dot + text. No spinner animation, no skeleton — YAGNI.

### Footer + inline loader cleanup

- Remove the v1 footer `busy` box (takeover subsumes it).
- Remove the inline `Loading PR…` / `Loading issue…` boxes in the detail
  panes (unreachable while `busy` is set); keep their error boxes.
- Keep `notice` / `error` / filter lines as-is.

### Data flow

- All existing `setBusy` / `finally(clear)` sites from v1 stay unchanged.
- One addition: scope/repo-driven reloads take over the pane. A
  `mounted` ref makes the `[load]` effect call `void load()` silent only
  on first mount and `void load({ manual: true })` on later repo/scope
  changes (old repo's content must not linger after a switch).
- The 30s background tick and repo-follow poll stay silent AND keep stale
  content (`busy` null → content renders). The three explicit
  `void load({ manual: true })` calls right after `setScope` (stale-scope
  closure, parked in v1) are removed — the scope-driven effect load is
  the single fresh reload.
- `checkingOut` guard stays. `busyLabel`, `src/git.ts`,
  `src/github.ts`, non-TTY fallback untouched.

### Error handling

Unchanged from v1: `busy` cleared in `finally`, errors flow to existing
`error` / `*Error` / `paneErrors` states, which render once `busy`
clears.

### Testing

- `pnpm typecheck` + full `pnpm vitest run` (no new unit surface;
  `busyLabel` tests stand).
- Interactive matrix (`pnpm dev -- --repo <path>`): `r`, branch/PR
  checkout, `d` branch/file, commit open, PR/issue open+refresh,
  approve, PR create → pane blanks with the correct label, then results
  restore; header/keybar visible throughout; 30s tick never blanks.

## Out of scope

Animations, skeletons, progress %, per-pane loaders, background-tick
takeover, cancellation.

## Self-review

- No placeholders; every render branch and data-flow change is concrete.
- Consistent with content-pane-only + replace-all answers.
- Single-plan scope: one file (`app.tsx`), ±30 lines.
- No ambiguity: takeover condition order (busy → first-paint → content)
  is explicit; the only behavior change vs v1 is listed above.
