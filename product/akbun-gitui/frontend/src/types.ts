export interface RepoInfo {
  name: string;
  current_branch: string | null;
  is_bare: boolean;
  workdir: string | null;
}

export type FileStatusKind =
  | "New"
  | "Modified"
  | "Deleted"
  | "Renamed"
  | "Typechange";

export interface FileStatus {
  path: string;
  status: FileStatusKind;
}

export interface StatusResult {
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
}

export interface CommitInfo {
  id: string;
  short_id: string;
  author: string;
  email: string;
  message: string;
  time: string;
  parent_count: number;
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  upstream: string | null;
  commit_id: string;
}

export interface DiffLine {
  content: string;
  origin: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  old_path: string | null;
  new_path: string | null;
  hunks: DiffHunk[];
}

export type MergeResult =
  | "FastForward"
  | "Normal"
  | { Conflict: string[] };

export interface CredentialConfig {
  name: string;
  credential_type: unknown;
}

export interface CredentialStore {
  credentials: CredentialConfig[];
  active_index: number | null;
}

export type TabKind = "status" | "log" | "branches";
