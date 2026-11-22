// Render methods are split by pane; main.js assigns this one object to its prototype.

import fatal from "./views/fatal.js";
import commits from "./views/commits.js";
import flow from "./views/flow.js";
import branches from "./views/branches.js";
import status from "./views/status.js";
import heatmap from "./views/heatmap.js";
import diff from "./views/diff.js";
import prs from "./views/prs.js";
import issues from "./views/issues.js";
import prDetail from "./views/prDetail.js";
import issueDetail from "./views/issueDetail.js";
import body from "./views/body.js";

export default Object.assign(
  {},
  fatal,
  commits,
  flow,
  branches,
  status,
  heatmap,
  diff,
  prs,
  issues,
  prDetail,
  issueDetail,
  body,
);
