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
