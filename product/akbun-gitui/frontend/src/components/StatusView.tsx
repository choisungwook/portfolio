import type { StatusResult, FileStatus } from "../types";

interface Props {
  status: StatusResult;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onCommit: () => void;
}

function FileItem({
  file,
  color,
  onClick,
  actionLabel,
}: {
  file: FileStatus;
  color: string;
  onClick: () => void;
  actionLabel: string;
}) {
  return (
    <div className="file-item">
      <span className={`status-badge ${color}`}>{file.status[0]}</span>
      <span className="file-path">{file.path}</span>
      <button className="file-action" onClick={onClick}>
        {actionLabel}
      </button>
    </div>
  );
}

export default function StatusView({
  status,
  onStage,
  onUnstage,
  onCommit,
}: Props) {
  const isEmpty =
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0;

  return (
    <div className="status-view">
      {isEmpty && (
        <p className="empty-message">Working tree clean</p>
      )}

      {status.staged.length > 0 && (
        <div className="file-section">
          <div className="section-header staged">
            <span>Staged ({status.staged.length})</span>
            <button className="commit-btn" onClick={onCommit}>
              Commit
            </button>
          </div>
          {status.staged.map((f) => (
            <FileItem
              key={f.path}
              file={f}
              color="green"
              onClick={() => onUnstage([f.path])}
              actionLabel="Unstage"
            />
          ))}
        </div>
      )}

      {status.unstaged.length > 0 && (
        <div className="file-section">
          <div className="section-header unstaged">
            <span>Unstaged ({status.unstaged.length})</span>
          </div>
          {status.unstaged.map((f) => (
            <FileItem
              key={f.path}
              file={f}
              color="red"
              onClick={() => onStage([f.path])}
              actionLabel="Stage"
            />
          ))}
        </div>
      )}

      {status.untracked.length > 0 && (
        <div className="file-section">
          <div className="section-header untracked">
            <span>Untracked ({status.untracked.length})</span>
          </div>
          {status.untracked.map((f) => (
            <FileItem
              key={f.path}
              file={f}
              color="yellow"
              onClick={() => onStage([f.path])}
              actionLabel="Stage"
            />
          ))}
        </div>
      )}
    </div>
  );
}
