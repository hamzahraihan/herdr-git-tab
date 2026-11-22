import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { clamp, relativeTime } from "../format.js";
import { checksTag } from "./prs.js";
import { Action, Badge, BusyView, Card, Chip, Field, Hint, Markdown, Message } from "../ui.js";

function prState(detail, t) {
  if (detail.isDraft && detail.state === "OPEN") return { label: "Draft", color: t.working };
  if (detail.state === "MERGED") return { label: "Merged", color: t.accent };
  if (detail.state === "CLOSED") return { label: "Closed", color: t.blocked };
  if (detail.state === "OPEN") return { label: "Open", color: t.done };
  return { label: detail.state || "—", color: t.muted };
}

function infoCard(profile, t) {
  const checks = checksTag(profile.checks, t);
  const fields = [
    Field("branch", `${profile.headRefName || "?"} → ${profile.baseRefName || "?"}`),
    Field("checks", checks.label, checks.color),
    Field(
      "reviews",
      `${profile.reviewDecision || "—"} (${profile.reviews.length})`,
      profile.reviewDecision === "APPROVED" ? t.done : t.muted,
    ),
    Field("mergeable", profile.mergeable),
    Field("merge state", profile.mergeStateStatus),
    Field(
      "stats",
      `+${profile.additions} −${profile.deletions} · ${profile.changedFiles} files · ${profile.commits} commits`,
    ),
  ];
  return Card(
    "git-pr-info",
    [
      ...fields,
      h_flex()
        .flex_wrap()
        .gap(4)
        .items_center()
        .child(div().text_size(10).text_color(t.dim).child("labels"))
        .when(profile.labels.length === 0, (el) => el.child(div().text_size(10.5).text_color(t.dim).child("—")))
        .children(profile.labels.map((label) => Chip(label, t.muted))),
    ],
    { title: "INFO" },
  );
}

function commentCard(id, header, body, t) {
  return Card(
    id,
    [
      h_flex()
        .gap(6)
        .items_center()
        .child(div().text_size(10.5).font_medium().text_color(t.foreground).child(header))
        .child(div().flex_1()),
      Markdown(`${id}-md`, body && String(body).trim() ? String(body) : "*(no content)*"),
    ],
    {},
  );
}

export default {
  renderPRDetail(t, cx) {
    const view = this.view;
    const detail = view.detail;
    const wide = (this.width || 560) >= 620;
    const busy = Boolean(this.busy) || Boolean(view.loading);
    const state = detail ? prState(detail, t) : null;

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
          id: "git-pr-back",
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
          .child(detail ? `#${detail.number} ${detail.title}` : `PR #${view.number}`),
      )
      .when(Boolean(state), (el) => el.child(Badge(state.label, state.color)))
      .when(Boolean(detail?.isDraft), (el) => el.child(Badge("Draft", t.working)))
      .when(Boolean(detail), (el) =>
        el
          .child(
            Action({
              id: "git-pr-open",
              icon: "external",
              label: "Open",
              disabled: busy,
              onClick: (cx) => this.openPRBrowser(cx),
            }),
          )
          .child(
            Action({
              id: "git-pr-approve",
              label: "Approve",
              disabled: busy,
              onClick: (cx) => this.approvePR(cx),
            }),
          )
          .child(
            Action({
              id: "git-pr-checkout",
              label: "Checkout",
              primary: true,
              disabled: busy,
              onClick: (cx) => this.checkoutPR(cx),
            }),
          ),
      )
      .child(
        Action({
          id: "git-pr-refresh",
          icon: busy ? "spinner" : "refresh",
          label: busy ? "Working" : "Refresh",
          disabled: Boolean(this.busy),
          onClick: (cx) => this.reloadPR(cx),
        }),
      );

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
            id: "git-pr-retry",
            icon: "refresh",
            label: "Try again",
            onClick: (cx) => this.reloadPR(cx),
          }),
        );
    } else if (!detail) {
      body = BusyView(`Loading PR #${view.number}…`);
    } else {
      const blocks = [];
      if (!wide) blocks.push(infoCard(detail, t));
      blocks.push(
        Card(
          "git-pr-description",
          [Markdown("git-pr-description-md", detail.body.trim() || "*(no description)*")],
          { title: "DESCRIPTION" },
        ),
      );

      const entries = [
        ...detail.reviews.map((review, index) => ({
          key: `review-${index}`,
          header:
            `${review.author} · ${review.state || "reviewed"}`.trim() +
            (review.createdAt ? ` · ${relativeTime(review.createdAt)}` : ""),
          body: review.body ?? "",
        })),
        ...detail.comments.map((comment, index) => ({
          key: `comment-${index}`,
          header:
            `${comment.author} commented` +
            (comment.createdAt ? ` · ${relativeTime(comment.createdAt)}` : ""),
          body: comment.body,
        })),
      ];

      blocks.push(
        div()
          .flex_none()
          .px(2)
          .pt(2)
          .text_size(10)
          .font_medium()
          .text_color(t.dim)
          .child(`DISCUSSION (${entries.length})`),
      );
      if (!entries.length) {
        blocks.push(Hint("(no discussion yet)"));
      } else {
        entries.forEach((entry, index) =>
          blocks.push(commentCard(`git-pr-${entry.key}`, entry.header, entry.body, t)),
        );
      }

      this.detailBlocks = blocks.length;
      const scroller = v_flex()
        .id("git-pr-scroll")
        .flex_1()
        .min_h(0)
        .overflow_y_scrollbar()
        .track_scroll(this.detailScroll)
        .gap(8)
        .pr(6)
        .children(blocks);
      if (this.reveal?.pane === "detail") {
        this.detailScroll.scroll_to_item(clamp(view.scroll ?? 0, 0, Math.max(0, blocks.length - 1)));
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
                .child(infoCard(detail, t))
                .child(
                  Action({
                    id: "git-pr-open-side",
                    icon: "external",
                    label: "Open on GitHub",
                    disabled: busy,
                    onClick: (cx) => this.openPRBrowser(cx),
                  }),
                ),
            )
        : v_flex().flex_1().min_h(0).px(12).py(10).child(scroller);
    }

    return v_flex()
      .id("git-pr-detail")
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
