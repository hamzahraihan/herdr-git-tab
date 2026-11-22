import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { clamp, relativeTime } from "../format.js";
import {
  Action,
  Badge,
  BusyView,
  Card,
  Chip,
  Field,
  Hint,
  Markdown,
  Message,
} from "../ui.js";

function issueState(detail, t) {
  if (detail.blocked) return { label: "Blocked", color: t.accent };
  if (detail.state === "OPEN") return { label: "Open", color: t.done };
  if (detail.state === "CLOSED") return { label: "Closed", color: t.blocked };
  return { label: detail.state || "—", color: t.muted };
}


function issueInfo(detail, t) {
  return Card(
    "git-issue-info",
    [
      Field("state", detail.state || "—", detail.blocked ? t.accent : detail.state === "OPEN" ? t.done : t.blocked),

      Field("author", detail.author || "?"),
      Field("comments", String(detail.comments.length)),
      h_flex()
        .flex_wrap()
        .gap(4)
        .items_center()
        .child(div().text_size(10).text_color(t.dim).child("labels"))
        .when(detail.labels.length === 0, (el) => el.child(div().text_size(10.5).text_color(t.dim).child("—")))
        .children(detail.labels.map((label) => Chip(label, t.muted))),
      h_flex()
        .flex_wrap()
        .gap(4)
        .items_center()
        .child(div().text_size(10).text_color(t.dim).child("assignees"))
        .when(detail.assignees.length === 0, (el) => el.child(div().text_size(10.5).text_color(t.dim).child("—")))
        .children(detail.assignees.map((person) => Chip(person, t.muted))),
    ],
    { title: "INFO" },
  );
}

function commentCard(id, header, body, t) {
  return Card(
    id,
    [
      div().text_size(10.5).font_medium().text_color(t.foreground).child(header),
      Markdown(`${id}-md`, body && String(body).trim() ? String(body) : "*(no content)*"),
    ],
    {},
  );
}

export default {
  renderIssueDetail(t) {
    const view = this.view;
    const detail = view.detail;
    const wide = (this.width || 560) >= 620;
    const busy = Boolean(this.busy) || Boolean(view.loading);
    const state = detail ? issueState(detail, t) : null;

    const head = h_flex()
      .flex_none()
      .px(12)
      .py(6)
      .gap(6)
      .items_center()
      .flex_wrap()
      .border_b(1)
      .border_color(t.border)
      .child(
        Action({
          id: "git-issue-back",
          icon: "chevron-left",
          label: "Back",
          onClick: (cx) => this.closeView(cx),
        }),
      )
      .child(
        div()
          .flex_1()
          .min_w(120)
          .truncate()
          .font_medium()
          .child(detail ? `#${detail.number} ${detail.title}` : `Issue #${view.number}`),
      )
      .when(Boolean(state), (el) => el.child(Badge(state.label, state.color)))
      .when(Boolean(detail), (el) =>
        el
          .child(
            Action({
              id: "git-issue-open",
              icon: "external",
              label: "Open",
              disabled: busy,
              onClick: (cx) => this.openIssueBrowser(cx),
            }),
          )
          .child(
            Action({
              id: "git-issue-refresh",
              icon: "refresh",
              label: "Refresh",
              disabled: busy,
              onClick: (cx) => this.reloadIssue(cx),
            }),
          ),
      );
    if (!detail) {
      head.child(
        Action({
          id: "git-issue-retry",
          icon: "refresh",
          label: "Try again",
          disabled: Boolean(this.busy),
          onClick: (cx) => this.reloadIssue(cx),
        }),
      );
    }

    let body;
    if (view.error) {
      body = v_flex()
        .flex_1()
        .min_h(0)
        .p(10)
        .gap(10)
        .child(Message(view.error, true))
        .child(
          Action({
            id: "git-issue-retry-body",
            icon: "refresh",
            label: "Try again",
            onClick: (cx) => this.reloadIssue(cx),
          }),
        );
    } else if (!detail) {
      body = BusyView(`Loading issue #${view.number}…`);
    } else {
      const comments = detail.comments.slice(-10);
      const omitted = Math.max(0, detail.comments.length - comments.length);
      const blocks = [];
      if (!wide) blocks.push(issueInfo(detail, t));
      blocks.push(
        Card(
          "git-issue-description",
          [Markdown("git-issue-description-md", detail.body.trim() || "*(no description)*")],
          { title: "DESCRIPTION" },
        ),
      );
      blocks.push(
        div()
          .flex_none()
          .px(2)
          .pt(2)
          .text_size(10)
          .font_medium()
          .text_color(t.dim)
          .child(`COMMENTS (${detail.comments.length})`),
      );
      if (omitted > 0) {
        blocks.push(
          Hint(`${omitted} earlier comment${omitted === 1 ? "" : "s"} not shown`),
        );
      }
      if (!comments.length) {
        blocks.push(Hint("(no comments yet)"));
      } else {
        comments.forEach((comment, index) =>
          blocks.push(
            commentCard(
              `git-issue-comment-${index}`,
              `${comment.author} commented` +
                (comment.createdAt ? ` · ${relativeTime(comment.createdAt)}` : ""),
              comment.body,
              t,
            ),
          ),
        );
      }

      this.detailBlocks = blocks.length;
      const scroller = v_flex()
        .id("git-issue-scroll")
        .flex_1()
        .min_h(0)
        .overflow_y_scrollbar()
        .track_scroll(this.detailScroll)
        .gap(8)
        .pr(6)
        .children(blocks);
      if (this.reveal?.pane === "detail") {
        this.detailScroll.scroll_to_item(
          clamp(view.scroll ?? 0, 0, Math.max(0, blocks.length - 1)),
        );
        this.reveal = null;
      }

      body = wide
        ? h_flex()
            .flex_1()
            .min_h(0)
            .gap(12)
            .px(12)
            .py(10)
            .child(scroller)
            .child(
              v_flex()
                .flex_none()
                .w(230)
                .gap(8)
                .child(issueInfo(detail, t))
                .child(
                  Action({
                    id: "git-issue-open-side",
                    icon: "external",
                    label: "Open on GitHub",
                    disabled: busy,
                    onClick: (cx) => this.openIssueBrowser(cx),
                  }),
                ),
            )
        : v_flex().flex_1().min_h(0).px(12).py(10).child(scroller);
    }

    return v_flex()
      .id("git-issue-detail")
      .flex_1()
      .min_h(0)
      .child(head)
      .when(Boolean(view.error) && Boolean(detail), (el) =>
        el.child(
          div()
            .px(12)
            .py(4)
            .text_size(10.5)
            .text_color(t.ansi1)
            .whitespace_normal()
            .child(view.error),
        ),
      )
      .child(body);
  },
};
