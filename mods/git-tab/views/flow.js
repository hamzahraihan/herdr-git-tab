import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { sanitizeRenderText } from "../format.js";
import { filterCommits } from "../filters.js";
import { buildBranchHierarchy } from "../hierarchy.js";

import { BusyView, Empty, ListScroller, Message, codeFont } from "../ui.js";

const flowColors = (t) => [t.ansi4, t.ansi3, t.ansi5, t.ansi6, t.ansi2, t.ansi1];

export default {
  renderFlow(t) {
    if (this.paneErrors.commits) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.commits, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Reading branch flow…");

    const commits = filterCommits(this.commits, this.query);
    const current = this.branches.find((branch) => branch.current)?.name ?? null;
    const { rows } = buildBranchHierarchy(commits, this.branches, this.prs, current);
    const trunk = rows.find((row) => row.isMain)?.name ?? null;
    const view = rows.map((row) =>
      row.name !== trunk && this.mergedNames.has(row.name)
        ? { ...row, merged: true, mergedInto: trunk }
        : row,
    );

    if (!view.length) {
      return Empty({
        title: this.commits.length ? "No matching branches" : "No commits yet",
        detail: this.query
          ? `Nothing matches “${this.query.trim()}”.`
          : "Branch lanes appear once there is history.",
        icon: "branch",
      });
    }

    const safe = this.safeIndex("flow", view.length);
    const palette = flowColors(t);
    const colors = new Map();
    let next = 0;
    for (const row of view) {
      if (row.isMain || colors.has(row.name)) continue;
      colors.set(row.name, palette[next++ % palette.length]);
    }

    const list = ListScroller("git-flow", this.scrolls.flow);
    if (this.reveal?.pane === "flow") {
      this.scrolls.flow.scroll_to_item(safe);
      this.reveal = null;
    }
    return list.children(
      view.map((row, index) => {
        const active = index === safe;
        const colorValue = row.isMain ? t.accent : colors.get(row.name) ?? t.ansi4;
        const sync = `↑${row.ahead} ↓${row.behind}`;
        return h_flex()
          .id(`git-flow-${row.name}`)
          .h(30)
          .flex_none()
          .px(8)
          .gap(6)
          .items_center()
          .rounded(5)
          .when(active, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .cursor_pointer()
          .on_click((event, cx) => {
            this.sel.flow = index;
            this.reveal = { pane: "flow", index };
            this.handle.focus();
            if (event.click_count >= 2) this.openFlowCommit(row, cx);
            cx.notify();
          })
          .child(
            div()
              .w(row.isMain ? 14 : 22)
              .flex_none()
              .font_family(codeFont())
              .text_size(11)
              .text_color(row.isMain ? colorValue : t.dim)
              .child(row.isMain ? "⑂" : "└─"),
          )
          .child(
            div()
              .w(row.isMain ? 160 : 140)
              .flex_none()
              .truncate()
              .font_medium()
              .text_color(row.isMain ? t.foreground : t.muted)
              .child(sanitizeRenderText(row.name)),
          )
          .child(div().flex_none().text_color(colorValue).child(row.merges.length ? "◆" : "●"))
          .child(div().flex_1().min_w(12).h(1).bg(colorValue))
          .child(div().flex_none().text_color(colorValue).child("›"))
          .child(div().flex_none().text_size(10.5).text_color(t.dim).child(sync))
          .when(row.prNumber !== null, (el) =>
            el.child(
              div()
                .flex_none()
                .font_family(codeFont())
                .text_size(10.5)
                .text_color(t.working)
                .child(`PR #${row.prNumber}`),
            ),
          )
          .when(row.merged, (el) =>
            el.child(
              div()
                .flex_none()
                .text_size(10.5)
                .text_color(t.done)
                .child(`merged → ${row.mergedInto ?? ""}`),
            ),
          );
      }),
    );
  },
};
