import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { sanitizeRenderText } from "../format.js";
import { Badge, BusyView, Chip, Empty, ListScroller, Message, codeFont } from "../ui.js";
import { ghBanner } from "./prs.js";

function issueTag(state, blocked, t) {
  if (blocked) return { label: "Blocked", color: t.accent };


  if (state === "OPEN") return { label: "Open", color: t.done };
  if (state === "CLOSED") return { label: "Closed", color: t.blocked };
  return { label: state || "—", color: t.working };
}


export default {
  renderIssues(t, cx) {
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
    if (this.paneErrors.issues) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.issues, true));
    }
    if (this.loading && !this.loadedOnce) return BusyView("Loading issues…");

    const issues = filterIssues(this.issues, this.query);
    if (!issues.length) {
      return Empty({
        title: this.issues.length ? "No matching issues" : "No issues",
        detail: this.query ? `Nothing matches “${this.query.trim()}”.` : "",
      });
    }
    const safe = this.safeIndex("issues", issues.length);
    return ListScroller("git-issues", this.scrolls.issues).children(
      issues.map((issue, index) => {
        const active = index === safe;
        const tag = issueTag(issue.state, issue.blocked, t);

        const labels = issue.labels.slice(0, 3);
        return v_flex()
          .id(`git-issue-${issue.number}`)
          .flex_none()
          .py(5)
          .px(8)
          .gap(3)
          .rounded(6)
          .when(active, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .cursor_pointer()
          .on_click((event, cx) => {
            this.sel.issues = index;
            this.reveal = { pane: "issues", index };
            this.handle.focus();
            if (event.click_count >= 2) this.openIssue(issue.number, cx);
            cx.notify();
          })
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(div().flex_none().font_family(codeFont()).text_size(10.5).text_color(t.dim).child(`#${issue.number}`))
              .child(div().flex_1().min_w(0).truncate().font_medium().text_color(active ? t.foreground : t.muted).child(issue.title || "(no title)"))
              .child(Badge(tag.label, tag.color)),
          )
          .child(
            h_flex()
              .gap(4)
              .items_center()
              .text_size(10.5)
              .text_color(t.dim)
              .children(labels.map((label) => Chip(label)))
              .when(issue.labels.length > labels.length, (el) => el.child(div().text_size(9.5).child(`+${issue.labels.length - labels.length}`)))
              .child(div().flex_1())
              .child(sanitizeRenderText(issue.author)),
          );
      }),
    );
  },
};
