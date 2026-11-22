import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { theme } from "herdr";
import { TABS, SCOPES } from "./constants.js";
import { repoName } from "./format.js";
import { Badge, Icon, Spinner, TabPill, TEXT, codeFont } from "./ui.js";

function scopeControl(scope, width, onScope) {
  const t = theme();
  return h_flex()
    .id("git-scope")
    .flex_none()
    .h(22)
    .p(2)
    .gap(1)
    .rounded(6)
    .bg(t.raised)
    .children(
      SCOPES.map((item) => {
        const active = item.id === scope;
        return div()
          .id(`git-scope-${item.id}`)
          .h(18)
          .px(6)
          .flex()
          .items_center()
          .justify_center()
          .rounded(4)
          .text_size(10)
          .text_color(active ? t.foreground : t.dim)
          .when(active, (el) => el.bg(t.background))
          .cursor_pointer()
          .tooltip(
            item.id === "repo"
              ? "Pull requests and issues in this repository"
              : width < 620
                ? "Mine (involves @me)"
                : "Pull requests and issues involving @me",
          )
          .hover((s) => s.text_color(t.foreground))
          .on_click((_event, cx) => onScope(item.id, cx))
          .child(width < 380 ? item.label.slice(0, 1) : item.label);
      }),
    );
}

