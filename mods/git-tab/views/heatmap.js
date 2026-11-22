import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { sanitizeRenderText } from "../format.js";
import { formatDisplayDate, monthSegments } from "../heatmap.js";
import {
  BusyView,
  Card,
  Chip,
  Empty,
  Hint,
  Message,
  codeFont,
  tint,
} from "../ui.js";

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const LEVELS = [0, 1, 2, 3, 4];

function levelColor(level, t) {
  if (level <= 0) return t.raised;
  if (level === 1) return tint(t.done, "33");
  if (level === 2) return tint(t.done, "59");
  if (level === 3) return tint(t.done, "99");
  return t.done;
}

function selection(data, week, day) {
  let w = week;
  let d = day;
  if (w === null || w === undefined) w = data.weeks.length - 1;
  if (d === null || d === undefined) d = new Date().getDay();
  w = clamp(w, 0, Math.max(0, data.weeks.length - 1));
  d = clamp(d, 0, 6);
  return { week: w, day: d, cell: data.weeks[w]?.days[d] };
}

function heatCell(view, t, weekIndex, dayIndex, value, selected) {
  const active = weekIndex === selected.week && dayIndex === selected.day;
  const color = levelColor(value.level, t);
  return div()
    .id(`git-heat-${weekIndex}-${dayIndex}`)
    .size(12)
    .flex_none()
    .rounded(3)
    .bg(value.inRange ? color : t.background)
    .border_1()
    .border_color(active ? t.foreground : value.inRange ? color : t.border)
    .when(!value.inRange, (el) => el.opacity(0.35))
    .cursor_pointer()
    .tooltip(`${formatDisplayDate(value.date)} · ${plural(value.count, "commit")}`)
    .on_click((_event, cx) => {
      view.sel.heatW = weekIndex;
      view.sel.heatD = dayIndex;
      view.handle.focus();
      cx.notify();
    });
}

function heatGrid(view, t, weeks, selectedW, selectedD) {
  return v_flex()
    .flex_none()
    .gap(2)
    .children(
      [0, 1, 2, 3, 4, 5, 6].map((dayIndex) =>
        h_flex()
          .flex_none()
          .h(12)
          .gap(2)
          .items_center()
          .child(
            div()
              .w(28)
              .flex_none()
              .text_size(9)
              .text_color(t.dim)
              .child(DAY_LABELS[dayIndex]),
          )
          .children(
            weeks.map((week, weekIndex) =>
              heatCell(view, t, weekIndex, dayIndex, week.days[dayIndex], {
                week: selectedW,
                day: selectedD,
              }),
            ),
          ),
      ),
    );
}

function monthRow(t, weeks, gridWidth) {
  const months = monthSegments(weeks);
  return h_flex()
    .flex_none()
    .h(13)
    .items_center()
    .child(div().w(28).flex_none())
    .child(
      div()
        .relative()
        .h(13)
        .w(gridWidth)
        .children(
          months.map((month) =>
            div()
              .absolute()
              .left(month.start * 14)
              .text_size(9)
              .text_color(t.dim)
              .child(month.span >= 1 ? month.label : ""),
          ),
        ),
    );
}

function dayRows(view, t, commits) {
  return commits.slice(0, 5).map((commit) =>
    h_flex()
      .id(`git-heat-commit-${commit.hash}`)
      .h(24)
      .flex_none()
      .px(6)
      .gap(6)
      .items_center()
      .rounded(5)
      .hover((s) => s.bg(t.hover))
      .cursor_pointer()
      .on_click((event, cx) => {
        view.handle.focus();
        if (event.click_count >= 2) view.openCommit(commit, cx);
        cx.notify();
      })
      .child(
        div()
          .flex_none()
          .font_family(codeFont())
          .text_size(10)
          .text_color(t.dim)
          .child(commit.shortHash),
      )
              .child(div().flex_1().min_w(0).truncate().text_size(11).child(sanitizeRenderText(commit.subject)))
      .child(
        div()
          .flex_none()
          .text_size(9.5)
          .text_color(t.dim)
          .child(`${sanitizeRenderText(commit.author)} · ${relativeTime(commit.date)}`),
      ),
  );
}

function selectedDayCard(view, t, selected, selectedCount, commits) {
  const rows = dayRows(view, t, commits);
  return Card(
    "git-heat-day",
    [
      h_flex()
        .gap(6)
        .items_center()
        .child(
          div()
            .text_size(12)
            .font_medium()
            .text_color(t.foreground)
            .child(selected.cell ? formatDisplayDate(selected.cell.date) : "—"),
        )
        .child(
          div()
            .text_size(10.5)
            .text_color(selectedCount > 0 ? t.done : t.dim)
            .child(plural(selectedCount, "commit")),
        ),
      ...rows,
      ...(rows.length === 0 && selectedCount > 0
        ? [
            div()
              .text_size(10.5)
              .text_color(t.dim)
              .whitespace_normal()
              .child(
                `${plural(selectedCount, "commit")} recorded on this date; outside the loaded history.`,
              ),
          ]
        : []),
      ...(rows.length === 0 && selectedCount === 0
        ? [div().text_size(10.5).text_color(t.dim).child("No commits on this date.")]
        : []),
      ...(rows.length > 0 ? [Hint("double-click a commit to inspect it")] : []),
    ],
    { title: "SELECTED DAY" },
  );
}

