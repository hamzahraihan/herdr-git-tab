import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { Action, Icon, codeFont } from "../ui.js";

export default {
  renderFatal(t, cx) {
    const fatal = this.fatal ?? {};
    return v_flex()
      .id("git-fatal")
      .flex_1()
      .min_h(0)
      .px(28)
      .gap(10)
      .items_center()
      .justify_center()
      .text_center()
      .child(Icon("branch", 26).text_color(t.dim))
      .child(
        div()
          .text_size(15)
          .font_semibold()
          .text_color(t.foreground)
          .child(fatal.title ?? "No repository"),
      )
      .when(Boolean(fatal.folder), (el) =>
        el.child(
          div()
            .max_w(440)
            .p(8)
            .rounded(7)
            .bg(t.canvas)
            .border_1()
            .border_color(t.border)
            .font_family(codeFont())
            .text_size(11.5)
            .text_color(t.muted)
            .whitespace_normal()
            .child(fatal.folder),
        ),
      )
      .when(Boolean(fatal.detail), (el) =>
        el.child(
          div()
            .max_w(440)
            .text_size(12)
            .text_color(t.dim)
            .whitespace_normal()
            .child(fatal.detail),
        ),
      )
      .child(
        Action({
          id: "git-retry",
          icon: "refresh",
          label: "Check again",
          onClick: (cx) => this.refresh(cx, { manual: true, force: true }),
        }),
      );
  },
};
