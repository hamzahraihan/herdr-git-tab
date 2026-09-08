import React from "react";
import type { IssueDetail } from "../types.js";
import { detailColumns, isWideLayout, terminalWidth } from "../width.js";
import { COMMENT_HEADER_BG, LABEL_BG, LABEL_FG } from "../theme.js";
import {
  DetailRows,
  field,
  fitRow,
  frame,
  labelRow,
  rowWidth,
  windowRows,
  wrapText,
  zipCols,
  type Row,
} from "./detailFrame.js";

/** Plain-text discussion lines: title, meta, body, then recent comments. */
export function buildIssueDiscussionLines(detail: IssueDetail): string[] {
  const lines: string[] = [];
  lines.push(`#${detail.number} ${detail.title}`);
  lines.push(`by ${detail.author} · ${detail.state}`);
  lines.push("");
  const body = detail.body.trim() ? detail.body.trim() : "(no description)";
  for (const line of body.split("\n")) lines.push(line);
  lines.push("");
  if (detail.comments.length === 0) {
    lines.push("(no comments yet)");
    return lines;
  }
  const recent = detail.comments.slice(-10);
  lines.push(`Comments (${detail.comments.length}):`);
  for (const c of recent) {
    lines.push("");
    lines.push(`${c.author} commented`);
    if (c.body.trim()) for (const line of c.body.trim().split("\n")) lines.push(line);
  }
  return lines;
}

/** Plain-text rail: state, labels, assignees, comment count. */
export function buildIssueRailLines(detail: IssueDetail): string[] {
  return [
    `state: ${detail.state}`,
    `labels: ${detail.labels.length > 0 ? detail.labels.join(", ") : "—"}`,
    `assignees: ${detail.assignees.length > 0 ? detail.assignees.join(", ") : "—"}`,
    `comments: ${detail.comments.length}`,
    `author: ${detail.author}`,
  ];
}

/** Line-windowed rows: j/k and the wheel page through long bodies. */
export default function IssueDetailPanel({
  detail,
  scroll,
}: {
  detail: IssueDetail;
  scroll: number;
}) {
  const width = terminalWidth();
  if (!isWideLayout(width)) {
    const inner = Math.max(8, width - 4);
    const rows = [
      ...titleRows(detail, inner),
      labelRow(`Comments (${detail.comments.length}): `, inner + 2),
      ...detail.comments.flatMap((c) => commentFrame(`${c.author} commented`, c.body, inner)),
    ];
    return <DetailRows rows={windowRows(rows, scroll).win} />;
  }
  const { discussion, rail } = detailColumns(width);
  const left: Row[] = [
    ...titleRows(detail, discussion - 2),
    labelRow(`Comments (${detail.comments.length}): `, discussion),
    ...detail.comments.flatMap((c) =>
      commentFrame(`${c.author} commented`, c.body, discussion - 2),
    ),
  ];
  const right = railRows(detail, rail - 2);
  return <DetailRows rows={windowRows(zipCols(left, right, discussion, rail), scroll).win} />;
}

function titleRows(detail: IssueDetail, inner: number): Row[] {
  const stateTag = `| ${detail.state}`;
  const title: Row = [
    { t: `${fitRow(` ${stateTag}`, `#${detail.number} ${detail.title}`, inner)} `, color: "white", bold: true },
    { t: stateTag, color: "green", bold: true },
  ];
  const author = fitRow(`by  · ${detail.state}`, detail.author, inner);
  const byline: Row = [
    { t: `by ${author} · `, color: "gray" },
    { t: detail.state, color: "green" },
  ];
  const body = detail.body.trim() ? detail.body.trim() : "(no description)";
  const content: Row[] = [title, byline, [{ t: " " }]];
  for (const line of wrapText(body, inner)) content.push([{ t: line || " ", color: "white" }]);
  return frame(inner, content);
}

function commentFrame(header: string, body: string, inner: number): Row[] {
  const text = body.trim() ? body.trim() : "(no content)";
  const content = wrapText(text, inner).map((line): Row => [{ t: line || " ", color: "white" }]);
  return frame(inner, content, [{ t: ` ${fitRow("  ", header, inner)} `, color: "white" }], COMMENT_HEADER_BG);
}

function railRows(detail: IssueDetail, inner: number): Row[] {
  const content: Row[] = [
    [{ t: "INFO", color: "white", bold: true }],
    [
      { t: "status: ", color: "gray" },
      { t: detail.state, color: "green" },
    ],
    ...labelsRow(detail.labels, inner),
    ...field("assignees: ", detail.assignees.length > 0 ? detail.assignees.join(", ") : "–", inner),
    ...field("comments: ", String(detail.comments.length), inner),
    ...field("author: ", detail.author, inner),
  ];
  return frame(inner, content);
}

function labelsRow(labels: string[], inner: number): Row[] {
  if (labels.length === 0) return field("labels: ", "—", inner);
  const chips: Row = [{ t: "labels: ", color: "gray" }];
  labels.forEach((l, i) => {
    if (i > 0) chips.push({ t: " " });
    chips.push({ t: ` ${l} `, backgroundColor: LABEL_BG, color: LABEL_FG });
  });
  if (rowWidth(chips) <= inner) return [chips];
  return field("labels: ", labels.join(", "), inner);
}
