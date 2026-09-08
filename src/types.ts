export type Commit = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  refs: string[];
  graph: string;
  parents: string[];
};

export type Branch = {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommit: string;
  /** ISO timestamp of the branch tip; absent when unknown (parse paths). */
  lastCommitDate?: string;
};

export type PR = {
  number: number;
  title: string;
  author: string;
  state: string;
  checks: string;
  branch: string;
  url: string;
};

export type Issue = {
  number: number;
  title: string;
  author: string;
  labels: string[];
  state: string;
  url: string;
};

export type Scope = "repo" | "mine";

export type DetailComment = {
  author: string;
  body: string;
  createdAt?: string;
};

export type DetailReview = {
  author: string;
  state: string;
  body?: string;
};

export type PRDetail = {
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  body: string;
  headRefName: string;
  baseRefName: string;
  checks: string;
  labels: string[];
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  reviews: DetailReview[];
  comments: DetailComment[];
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  isDraft: boolean;
};

export type IssueDetail = {
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  body: string;
  labels: string[];
  assignees: string[];
  comments: DetailComment[];
};


export type FileEntry = {
  path: string;
  staged: string;
  unstaged: string;
};

export type RepoStatus = {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: string[];
};

export type AuthorStat = {
  name: string;
  count: number;
};

export type RepoStats = {
  /** Human display form, e.g. github.com/user/repo. Null when no origin. */
  remote: string | null;
  /** Total commits across all refs. */
  total: number;
  /** ISO timestamps bounding history; null when unknown. */
  oldest: string | null;
  newest: string | null;
  /** Authors by commit count, descending. */
  authors: AuthorStat[];
};
