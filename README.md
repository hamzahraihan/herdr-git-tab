# herdr-git-tab

Herdr tab plugin: keyboard-driven git + GitHub TUI showing six panes in one view.

## Install

Requires Herdr ≥ 0.8, `pnpm`, and either Bun ≥ 1.3 (the tab runs via
`bun dist/bin/launch-tab.js`) or Node ≥ 26.4 (OpenTUI native FFI).

```sh
herdr plugin install hamzahraihan/herdr-git-tab
```

Herdr clones the repo and runs the build for you.

For local development instead:

```sh
herdr plugin link /path/to/herdr-git-tab
pnpm install
pnpm build
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

## Uninstall

```sh
herdr plugin uninstall herdr-git-tab
```

Linked checkout instead:

```sh
herdr plugin unlink herdr-git-tab
```

Then remove the `herdr-git-tab` `[[keys.command]]` block from your user
`config.toml` to unbind `prefix` + `.`.

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

Six panes in one view: 1 history, 2 graph, 3 branches, 4 PRs, 5 issues,
6 status. See [Keymap](#keymap) for every binding.

## Keymap

Global (list focused, no overlay open):

| Key | Action |
| --- | --- |
| `1`–`6` | Focus pane (1 history, 2 graph, 3 branches, 4 PRs, 5 issues, 6 status) |
| `j` / `k` / `↑` / `↓` | Move selection (history, branches, PRs, issues, status files) |
| Click | Select tab-strip item or row; wheel scrolls selection (needs `ui.mouse_capture = false` — Herdr captures mouse input by default) |
| `/` | Filter commits / PRs / issues by substring (`Esc`/`Enter` done; `Backspace` deletes) |
| `m` | Toggle scope: this repo ↔ my work (`--search "involves:@me"`) |
| `r` | Refresh all panes |
| `q` | Quit (`Esc` does nothing in the list) |

Branches (pane 3):

| Key | Action |
| --- | --- |
| `Enter` | `git checkout <branch>` (local branches only; `remotes/` and `(detached)` ignored) |
| `d` | Diff overlay: `git log --oneline -20 <branch>` + `git diff --stat` (`j`/`k` scroll, `q`/`Esc` back) |

PR list (pane 4):

| Key | Action |
| --- | --- |
| `Enter` | Open detail reader (description + discussion; rail stays visible on wide terminals) |
| `c` | `gh pr create`: interactive on a terminal; in the Herdr pane (piped stdin) pushes the branch when it has no upstream and creates with `--fill`. Success shows the URL above the footer; failures show gh's message. The list reloads after. |

PR detail (opened from pane 4):

| Key | Action |
| --- | --- |
| `c` or `Enter` | `gh pr checkout <number>`, then reload branches/status |
| `a` | `gh pr review <number> --approve`, then refresh the panel |
| `o` | Open on GitHub (`gh pr view --web <number>`, fire-and-forget) |
| `r` | Refresh the panel (`gh pr view --json …`) |
| `j` / `k` / `↑` / `↓` / wheel | Scroll discussion (rail stays pinned on wide `≥100`-col terminals) |
| `q` / `Esc` | Back to the PR list (never quits the tab) |
| `d` | Nothing — detail never runs merge, ready, or terminal diff commands |

Issues (pane 5, same reader shape):

| Key | Action |
| --- | --- |
| `Enter` | Open reader: description + recent comments (last 10 shown; rail: state, labels, assignees, comment count) |
| `o` (in detail) | Open on GitHub (`gh issue view --web <number>`) |
| `r` (in detail) | Refresh the panel |
| `j` / `k` / wheel (in detail) | Scroll discussion |
| `q` / `Esc` (in detail) | Back to the issue list |

Status (pane 6) + diff overlay:

| Key | Action |
| --- | --- |
| `j` / `k` / click / wheel | Select a changed file (staged → unstaged → untracked order) |
| `d` | Diff overlay: `git diff HEAD -- <file>` (`(untracked <path>: no diff)` for new files; `j`/`k` scroll, `q`/`Esc` back) |

## Pane behavior

- **History / Graph**: `git log --graph --pretty=format:... --all -n 100`. Empty repo
  shows "No commits yet".
- **Branches**: `git branch -vv --all`. `*` marks current, `[gone]` on missing upstream.
  `Enter` checks out; `d` shows the log + diff stat overlay.
- **Status**: `git status --porcelain=v1 -b`. Sections for branch, staged, unstaged,
  untracked; "working tree: clean" when empty. `j`/`k` selects a changed file,
  `d` shows its `git diff HEAD` overlay (`(untracked …: no diff)` for new files).
  Heads up with an origin summary (`remote · N commits · span`) and per-author
  commit bars.
- **PRs**: `gh pr list` / `gh issue list` JSON (`--search "involves:@me"` when scope
  is `mine`). `gh` missing or unauthenticated → yellow `gh unavailable` banner,
  other panes still render. No GitHub remote → `(no GitHub remote)` subtitle.
  `Enter` opens the detail reader (description + discussion); wide terminals
  (`≥100` cols) show discussion left (2/3) + info rail right (branches, checks,
  reviews, labels, mergeability, stats), narrow terminals stack the same content.
  Detail keys: `c`/`Enter` checkout (`gh pr checkout`), `a` approve
  (`gh pr review --approve`), `o` open on GitHub, `r` refresh, `q`/`Esc` back.
  Detail never runs merge, ready, or terminal diff commands. List `c` starts
  `gh pr create` (interactive on a TTY; `--fill` with a push fallback when stdin is piped).
- **Issues**: same reader shape for description + recent comments; rail shows
  state, labels, assignees, and comment count.

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
