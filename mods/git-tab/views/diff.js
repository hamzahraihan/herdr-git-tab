import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { clamp } from "../format.js";
import { Action, DiffLine } from "../ui.js";

export default {
  renderDiff(t) {
    const view = this.view;
    const lines = view.lines ?? String(view.body ?? "").split("\n");
    const scroll = clamp(view.scroll ?? 0, 0, Math.max(0, lines.length - 1));
    view.scroll = scroll;
    if (this.reveal?.pane === "diff") {
      this.diffScroll.scroll_to_item(scroll);
      this.reveal = null;
    }

    return v_flex()
      .id("git-diff")
      .flex_1()
      .min_h(0)
      .child(
        h_flex()
          .h(42)
          .flex_none()
          .px(12)
          .gap(7)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(
            Action({
              id: "git-diff-back",
              icon: "chevron-left",
              label: "Back",
              onClick: (cx) => this.closeView(cx),
            }),
          )
          .child(div().flex_1().min_w(0).truncate().font_medium().child(view.title || "Diff"))
          .child(
            Action({
              id: "git-diff-copy",
              icon: "copy",
              label: "Copy",
              onClick: (cx) => {
                cx.write_to_clipboard(view.body ?? "");
                this.setNotice("Copied diff", cx);
              },
            }),
          ),
      )
      .child(
        div()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_flex()
              .id("git-diff-lines")
              .size_full()
              .overflow_y_scrollbar()
              .track_scroll(this.diffScroll)
              .py(4)
              .children(lines.map((line) => DiffLine(line, t, this.width))),
          )
          .child(Scrollbar.vertical("git-diff-lines").absolute().inset_0()),
      );
  },
};
