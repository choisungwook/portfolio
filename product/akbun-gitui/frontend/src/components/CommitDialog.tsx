import { useState } from "react";
import type { FileStatus } from "../types";

interface Props {
  staged: FileStatus[];
  onCommit: (message: string) => void;
  onCancel: () => void;
}

export default function CommitDialog({ staged, onCommit, onCancel }: Props) {
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (message.trim() && staged.length > 0) {
      onCommit(message.trim());
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Commit</h3>
        <div className="staged-list">
          <p>{staged.length} file(s) staged</p>
          <ul>
            {staged.slice(0, 10).map((f) => (
              <li key={f.path}>
                <span className="status-badge green">{f.status[0]}</span>
                {f.path}
              </li>
            ))}
            {staged.length > 10 && (
              <li>...and {staged.length - 10} more</li>
            )}
          </ul>
        </div>
        <textarea
          className="commit-input"
          placeholder="Commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={!message.trim() || staged.length === 0}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
