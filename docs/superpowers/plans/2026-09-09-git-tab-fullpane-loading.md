# Full-Pane Loading View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The content pane itself becomes the loading status during any manual load, replacing stale content until results arrive.

**Architecture:** Add an inline `LoadingView` component in `src/app.tsx`; gate the existing content-pane children behind `busy` (else first-paint, else content); remove the now-redundant footer `busy` box and inline detail loaders; make scope/repo-driven reloads manual after first mount via a `mounted` ref.

**Tech Stack:** TypeScript, React 19, OpenTUI (@opentui/react), vitest

## Global Constraints

- Content pane only: header tabs (`HeaderBar`) and keybar footer always render; only the `flexGrow` content box is taken over.
- Replace-all: while `busy` is non-null, no panel, diff, or detail renders — only `LoadingView`.
- Only `<box>`/`<text>` props already used in `src/`: `flexDirection`, `flexGrow`, `padding`, `paddingX`, `paddingY`, `fg`. Do NOT use `alignItems`, `justifyContent`, or any other unverified layout prop.
- 30s background tick and repo-follow poll stay silent AND keep stale content.
- `busy` cleared in `finally` (existing sites unchanged); `checkingOut` guard unchanged.
- No changes to `src/busyStatus.ts`, `src/git.ts`, `src/github.ts`, non-TTY fallback.

---

### Task 1: LoadingView + pane takeover + footer cleanup

**Files:**
- Modify: `src/app.tsx:686-693` (delete first-paint top-line loader box)
- Modify: `src/app.tsx:704` (content box children gated — wrap lines 705-856 in takeover conditional)
- Modify: `src/app.tsx:866-871` (delete footer `busy` box)
- Modify: `src/app.tsx:895` (add `LoadingView` next to `KeyBar`, before `repoName`)

**Interfaces:**
- Consumes: `busy: string | null`, `loading`, `commits`, `status`, `repo`, `width`, `truncateToWidth` (all existing in `App`).
- Produces: `LoadingView({ label, width }: { label: string; width: number })` used by Task 1 render only; `busy`-driven pane gate that Task 2's effect change relies on.

- [ ] **Step 1: Delete the first-paint top-line loader (lines 688-693)**

Delete exactly:

```tsx
      {loading && commits.length === 0 && !status ? (
        <box paddingX={1}>
          <text fg="cyan">● </text>
          <text> {truncateToWidth(`Loading ${repo}…`, width)}</text>
        </box>
      ) : null}
```

- [ ] **Step 2: Gate the content box on busy / first-paint / content**

Replace the opening of the content box and wrap its existing children.
Change:

```tsx
      <box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {diff ? (
```

to:

```tsx
      <box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {busy ? (
          <LoadingView label={busy} width={width} />
        ) : loading && commits.length === 0 && !status ? (
          <LoadingView label={`Loading ${repo}…`} width={width} />
        ) : (
          <>
        {diff ? (
```

And close the fragment at the end of the content box: the content box
currently ends with the StatusPanel block followed by `)}` and
`</box>` (lines ~855-857). Change that ending from:

```tsx
        )}
      </box>
```

to:

```tsx
        )}
          </>
        )}
      </box>
```

Re-indent the wrapped children by two spaces so the file stays
consistent (mechanical only — do not alter any panel/diff/detail logic,
props, or conditions inside).

- [ ] **Step 3: Delete the footer busy box (lines 866-871)**

Delete exactly:

```tsx
      {busy ? (
        <box paddingX={1}>
          <text fg="cyan">● </text>
          <text>{truncateToWidth(busy, width)}</text>
        </box>
      ) : null}
```

Keep `notice`, `error`, and detail-error boxes untouched.

- [ ] **Step 4: Add the LoadingView component next to KeyBar**

```tsx
function LoadingView({ label, width }: { label: string; width: number }) {
  return (
    <box padding={1}>
      <text fg="cyan">● </text>
      <text>{truncateToWidth(label, Math.max(8, width - 4))}</text>
    </box>
  );
}
```

Place it directly above `function KeyBar` (line 895). Same visual
language as the removed loaders; row `<box>` + `padding` only, per
Global Constraints.

- [ ] **Step 5: Run typecheck and full suite**

Run: `pnpm typecheck`
Expected: PASS, no errors.

