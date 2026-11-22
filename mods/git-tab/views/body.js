// Picks the pane under the tab strip, or a reader opened over it.

export default {
  renderBody(t, cx) {
    if (this.fatal) return this.renderFatal(t, cx);
    if (this.view) {
      if (this.view.kind === "diff") return this.renderDiff(t);
      if (this.view.kind === "pr") return this.renderPRDetail(t, cx);
      if (this.view.kind === "issue") return this.renderIssueDetail(t, cx);
    }
    if (this.active === "commits") return this.renderCommits(t);
    if (this.active === "flow") return this.renderFlow(t);
    if (this.active === "branches") return this.renderBranches(t);
    if (this.active === "prs") return this.renderPRs(t, cx);
    if (this.active === "issues") return this.renderIssues(t, cx);
    if (this.active === "status") return this.renderStatus(t, cx);
    return this.renderHeatmap(t, cx);
  },
};
