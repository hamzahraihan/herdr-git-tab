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
