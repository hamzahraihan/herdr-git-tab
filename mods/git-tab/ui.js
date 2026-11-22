// Herdr's panel conventions, as the small pieces this mod uses: a 42 px
// header, 26-28 px rows, rounded raised pills, raised cards, and a dim footer.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { theme, settings } from "herdr";
import { SPINNER_FRAMES } from "./format.js";

export const TEXT = {
  badge: 10,
  caption: 11,
  small: 12,
  tab: 12.5,
  row: 12.8,
  body: 13,
  title: 15,
};

export const codeFont = () => settings().font_family ?? "JetBrains Mono";

/** A theme color at a hex alpha, when the theme gives us a plain #rrggbb. */
export function tint(color, alpha) {
  const value = String(color ?? "");
  return /^#[0-9a-f]{6}$/i.test(value) ? `${value}${alpha}` : value;
}

export function Icon(name, size = 14, spinning = false) {
  const element = svg(`mods/git-tab/${name}.svg`).size(size).flex_none();
  return spinning ? element.spin(900) : element;
}

export function Badge(label, color) {
  const t = theme();
  return div()
    .flex_none()
    .h(18)
    .px(5)
    .rounded(4)
    .flex()
    .items_center()
    .bg(color ? tint(color, "22") : t.raised)
    .text_size(TEXT.badge)
    .text_color(color ?? t.muted)
    .child(String(label));
}

export function Chip(labelText, color) {
  const t = theme();
  return div()
    .flex_none()
    .h(18)
    .px(5)
    .rounded(4)
    .flex()
    .items_center()
    .bg(t.raised)
    .text_size(TEXT.badge)
    .text_color(color ?? t.muted)
    .child(String(labelText));
}

export function TabPill({ id, label, count, active, onClick }) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(26)
    .flex_none()
    .px(6)
    .gap(4)
    .items_center()
    .rounded(6)
    .border(1)
    .border_color(active ? t.border : t.background)
    .bg(active ? t.raised : t.background)
    .text_size(12)
    .text_color(active ? t.foreground : t.muted)
    .role("tab")
    .aria_selected(Boolean(active))
    .cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_event, cx) => {
      cx.stop_propagation();
      onClick(cx);
    })
    .child(label)
    .when(count !== undefined && count !== null && count !== 0, (el) =>
      el.child(
        div()
          .flex_none()
          .px(4)
          .h(15)
          .rounded(3)
          .flex()
          .items_center()
          .bg(active ? t.hover : t.raised)
          .text_size(9.5)
          .text_color(t.dim)
          .child(String(count)),
      ),
    );
}

export function Action({
  id,
  icon = null,
  label = "",
  onClick = (_cx) => {},
  primary = false,
  disabled = false,
  active = false,
}) {
  const t = theme();
  const solid = primary && !disabled;
  return h_flex()
    .id(id)
    .h(26)
    .flex_none()
    .px(8)
    .gap(5)
    .items_center()
    .rounded(6)
    .border_1()
    .border_color(solid ? t.solid : active ? t.border : t.border)
    .bg(solid ? t.solid : active ? t.selected : t.background)
    .text_size(TEXT.caption)
    .text_color(solid ? t.solid_foreground : disabled ? t.dim : active ? t.foreground : t.muted)
    .accessibility_label(label)
    .tooltip(label)
    .when(!disabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.bg(solid ? t.solid : t.hover).text_color(solid ? t.solid_foreground : t.foreground))
        .on_click((_event, cx) => {
          cx.stop_propagation();
          onClick(cx);
        }),
    )
    .when(Boolean(icon), (el) => el.child(Icon(icon, 13)))
    .child(label);
}

export function PrimaryButton({ id, label, onClick, disabled = false }) {
  const t = theme();
  return div()
    .id(id)
    .h(30)
    .px(14)
    .flex()
    .items_center()
    .justify_center()
    .rounded(8)
    .bg(disabled ? t.raised : t.solid)
    .text_size(TEXT.small)
    .text_color(disabled ? t.dim : t.solid_foreground)
    .when(!disabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click((_event, cx) => {
          cx.stop_propagation();
          onClick(cx);
        }),
    )
    .child(label);
}

/** A plain vertical list whose position a ScrollHandle can drive. */
export function ListScroller(id, handle) {
  return v_flex()
    .id(id)
    .flex_1()
    .min_h(0)
    .overflow_y_scrollbar()
    .track_scroll(handle)
    .p(6)
    .gap(1);
}

export function Spinner() {
  return div()
    .flex_none()
    .text_size(TEXT.row)
    .text_color(theme().accent)
    .frames(SPINNER_FRAMES, 90)
    .child(SPINNER_FRAMES[0]);
}