export default {
  renderHeatmap(t, cx) {
    if (this.paneErrors.heatmap) {
      return v_flex().flex_1().min_h(0).p(6).child(Message(this.paneErrors.heatmap, true));
    }
    if ((this.loading || this.heatLoading) && !this.loadedOnce) {
      return BusyView("Loading contribution calendar…");
    }
    if (!this.heatEntries.length) {
      return Empty({
        title: "No commits yet",
        detail: "The calendar appears once this repository has history.",
        icon: "branch",
      });
    }

    const data = this.heatmapData();
    const filter = this.query.trim() || (this.scope === "mine" ? this.user : "");
    const selected = selection(data, this.sel.heatW, this.sel.heatD);
    this.heatWeekIndex = selected.week;
    this.heatDayIndex = selected.day;
    this.heatWeekCount = data.weeks.length;
    const selectedCount = selected.cell?.count ?? 0;
    const gridWidth = Math.max(1, data.weeks.length * 14 - 2);
    const commits = this.commits.filter((commit) =>
      String(commit.date ?? "").startsWith(selected.cell?.date ?? ""),
    );

    const legend = h_flex()
      .flex_none()
      .gap(4)
      .items_center()
      .text_size(9.5)
      .text_color(t.dim)
      .child("Less")
      .children(LEVELS.map((level) => div().size(9).rounded(2).bg(levelColor(level, t))))
      .child("More");

    return v_flex()
      .id("git-heatmap")
      .flex_1()
      .min_h(0)
      .w_full()
      .overflow_y_scrollbar()
      .p(10)
      .gap(10)
      .on_scroll_wheel((event, cx) => {
        const lines = event.delta_lines?.y ?? 0;
        const pixels = event.delta.y ?? 0;
        const steps = lines ? Math.sign(lines) : Math.abs(pixels) >= 30 ? Math.sign(pixels) : 0;
        if (!steps) return;
        this.sel.heatW = clamp(selected.week + steps, 0, Math.max(0, data.weeks.length - 1));
        this.sel.heatD = selected.day;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .flex_none()
          .gap(12)
          .items_start()
          .child(
            v_flex()
              .flex_none()
              .gap(1)
              .child(div().text_size(11.5).font_medium().text_color(t.foreground).child("Contributions"))
              .child(div().text_size(10).text_color(t.dim).child(`past ${data.weeks.length} weeks`)),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(5)
              .child(
                h_flex()
                  .flex_wrap()
                  .gap(10)
                  .text_size(11)
                  .child(div().text_color(t.foreground).child(`${data.totalCommits} commits`))
                  .child(div().text_color(t.dim).child(`${data.activeDays} active days`))
                  .child(
                    h_flex()
                      .gap(4)
                      .items_center()
                      .child(div().text_color(t.dim).child("current"))
                      .child(div().text_color(t.done).font_medium().child(`${data.currentStreak}d`)),
                  )
                  .child(
                    h_flex()
                      .gap(4)
                      .items_center()
                      .child(div().text_color(t.dim).child("longest"))
                      .child(div().text_color(t.done).font_medium().child(`${data.longestStreak}d`)),
                  ),
              )
              .when(Boolean(data.peakDate), (el) =>
                el.child(
                  h_flex()
                    .flex_wrap()
                    .gap(5)
                    .items_center()
                    .text_size(10.5)
                    .text_color(t.dim)
                    .child("peak")
                    .child(div().text_color(t.done).font_medium().child(`${data.maxDayCount}`))
                    .child(formatDisplayDate(data.peakDate)),
                ),
              )
              .when(Boolean(filter) || (this.scope === "mine" && !this.user), (el) =>
                el.child(
                  h_flex()
                    .gap(5)
                    .items_center()
                    .text_size(10.5)
                    .child(div().text_color(t.dim).child("filter"))
                    .child(
                      Chip(
                        filter || "mine: git user.name is not set",
                        filter ? t.accent : t.blocked,
                      ),
                    ),
                ),
              ),
          ),
      )
      .child(monthRow(t, data.weeks, gridWidth))
      .child(heatGrid(this, t, data.weeks, selected.week, selected.day))
      .child(
        h_flex()
          .flex_none()
          .w_full()
          .gap(10)
          .items_center()
          .justify_between()
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .text_size(10.5)
              .text_color(t.dim)
              .child(div().size(6).rounded(3).bg(t.done))
              .child(
                selected.cell
                  ? `selected ${formatDisplayDate(selected.cell.date)}`
                  : "no date selected",
              ),
          )
          .child(legend),
      )
      .child(selectedDayCard(this, t, selected, selectedCount, commits));
  },
};
