# herdr-git-tab

Herdr tab plugin: keyboard-driven git + GitHub TUI showing six panes in one view.

## Run

```sh
pnpm install
pnpm build
node dist/cli.js --repo <path> [--refresh <secs>] [--no-watch]
```

When stdout is not a TTY (Herdr non-interactive capture), the CLI prints
`git status -sb` + `git log --oneline -20` and exits 0.

## TUI

| Key | Action |
| --- | --- |
| 1–6 | Focus pane (1 history, 2 graph, 3 branches, 4 PRs, 5 issues, 6 status) |
| `/` | Filter commits/PRs/issues by substring |
| `r` | Manual refresh |
| `j` / `k` / arrows | Move selection (history, branches, PRs, issues) |
| `Enter` | Branches → `git checkout`; PRs/Issues → `gh ... view --web` |
| `q` | Quit |

## Pane behavior

- **History / Graph**: `git log --graph --pretty=format:... --all -n 100`. Empty repo
  shows "No commits yet".
- **Branches**: `git branch -vv --all`. `*` marks current, `[gone]` on missing upstream,
  `↑N ↓M` for ahead/behind. Detached HEAD → single `(detached)` row.
- **Status**: `git status --porcelain=v1 -b`. Sections for branch, staged, unstaged,
  untracked; "clean ✓" when empty.
- **PRs / Issues**: `gh pr list` / `gh issue list` JSON. `gh` missing or unauthenticated
  → yellow `gh unavailable` banner, other panes still render. No GitHub remote →
  `(no GitHub remote)` subtitle.

## Error handling

- Not a git repository → fatal screen with the path and exit hint; never blank.
- `git` not on PATH → `GIT_UNAVAILABLE` per pane; non-fatal.
- `gh` errors degrade PRs/Issues panes; never fail the whole UI.

## Herdr tab wiring

Copy `herdr-tab.yaml` into your herdr-spreader/infra config:

```yaml
tabs:
  - name: git
    command: herdr-git-tab --repo {{repo}}
```

## Development

```sh
pnpm dev          # tsx src/cli.tsx
pnpm typecheck
pnpm test         # vitest
pnpm tsx test/smoke.ts
```
