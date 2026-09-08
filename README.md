# herdr-git-tab

Herdr tab plugin: keyboard-driven git + GitHub TUI showing six panes in one view.

## Install

Requires Herdr ≥ 0.8, Node ≥ 20, and `pnpm`.

```sh
# From a checkout (local development):
herdr plugin link /path/to/herdr-git-tab
pnpm install
pnpm build

# Or from GitHub (Herdr runs the build for you):
herdr plugin install <owner>/herdr-git-tab
```

Then register the keybinding (one time). Herdr gives plugins no key API, so
this explicit command appends one `[[keys.command]]` block to your user
config (`%APPDATA%\herdr\config.toml` on Windows,
`~/.config/herdr/config.toml` on macOS/Linux, or `HERDR_CONFIG_PATH`) and
reloads the server. It is idempotent — re-running changes nothing:

```sh
node dist/bin/setup-keys.js [--key prefix+.] [--no-reload]
```

Press `prefix` then `.` to open the Git tab in the active workspace.

## Run

```sh
pnpm install
pnpm build
node dist/cli.js [--repo <path>] [--refresh <secs>] [--no-watch]
```

The tab follows the active Herdr workspace automatically: it reads the live
shell cwd of the workspace's focused pane, so `cd` next door repoints the
TUI within seconds — no setup, no manual path entry. Pass `--repo <path>`
to pin a fixed repo instead.

When stdout is not a TTY (Herdr non-interactive capture), the CLI prints
`git status -sb` + `git log --oneline -20` and exits 0.

## TUI

| Key | Action |
| --- | --- |
| 1–6 | Focus pane (1 history, 2 graph, 3 branches, 4 PRs, 5 issues, 6 status) |
| Click | Tab strip or row to select it; wheel scrolls the selection (needs `ui.mouse_capture = false` — Herdr captures mouse input by default) |
| `/` | Filter commits/PRs/issues by substring |
| `r` | Manual refresh |
| `j` / `k` / arrows | Move selection (history, branches, PRs, issues) |
| `Enter` | Branches → `git checkout`; PRs/Issues → `gh ... view --web` |
| `q` | Quit |

## Pane behavior

- **History / Graph**: `git log --graph --pretty=format:... --all -n 100`. Empty repo
  shows "No commits yet".
- **Branches**: `git branch -vv --all`. `*` marks current, `[gone]` on missing upstream,
- **Status**: `git status --porcelain=v1 -b`. Sections for branch, staged, unstaged,
  untracked; "working tree: clean" when empty. Heads up with an origin summary
  (`remote · N commits · span`) and per-author commit bars.
- **PRs / Issues**: `gh pr list` / `gh issue list` JSON. `gh` missing or unauthenticated
  → yellow `gh unavailable` banner, other panes still render. No GitHub remote →
  `(no GitHub remote)` subtitle.

## Error handling

- Not a git repository → fatal screen with the path and exit hint; never blank.
- `git` not on PATH → `GIT_UNAVAILABLE` per pane; non-fatal.
- `gh` errors degrade PRs/Issues panes; never fail the whole UI.

## Open Git Tab

Right-click context menus in herdr v0.8.x do not surface plugin actions, so
use the keybinding registered by `setup-keys` during install: press `prefix`
then `.` to open the Git tab in the active workspace. It adds this block to
your user `config.toml` (remove it to unbind):

```toml
# herdr-git-tab: added by `node dist/bin/setup-keys.js`. Remove to unbind.
[[keys.command]]
key = "prefix+."
type = "plugin_action"
command = "herdr-git-tab.open-git-tab"
description = "Open Git Tab"
```

## Herdr tab wiring

Copy `herdr-tab.yaml` into your herdr-spreader/infra config:

## Development

```sh
pnpm dev          # tsx src/cli.tsx
pnpm typecheck
pnpm test         # vitest
pnpm tsx test/smoke.ts
```
