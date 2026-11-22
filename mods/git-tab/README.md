# Git

A git + GitHub workspace pane for Herdr: history, branch flow, branches, pull
requests, issues, the working tree, and a contribution heatmap in one panel.

It follows the active space's focused terminal folder and runs git/gh on that
machine, so a remote space reads the remote repository. The panel body starts
below Herdr's tab bar and ends above its status bar. A **Git** button in the tab
bar, next to Changes (`mods/tabs-issues`), shows and hides the panel; it keeps
its width and position when it comes back.

## Panes

| Tab | Shows |
| --- | --- |
| Commits | `git log --graph` across all branches, last 100: hash, subject, refs, author, age. |
| Flow | One lane per branch, trunk first; merge commits as diamonds, ahead/behind, PR number, and `merged → main`. |
| Branches | `git branch -vv --all`, current marker, upstream, `[gone]`, tip subject and age. |
| PRs | Open pull requests from `gh`: title, branch, author, review check state. |
| Issues | Open issues from `gh`: state, labels, author. |
| Status | Staged / unstaged / untracked files, branch sync, origin, per-author commit bars. |
| Heatmap | 12-52 weeks of commit activity (fits the pane), streaks, peak day, selected-day commits. |

## Keys

Global:

- `1`-`7` switch panes; `j`/`k` move; `h`/`l` move weeks on the heatmap.
- `/` filter (branches filter their own list); `m` toggle scope Repo / Mine.
- `r` refresh; `Enter` open the selected commit, branch, PR, issue, or diff.
- `d` diff the selected branch or changed file; `c` create a PR from the PR list.
- `q` backs out of a reader. In the lists it does nothing; use the tab bar's
  **Git** button to hide the pane.

Readers:

- Diff and commit readers: `j`/`k` scroll, `q`/`Esc` back, **Copy** copies the diff.
- PR detail: `c` or `Enter` checkout, `a` approve, `o` open on GitHub, `r` refresh,
  `q`/`Esc` back. It never merges, marks ready for review, or launches a terminal diff.
- Issue detail: `o` open, `r` refresh, `q`/`Esc` back.

Click or drag to select text in descriptions and diffs. The readers use Herdr's
native text surfaces; there is no terminal-style OSC 52 copy.

## Degradation

- Outside a git repository: a fatal screen with the folder, never blank.
- No `git`: command panes show the error; the panel keeps loading other data.
- No `gh` or not signed in: PRs and Issues show a `gh unavailable` banner; git
  panes keep working.
- No GitHub remote: PRs and Issues say `(no GitHub remote)`.

## Props and settings

The layout can pass `{ "folder": "/path", "machine": "vps" }` to pin a repo.
Without `folder` it follows the focused space. `machine` is a toggle name from
`hc machine ls`; omit it for this computer.

The mod has no writable settings; preferences live in `mod.json` (place/size)
and in Herdr's own settings.

## Check

```sh
herdr-app check ~/.config/herdr-app/mods/git-tab
```