export function BusyView(label) {
  const t = theme();
  return v_flex()
    .id("git-busy")
    .flex_1()
    .min_h(0)
    .gap(10)
    .items_center()
    .justify_center()
    .child(Icon("spinner", 22, true).text_color(t.accent))
    .child(div().text_size(TEXT.small).text_color(t.dim).child(label));
}

export function Empty({ title, detail, icon = "search" }) {
  const t = theme();
  return v_flex()
    .id("git-empty")
    .flex_1()
    .min_h(0)
    .px(24)
    .gap(8)
    .items_center()
    .justify_center()
    .text_center()
    .child(Icon(icon, 22).text_color(t.dim))
    .child(div().text_size(TEXT.body).text_color(t.muted).whitespace_normal().child(title))
    .when(Boolean(detail), (el) =>
      el.child(div().text_size(TEXT.caption).text_color(t.dim).whitespace_normal().child(detail)),
    );
}

export function Message(text, error = false) {
  const t = theme();
  return div()
    .flex_none()
    .p(8)
    .text_size(TEXT.small)
    .whitespace_normal()
    .text_color(error ? t.ansi1 : t.dim)
    .child(text);
}

export function Field(label, value, color) {
  const t = theme();
  return h_flex()
    .flex_none()
    .items_start()
    .gap(8)
    .child(div().w(82).flex_none().text_size(TEXT.caption).text_color(t.dim).child(label))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .whitespace_normal()
        .text_size(TEXT.small)
        .text_color(color ?? t.foreground)
        .child(String(value ?? "—")),
    );
}

export function Card(id, children, extra = {}) {
  const t = theme();
  return v_flex()
    .id(id)
    .flex_none()
    .w_full()
    .min_w(0)
    .p(10)
    .gap(7)
    .rounded(8)
    .border_1()
    .border_color(t.border)
    .bg(t.raised)
    .when(Boolean(extra.title), (el) =>
      el.child(div().text_size(TEXT.caption).font_medium().text_color(t.dim).child(extra.title)),
    )
    .children(children ?? []);
}

export function Markdown(id, text) {
  return TextView.markdown(id, text ?? "")
    .flex_none()
    .w_full()
    .min_w(0)
    .text_size(TEXT.body)
    .scrollable(false)
    .selectable(true);
}

export function Separator() {
  return div().h(1).w_full().flex_none().bg(theme().border);
}

export function Hint(text) {
  return div().text_size(TEXT.caption).text_color(theme().dim).child(text);
}

/** One line of diff/commit output, colored by what git wrote on it. */
export function DiffLine(line, t, width) {
  const value = line === "" ? " " : line;
  let color = t.foreground;
  let background = null;
  let bold = false;
  let dim = false;

  if (value.startsWith("$ ")) {
    color = t.accent;
  } else if (/^commit [0-9a-f]{7,40}/i.test(value)) {
    color = t.accent;
    bold = true;
  } else if (value.startsWith("Author: ")) {
    color = t.foreground;
  } else if (value.startsWith("Date: ")) {
    color = t.muted;
    dim = true;
  } else if (value.startsWith("Merge: ")) {
    color = t.muted;
  } else if (value.startsWith("diff --git ")) {
    bold = true;
  } else if (value.startsWith("index ")) {
    color = t.dim;
    dim = true;
  } else if (value.startsWith("+++")) {
    color = t.done;
  } else if (value.startsWith("---")) {
    color = value.trim() === "---" ? t.dim : t.blocked;
    dim = value.trim() === "---";
  } else if (value.startsWith("@@")) {
    color = t.accent;
    background = t.raised;
    bold = true;
  } else if (value.startsWith("+")) {
    color = t.done;
    background = tint(t.done, "12");
  } else if (value.startsWith("-")) {
    color = t.blocked;
    background = tint(t.blocked, "12");
  } else if (
    /^(new file mode|deleted file mode|similarity index|rename from|rename to|copy from|copy to|Binary files)/.test(value)
  ) {
    color = t.working;
  } else if (value.startsWith("(") && value.endsWith(")")) {
    color = t.dim;
    dim = true;
  }

  return div()
    .flex_none()
    .h(19)
    .px(10)
    .w(width)
    .min_w(0)
    .whitespace_nowrap()
    .font_family(codeFont())
    .text_size(11.5)
    .text_color(color)
    .when(Boolean(background), (el) => el.bg(background))
    .when(bold, (el) => el.font_medium())
    .when(dim, (el) => el.opacity(0.72))
    .child(value);
}
