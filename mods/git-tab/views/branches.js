import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { sanitizeRenderText } from "../format.js";
import { filterBranches } from "../filters.js";
import { Badge, BusyView, Empty, ListScroller, Message, codeFont } from "../ui.js";

export default {
  renderBranches(t) {
    const branches = filterBranches(this.branches, this.branchFilter);
    if (this.paneErrors.branches) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.branches, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Loading branches…");
    if (!branches.length) {
      return Empty({
        title: this.branchFilter ? "No matching branches" : "No branches",
        detail: this.branchFilter ? `Nothing matches “${this.branchFilter.trim()}”.` : "",
        icon: "branch",
      });
    }

    const safe = this.safeIndex("branches", branches.length);
    const list = ListScroller("git-branches", this.scrolls.branches);
    if (this.reveal?.pane === "branches") {
      this.scrolls.branches.scroll_to_item(safe);
      this.reveal = null;
    }
    return list.children(
      branches.map((branch, index) => {
        const active = index === safe;
        const remote = branch.name.startsWith("remotes/");
        const age = branch.lastCommitDate ? relativeTime(branch.lastCommitDate) : "";
        return h_flex()
          .id(`git-branch-${branch.name}`)
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
            this.sel.branches = index;
            this.reveal = { pane: "branches", index };
            this.handle.focus();
            if (event.click_count >= 2 && !remote) this.checkoutSelectedBranch(cx);
            cx.notify();
          })
          .child(
            div()
              .w(8)
              .flex_none()
              .text_size(10)
              .text_color(branch.current ? t.done : remote ? t.dim : t.muted)
              .child(branch.current ? "●" : "•"),
          )
          .child(
            div()
              .flex_none()
              .max_w(190)
              .min_w(0)
              .truncate()
              .font_family(codeFont())
              .text_size(11.5)
              .text_color(branch.current ? t.done : t.foreground)
              .child(branch.name),
          )
          .child(
            div()
              .flex_none()
              .text_size(10)
              .text_color(branch.ahead ? t.done : t.dim)
              .child(`↑${branch.ahead}`),
          )
          .child(
            div()
              .flex_none()
              .text_size(10)
              .text_color(branch.behind ? t.blocked : t.dim)
              .child(`↓${branch.behind}`),
          )
          .when(branch.upstream === "gone", (el) => el.child(Badge("gone", t.blocked)))
          .when(remote && branch.upstream !== "gone", (el) =>
            el.child(div().flex_none().text_size(9.5).text_color(t.dim).child("remote")),
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(11)
              .text_color(t.dim)
              .child(sanitizeRenderText(branch.lastCommit || "—")),
          )
          .when(Boolean(age), (el) =>
            el.child(div().flex_none().text_size(10).text_color(t.dim).child(age)),
          );
      }),
    );
  },
};