export const shellMethods = {
  render(cx) {
    const t = theme();
    const root = v_flex()
      .id("git-tab")
      .size_full()
      .min_h(0)
      .overflow_hidden()
      .rounded(10)
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(TEXT.body)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.key(event, cx))
      .on_mouse_down("left", (_event, cx) => {
        if (!this.filterMode) this.handle.focus();
      })
      .on_size_change((size, cx) => {
        const width = Math.round(size.width);
        const height = Math.round(size.height);
        if (width !== this.width || height !== this.height) {
          this.width = width;
          this.height = height;
          cx.notify();
        }
      });

    root.child(this.header(t, cx));
    if (!this.fatal) {
      root.child(this.tabs(t, cx));
      if (this.filterMode) root.child(this.filterBar(t, cx));
      if (this.busy) root.child(this.busyBar(t));
      if (this.notice) root.child(this.noticeBar(t));
      if (this.error) root.child(this.errorBar(t));
    }
    root.child(this.renderBody(t, cx));
    root.child(this.footer(t));
    return root;
  },

  header(t, cx) {
    const branch = this.currentBranch();
    const upstream = this.currentUpstream();
    const changes = this.changeCount();
    const compact = this.width < 700;

    const header = h_flex()
      .id("git-header")
      .h(42)
      .flex_none()
      .px(14)
      .gap(7)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(
        div()
          .flex_shrink_1()
          .max_w(compact ? 92 : 170)
          .min_w(0)
          .truncate()
          .font_semibold()
          .tooltip(this.root ?? "No repository")
          .child(this.root ? repoName(this.root) : "Git"),
      );

    if (branch) {
      header.child(
        h_flex()
          .id("git-branch")
          .flex_shrink_1()
          .min_w(0)
          .h(22)
          .px(7)
          .gap(5)
          .items_center()
          .rounded(5)
          .bg(t.raised)
          .border_1()
          .border_color(t.border)
          .child(Icon("branch", 12).text_color(branch ? t.done : t.muted))
          .child(
            div()
              .flex_none()
              .max_w(compact ? 110 : 190)
              .min_w(0)
              .truncate()
              .font_family(codeFont())
              .text_size(11)
              .text_color(t.foreground)
              .tooltip(branch)
              .child(branch),
          )
          .when(Boolean(upstream) && !compact, (el) =>
            el.child(
              div()
                .flex_none()
                .text_size(9.5)
                .text_color(upstream === "gone" ? t.blocked : t.dim)
                .child(upstream === "gone" ? "gone" : `→ ${upstream}`),
            ),
          ),
      );
    } else {
      header.child(div().flex_1());
    }

    header
      .when(changes > 0, (el) =>
        el.child(Badge(`${changes} changed`, t.working).tooltip(
          `${changes} file${changes === 1 ? "" : "s"} in the working tree`,
        )),
      )
      .when(changes === 0 && Boolean(this.status) && !compact, (el) =>
        el.child(
          h_flex()
            .flex_none()
            .gap(4)
            .items_center()
            .text_size(10)
            .text_color(t.done)
            .child(div().size(5).rounded(3).bg(t.done))
            .child("clean"),
        ),
      )
      .when(Boolean(this.on) && !compact, (el) => el.child(Badge(this.on, t.muted)))
      .child(div().flex_1())
      .child(scopeControl(this.scope, this.width, (scope, cx) => this.setScope(scope, cx)))
      .child(
        div()
          .id("git-refresh")
          .size(24)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(6)
          .text_color(t.dim)
          .accessibility_label("Refresh git")
          .tooltip("Refresh")
          .when(!this.loading, (el) =>
            el
              .cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click((_event, cx) => {
                cx.stop_propagation();
                this.refresh(cx, { manual: true, force: true });
              }),
          )
          .when(this.loading, (el) => el.child(Spinner()))
          .when(!this.loading, (el) => el.child(Icon("refresh", 14))),
      );

    return header;
  },

  tabs(t, cx) {
    return h_flex()
      .id("git-tabs")
      .flex_none()
      .w_full()
      .px(8)
      .py(6)
      .gap(2)
      .flex_wrap()
      .border_b(1)
      .border_color(t.border)
      .children(
        TABS.map((tab) =>
          TabPill({
            id: `git-tab-${tab.id}`,
            label: tab.label,
            count: this.width < 640 || tab.id === "heatmap" ? undefined : this.listLength(tab.id),
            active: this.active === tab.id,
            onClick: (cx) => this.setTab(tab.id, cx),
          }),
        ),
      );
  },

  filterBar(t, cx) {
    const state = this.filterMode === "branch" ? this.branchInput : this.queryInput;
    if (!state) return div();
    return h_flex()
      .id("git-filter")
      .h(38)
      .flex_none()
      .w_full()
      .px(12)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(
        div()
          .flex_none()
          .text_size(10)
          .text_color(t.dim)
          .child(this.filterMode === "branch" ? "branches" : "rows"),
      )
      .child(
        Input.new(state)
          .flex_1()
          .min_w(0)
          .h(30)
          .px(9)
          .rounded(7)
          .border_1()
          .border_color(t.accent)
          .bg(t.input)
          .text_size(TEXT.small)
          .text_color(t.foreground),
      )
      .child(div().flex_none().text_size(9.5).text_color(t.dim).child("Esc/↵ done"))
      .child(
        div()
          .id("git-filter-close")
          .size(22)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(5)
          .cursor_pointer()
          .text_size(13)
          .text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_event, cx) => this.endFilter(cx))
          .child("×"),
      );
  },

  busyBar(t) {
    return h_flex()
      .id("git-busy-bar")
      .h(28)
      .flex_none()
      .w_full()
      .px(12)
      .gap(8)
      .items_center()
      .bg(t.canvas)
      .border_b(1)
      .border_color(t.border)
      .child(Spinner())
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.muted).child(this.busy))
      .child(
        div()
          .flex_none()
          .text_size(9.5)
          .text_color(t.dim)
          .child(this.root && this.on ? `${this.on}` : "git"),
      );
  },

  noticeBar(t) {
    return div()
      .id("git-notice")
      .flex_none()
      .w_full()
      .px(12)
      .py(4)
      .text_size(10.5)
      .text_color(t.done)
      .whitespace_normal()
      .child(this.notice);
  },

  errorBar(t) {
    return div()
      .id("git-error")
      .flex_none()
      .w_full()
      .px(12)
      .py(4)
      .text_size(10.5)
      .text_color(t.ansi1)
      .whitespace_normal()
      .child(this.error);
  },

  footer(t) {
    const info = [this.on ?? null, this.fixed ? "pinned" : "auto"].filter(Boolean).join(" · ");
    return h_flex()
      .id("git-footer")
      .h(28)
      .flex_none()
      .w_full()
      .px(12)
      .gap(8)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .text_size(10)
      .text_color(t.dim)
      .child(div().flex_1().min_w(0).truncate().child(this.footerHint()))
      .when(this.width >= 520, (el) => el.child(div().flex_none().text_size(9.5).child(info)));
  },

  footerHint() {
    if (this.filterMode) return "type to filter · Esc/↵ done";
    if (this.view) {
      if (this.view.kind === "diff") return "j/k scroll · q/Esc back";
      if (this.view.kind === "pr")
        return "j/k scroll · c/↵ checkout · a approve · o open · r refresh · q/Esc back";
      if (this.view.kind === "issue")
        return "j/k scroll · o open · r refresh · q/Esc back";
    }
    const scope = `m scope:${this.scope}`;
    const tail = "/ filter · " + scope + " · r refresh";
    if (this.active === "commits") return "j/k select · ↵ commit · " + tail;
    if (this.active === "flow") return "j/k branch · ↵ latest commit · " + tail;
    if (this.active === "branches") return "j/k select · ↵ checkout · d diff · " + tail;
    if (this.active === "prs") return "j/k select · ↵ detail · c create · " + tail;
    if (this.active === "issues") return "j/k select · ↵ detail · " + tail;
    if (this.active === "status") return "j/k select · d diff · " + scope + " · r refresh";
    return "h/l week · j/k day · " + tail;
  },
};

export default shellMethods;
