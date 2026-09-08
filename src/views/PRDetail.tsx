import React from "react";
import type { PRDetail } from "../types.js";
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

/** Plain-text discussion lines: title, meta, body, then comments. */
export function buildPRDiscussionLines(detail: PRDetail): string[] {
  const lines: string[] = [];
  lines.push(`#${detail.number} ${detail.title}`);
  const draft = detail.isDraft ? " · draft" : "";
  lines.push(`by ${detail.author} · ${detail.state}${draft}`);
  lines.push("");
  const body = detail.body.trim() ? detail.body.trim() : "(no description)";
  for (const line of body.split("\n")) lines.push(line);
  lines.push("");
  if (detail.comments.length === 0 && detail.reviews.length === 0) {
    lines.push("(no discussion yet)");
    return lines;
  }
  lines.push(`Discussion (${detail.comments.length + detail.reviews.length}):`);
  for (const r of detail.reviews) {
    lines.push("");
    lines.push(`${r.author} reviewed [${r.state || "?"}]`);
    if (r.body?.trim()) for (const line of r.body.trim().split("\n")) lines.push(line);
  }
  for (const c of detail.comments) {
    lines.push("");
    lines.push(`${c.author} commented`);
    if (c.body.trim()) for (const line of c.body.trim().split("\n")) lines.push(line);
  }
  return lines;
}

/** Plain-text rail lines: branches, checks, reviews, labels, mergeability, stats. */
export function buildPRRailLines(detail: PRDetail): string[] {
  const lines: string[] = [];
  lines.push(`branch: ${detail.headRefName || "?"} → ${detail.baseRefName || "?"}`);
  lines.push(`checks: ${detail.checks}`);
  const decision = detail.reviewDecision ? detail.reviewDecision : "—";
  lines.push(`reviews: ${decision} (${detail.reviews.length})`);
  for (const r of detail.reviews.slice(0, 5)) lines.push(`  ${r.author}: ${r.state || "?"}`);
  lines.push(`labels: ${detail.labels.length > 0 ? detail.labels.join(", ") : "—"}`);
  lines.push(`mergeable: ${detail.mergeable}`);
  lines.push(`merge state: ${detail.mergeStateStatus}`);
  lines.push(`stats: +${detail.additions} -${detail.deletions} · ${detail.changedFiles} files · ${detail.commits} commits`);
  return lines;
}

/** Line-windowed rows: j/k and the wheel page through long bodies. */
export default function PRDetailPanel({
  detail,
  scroll,
}: {
  detail: PRDetail;
  scroll: number;
}) {
  const width = terminalWidth();
  const entries: Array<{ header: string; body: string }> = [
    ...detail.reviews.map((r) => ({ header: `${r.author} · ${r.state || "reviewed"}`, body: r.body?.trim() ?? "" })),
    ...detail.comments.map((c) => ({ header: `${c.author} commented`, body: c.body })),
  ];
  if (!isWideLayout(width)) {
    const inner = Math.max(8, width - 4);
    const rows = [
      ...titleRows(detail, inner),
      labelRow(`Discussion (${entries.length}): `, inner + 2),
      ...entries.flatMap((e) => commentFrame(e.header, e.body, inner)),
    ];
    return <DetailRows rows={windowRows(rows, scroll).win} />;
  }
  const { discussion, rail } = detailColumns(width);
  const left: Row[] = [
    ...titleRows(detail, discussion - 2),
    labelRow(`Discussion (${entries.length}): `, discussion),
    ...entries.flatMap((e) => commentFrame(e.header, e.body, discussion - 2)),
  ];
  const right = railRows(detail, rail - 2);
  return <DetailRows rows={windowRows(zipCols(left, right, discussion, rail), scroll).win} />;
}

function titleRows(detail: PRDetail, inner: number): Row[] {
  const draft = detail.isDraft ? " · draft" : "";
  const stateTag = `| ${detail.state}`;
  const title: Row = [
    { t: `${fitRow(` ${stateTag}`, `#${detail.number} ${detail.title}`, inner)} `, color: "white", bold: true },
    { t: stateTag, color: "green", bold: true },
  ];
  const author = fitRow(`by  · ${detail.state}${draft}`, detail.author, inner);
  const byline: Row = [
    { t: `by ${author} · `, color: "gray" },
    { t: detail.state, color: "green" },
    ...(draft ? [{ t: draft, color: "gray" } as Row[number]] : []),
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

function railRows(detail: PRDetail, inner: number): Row[] {
  const decision = detail.reviewDecision ? detail.reviewDecision : "—";
  const content: Row[] = [
    [{ t: "INFO", color: "white", bold: true }],
    [
      { t: "status: ", color: "gray" },
      { t: detail.state, color: "green" },
    ],
    ...field("branch: ", `${detail.headRefName || "?"} → ${detail.baseRefName || "?"}`, inner),
    ...field("checks: ", detail.checks, inner),
    ...field("reviews: ", `${decision} (${detail.reviews.length})`, inner),
    ...labelsRow(detail.labels, inner),
    ...field("mergeable: ", detail.mergeable, inner),
    ...field("merge state: ", detail.mergeStateStatus, inner),
    ...field(
      "stats: ",
      `+${detail.additions} -${detail.deletions} · ${detail.changedFiles} files · ${detail.commits} commits`,
      inner,
    ),
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