Run: `pnpm vitest run`
Expected: PASS, 132/132 (13 files + `test/busyStatus.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/app.tsx
git commit -m "feat: full-pane loading view driven by busy"
```

### Task 2: Scope/repo reload takeover + inline loader removal

**Files:**
- Modify: `src/app.tsx:1` (add `useRef` to the React import)
- Modify: `src/app.tsx:116` (add `mounted` ref next to `busy` state)
- Modify: `src/app.tsx:236-238` (load effect: silent first mount, manual after)
- Modify: `src/app.tsx:422-427` (PR-detail `m`: drop stale explicit load, keep `closePRDetail`)
- Modify: `src/app.tsx:490-494` (issue-detail `m`: drop stale explicit load, keep `closeIssueDetail`)
- Modify: `src/app.tsx:528-532` (main-list `m`: drop stale explicit load)
- Modify: `src/app.tsx:780-785` (delete inline `Loading PR…` box, keep error box)
- Modify: `src/app.tsx:815-820` (delete inline `Loading issue…` box, keep error box)

**Interfaces:**
- Consumes: pane gate + `LoadingView` from Task 1; `load(opts?: { manual?: boolean })`, reset effect on `[repo, scope]` (existing).
- Produces: nothing new (end of plan).

- [ ] **Step 1: Add useRef import and mounted ref**

Change line 1:

```tsx
import React, { useCallback, useEffect, useState } from "react";
```

to:

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
```

Add next to the `busy` state (line 116):

```tsx
  const [busy, setBusy] = useState<string | null>(null);
  // First `[load]`-effect run is the initial mount (silent, first-paint
  // gate covers it); later repo/scope changes reload as manual so the
  // pane takes over instead of showing the old repo's content.
  const mounted = useRef(false);
```

- [ ] **Step 2: Make the load effect manual after first mount**

Change:

```tsx
  useEffect(() => {
    void load();
  }, [load]);
```

to:

```tsx
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void load();
      return;
    }
    void load({ manual: true });
  }, [load]);
```

The interval effect (`void load()` every `refreshSecs`) and the
follow-poll (`setRepo` only) are untouched and stay silent.

- [ ] **Step 3: Drop the three stale explicit loads after setScope**

PR-detail `m` (lines 422-427) — change:

```tsx
      if (input === "m") {
        setScope((s) => (s === "repo" ? "mine" : "repo"));
        void load({ manual: true });
        closePRDetail();
        return;
      }
```

to:

```tsx
      if (input === "m") {
        setScope((s) => (s === "repo" ? "mine" : "repo"));
        closePRDetail();
        return;
      }
```

The stale-closure `void load({ manual: true })` used the pre-toggle
scope and caused a wasted double fetch; the scope-driven effect load
from Step 2 is now the single fresh manual reload. Apply the same
deletion (only the `void load({ manual: true });` line, keep the
surrounding `closeIssueDetail()` / plain `return`) at the issue-detail
`m` handler and the main-list `m` handler. The main-list `r` handler's
`void load({ manual: true });` stays.

- [ ] **Step 4: Delete the unreachable inline detail loaders**

Delete exactly (PR detail):

```tsx
            {prDetailLoading && !prDetail ? (
              <box>
                <text fg="cyan">● </text>
                <text> Loading PR…</text>
              </box>
            ) : null}
```

and exactly (issue detail):

```tsx
            {issueDetailLoading && !issueDetail ? (
              <box>
                <text fg="cyan">● </text>
                <text> Loading issue…</text>
              </box>
            ) : null}
```

Keep both error boxes and both detail panels. Keep the
`prDetailLoading` / `issueDetailLoading` states (still used in
`showingPRDetail` / `showingIssueDetail` conditions).

- [ ] **Step 5: Run typecheck and full suite**

Run: `pnpm typecheck`
Expected: PASS, no errors.

Run: `pnpm vitest run`
Expected: PASS, 132/132.

Manual TUI check (`pnpm dev -- --repo <path>`): `r`, branch/PR
checkout, `d` on branch/file, commit open, PR/issue open+refresh,
approve, PR create → pane blanks with the correct label, header/keybar
stay, results restore; `m` and repo switch take over the pane; 30s
tick never blanks. (Headless environments: verify by inspection and
say so in the report.)

- [ ] **Step 6: Commit**

```bash
git add src/app.tsx
git commit -m "feat: takeover on scope/repo reload, drop inline loaders"
```
