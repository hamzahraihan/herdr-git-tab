import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { relativeTime } from "../format.js";
import { filterCommits } from "../filters.js";
import { BusyView, Empty, ListScroller, Message, codeFont } from "../ui.js";

export default {
  renderCommits(t) {
    const commits = filterCommits(this.commits, this.query);
    if (this.paneErrors.commits) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.commits, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Loading commits…");
    if (!commits.length) {
      return Empty({
        title: this.commits.length ? "No matching commits" : "No commits yet",
        detail: this.commits.length
          ? `Nothing in this history matches “${this.query.trim()}”.`
          : this.root
            ? "This repository has no history yet."
            : "",
        icon: "branch",
      });
    }

    const safe = this.safeIndex("commits", commits.length);
    const list = ListScroller("git-commits", this.scrolls.commits);
    if (this.reveal?.pane === "commits") {
      this.scrolls.commits.scroll_to_item(safe);
      this.reveal = null;
    }
    return list.children(
      commits.map((commit, index) => {
        const active = index === safe;
        const refs = commit.refs.filter((ref) => ref !== "HEAD").join(" ");
        return h_flex()
          .id(`git-commit-${commit.hash}`)
          .h(28)
          .flex_none()
          .px(8)
          .gap(7)
          .items_center()
          .rounded(6)
          .when(active, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .cursor_pointer()
          .on_click((event, cx) => {
            this.sel.commits = index;
            this.reveal = { pane: "commits", index };
            this.handle.focus();
            if (event.click_count >= 2) this.openCommit(commit, cx);
            cx.notify();
          })
          .child(
            div()
              .w(7)
              .flex_none()
              .text_size(10)
              .text_color(commit.parents.length > 1 ? t.accent : t.dim)
              .child(commit.parents.length > 1 ? "◆" : "●"),
          )
          .child(
            div()
              .flex_none()
              .font_family(codeFont())
              .text_size(10.5)
              .text_color(t.dim)
              .child(commit.shortHash),
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_color(active ? t.foreground : t.muted)
              .child(commit.subject || "(no subject)"),
          )
          .when(Boolean(refs), (el) =>
            el.child(
              div()
                .flex_none()
                .max_w(150)
                .min_w(0)
                .truncate()
                .text_size(10)
                .text_color(t.accent)
                .tooltip(commit.refs.join(", "))
                .child(refs),
            ),
          )
          .child(
            div()
              .flex_none()
              .text_size(10.5)
              .text_color(t.dim)
              .child(`${commit.author || "?"} · ${relativeTime(commit.date)}`),
          );
      }),
    );
  },
};
