import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { sanitizeRenderText, clamp } from "../format.js";

import { spanLabel, statusPaths } from "../git.js";
import { BusyView, Empty, Icon, ListScroller, Message, codeFont } from "../ui.js";

const MAX_PER_SECTION = 10;
const MAX_AUTHORS = 5;

function marker(file, kind) {
  const value = kind === "staged" ? file.staged : kind === "unstaged" ? file.unstaged : "?";
  return value && value !== " " ? value : kind === "untracked" ? "?" : "M";
}

export default {
  renderStatus(t) {
    if (this.paneErrors.status) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.status, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Reading working tree…");
    if (!this.status) {
      return Empty({ title: "No status", detail: "This folder is not inside a worktree.", icon: "branch" });
    }

    const status = this.status;
    const paths = statusPaths(status);
    const safe = this.safeIndex("status", paths.length);
    const activePath = paths[safe]?.path ?? null;
    const children = [];
    const firstRow = new Map();
    let direct = 0;
    const push = (element) => {
      children.push(element);
      direct++;
    };

    if (this.statsLoading && !this.stats) {
      push(
        h_flex()
          .flex_none()
          .px(8)
          .py(5)
          .gap(7)
          .items_center()
          .text_size(10.5)
          .text_color(t.dim)
          .child(Icon("spinner", 12, true).text_color(t.accent))
          .child("Reading origin stats…"),
      );
    } else if (this.stats && (this.stats.remote || this.stats.authors.length)) {
      push(this.contributors(t));
    }

    const aheadText = status.ahead > 0 ? ` ↑${status.ahead}` : "";
    const behindText = status.behind > 0 ? ` ↓${status.behind}` : "";
    push(
      h_flex()
        .flex_none()
        .px(8)
        .pt(4)
        .gap(5)
        .items_center()
        .child(div().text_size(10.5).text_color(t.dim).child("Branch"))
        .child(
          div()
            .font_family(codeFont())
            .text_size(11.5)
            .font_medium()
            .text_color(t.foreground)
            .child(sanitizeRenderText(status.branch || "(detached)")),
        )
        .when(status.ahead > 0, (el) => el.child(div().text_size(10.5).text_color(t.done).child(aheadText)))
        .when(status.behind > 0, (el) => el.child(div().text_size(10.5).text_color(t.blocked).child(behindText))),
    );

    push(
      h_flex()
        .flex_none()
        .px(8)
        .pt(2)
        .pb(4)
        .gap(5)
        .items_center()
        .text_size(10.5)
        .child(div().text_color(t.dim).child("Sync with origin:"))
        .child(
          div()
            .text_color(status.ahead > 0 ? t.done : status.behind > 0 ? t.blocked : t.muted)
            .child(status.ahead > 0 ? `${status.ahead} ahead` : status.behind > 0 ? "" : "in sync"),
        )
        .when(status.behind > 0, (el) =>
          el.child(div().text_color(t.blocked).child(`· ${status.behind} behind`)),
        ),
    );

    const fileRow = (file, kind) => {
      const index = paths.findIndex((path) => path.path === file.path);
      if (index < 0) return null;
      const selected = file.path === activePath;
      const color = kind === "staged" ? t.done : kind === "unstaged" ? t.working : t.blocked;
      if (!firstRow.has(file.path)) firstRow.set(file.path, direct);
      return h_flex()
        .id(`git-status-${kind}-${file.path}`)
        .h(24)
        .flex_none()
        .px(8)
        .gap(7)
        .rounded(5)
        .items_center()
        .when(selected, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .cursor_pointer()
        .on_click((event, cx) => {
          this.sel.status = index;
          this.reveal = { pane: "status", index };
          this.handle.focus();
          if (event.click_count >= 2) this.openFileDiff({ path: file.path, kind }, cx);
          cx.notify();
        })
        .child(
          div()
            .w(14)
            .flex_none()
            .font_family(codeFont())
            .text_size(10)
            .text_color(color)
            .child(marker(file, kind)),
        )
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .font_family(codeFont())
            .text_size(11)
            .text_color(color)
            .child(file.path),
        );
    };

    const section = (label, color, files, kind) => {
      push(
        h_flex()
          .flex_none()
          .px(8)
          .pt(7)
          .pb(3)
          .gap(5)
          .items_center()
          .child(div().text_size(11).font_medium().text_color(color).child(label))
          .child(div().text_size(10).text_color(t.dim).child(`(${files.length})`))
          .when(files.length === 0, (el) =>
            el.child(div().text_size(10).text_color(t.dim).child("(empty)")),
          ),
      );
      for (const file of files.slice(0, MAX_PER_SECTION)) {
        const row = fileRow(file, kind);
        if (!row) continue;
        push(row);
      }
      if (files.length > MAX_PER_SECTION) {
        push(
          div()
            .px(10)
            .py(3)
            .text_size(10)
            .text_color(t.dim)
            .child(`+${files.length - MAX_PER_SECTION} more`),
        );
      }
    };

    section("Staged", t.done, status.staged, "staged");
    section("Unstaged", t.working, status.unstaged, "unstaged");
    section("Untracked", t.blocked, status.untracked, "untracked");

    const clean =
      status.staged.length === 0 &&
      status.unstaged.length === 0 &&
      status.untracked.length === 0;
    if (clean) {
      push(
        h_flex()
          .flex_none()
          .px(8)
          .py(8)
          .gap(6)
          .items_center()
          .child(div().size(7).rounded(4).bg(t.done))
          .child(div().text_size(11.5).text_color(t.done).child("working tree: clean")),
      );
    }

    const scroller = ListScroller("git-status", this.scrolls.status);
    if (this.reveal?.pane === "status") {
      this.scrolls.status.scroll_to_item(firstRow.get(activePath) ?? 0);
      this.reveal = null;
    }
    return div()
      .relative()
      .flex_1()
      .min_h(0)
      .child(scroller.children(children))
      .child(Scrollbar.vertical("git-status").absolute().inset_0());
  },

  contributors(t) {
    const stats = this.stats;
    if (!stats) return div();
    const span = spanLabel(stats);
    const authors = stats.authors.slice(0, MAX_AUTHORS);
    const barMax = clamp(Math.round((this.width || 560) * 0.45) - 120, 40, 260);
    const bars = scaleBars(authors.map((author) => author.count), barMax);
    return v_flex()
      .id("git-contributors")
      .flex_none()
      .w_full()
      .p(10)
      .gap(5)
      .rounded(8)
      .border_1()
      .border_color(t.border)
      .bg(t.canvas)
      .when(Boolean(stats.remote), (el) =>
        el.child(
          h_flex()
            .gap(6)
            .items_center()
            .child(div().text_size(10).text_color(t.dim).child("origin"))
            .child(
              div()
                .flex_1()
                .min_w(0)
                .truncate()
                .text_size(11)
                .text_color(t.muted)
                .tooltip(stats.remote)
                .child(stats.remote),
            ),
        ),
      )
      .child(
        div()
          .text_size(10.5)
          .text_color(t.dim)
          .child(
            `${plural(stats.total, "commit")}${span ? ` · ${span}` : ""}` +
              (stats.total > 0 ? " across all refs" : ""),
          ),
      )
      .children(
        authors.map((author, index) =>
          h_flex()
            .flex_none()
            .gap(6)
            .items_center()
            .child(
              div()
                .w(94)
                .flex_none()
                .truncate()
                .text_size(10.5)
                .text_color(t.foreground)
                .child(sanitizeRenderText(author.name)),
            )
            .child(
              div()
                .h(6)
                .w(Math.max(1, bars[index] ?? 0))
                .rounded(3)
                .bg(index === 0 ? t.accent : t.muted),
            )
            .child(div().text_size(9.5).text_color(t.dim).child(String(author.count))),
        ),
      );
  },
};
