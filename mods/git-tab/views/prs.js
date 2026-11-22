import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { filterPRs } from "../filters.js";
import { sanitizeRenderText } from "../format.js";
import { Badge, BusyView, Empty, ListScroller, Message, codeFont } from "../ui.js";

export function checksTag(checks, t) {
  if (checks === "failure") return { label: "Changes requested", color: t.blocked };
  if (checks === "pending") return { label: "Pending", color: t.working };
  if (checks === "success") return { label: "Approved", color: t.done };
  return { label: "No checks", color: t.dim };
}

export function ghBanner(message, t) {
  return v_flex()
    .id("git-gh-banner")
    .flex_none()
    .p(10)
    .gap(4)
    .rounded(8)
    .border_1()
    .border_color(t.working)
    .bg(t.canvas)
    .child(
      h_flex()
        .gap(6)
        .items_center()
        .child(div().size(6).rounded(3).bg(t.working))
        .child(div().text_size(11.5).font_medium().text_color(t.working).child("gh unavailable")),
    )
    .child(
      div()
        .text_size(10.5)
        .text_color(t.dim)
        .whitespace_normal()
        .child(String(message ?? "").replace(/^GH_UNAVAILABLE:\s*/, "")),
    );
}

export default {
  renderPRs(t) {
    if (this.ghError) {
      return v_flex()
        .flex_1()
        .min_h(0)
        .p(8)
        .gap(8)
        .child(ghBanner(this.ghError, t))
        .child(
          div()
            .text_size(10.5)
            .text_color(t.dim)
            .whitespace_normal()
            .child("Install GitHub CLI and run `gh auth login`; git panes keep working meanwhile."),
        );
    }
    if (this.noRemote) {
      return Empty({
        title: "No GitHub remote",
        detail: "Pull requests and issues need an origin remote on github.com.",
        icon: "branch",
      });
    }
    if (this.paneErrors.prs) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.prs, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Loading pull requests…");

    const prs = filterPRs(this.prs, this.query);
    if (!prs.length) {
      return Empty({
        title: this.prs.length ? "No matching pull requests" : "No pull requests",
        detail: this.query ? `Nothing matches “${this.query.trim()}”.` : "",
      });
    }
    const safe = this.safeIndex("prs", prs.length);
    const list = ListScroller("git-prs", this.scrolls.prs);
    if (this.reveal?.pane === "prs") {
      this.scrolls.prs.scroll_to_item(safe);
      this.reveal = null;
    }
    return list.children(
      prs.map((pr, index) => {
        const active = index === safe;
        const checks = checksTag(pr.checks, t);
        return v_flex()
          .id(`git-pr-${pr.number}`)
          .flex_none()
          .py(5)
          .px(8)
          .gap(3)
          .rounded(6)
          .when(active, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .cursor_pointer()
          .on_click((event, cx) => {
            this.sel.prs = index;
            this.reveal = { pane: "prs", index };
            this.handle.focus();
            if (event.click_count >= 2) this.openPR(pr.number, cx);
            cx.notify();
          })
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(
                div()
                  .flex_none()
                  .font_family(codeFont())
                  .text_size(10.5)
                  .text_color(t.dim)
                  .child(`#${pr.number}`),
              )
              .child(
                div()
                  .flex_1()
                  .min_w(0)
                  .truncate()
                  .font_medium()
                  .text_color(active ? t.foreground : t.muted)
                  .child(pr.title || "(no title)"),
              )
              .child(Badge(checks.label, checks.color)),
          )
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .text_size(10.5)
              .text_color(t.dim)
              .child(
                div()
                  .flex_none()
                  .max_w(190)
                  .min_w(0)
                  .truncate()
                  .font_family(codeFont())
                  .child(pr.branch || "?"),
              )
              .child("→ main")
              .child(div().flex_1())
              .child(sanitizeRenderText(pr.author)),
          );
      }),
    );
  },
};
