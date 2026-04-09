import type { DiffFile } from "../types";

interface Props {
  files: DiffFile[];
}

export default function DiffView({ files }: Props) {
  if (files.length === 0) {
    return (
      <div className="diff-view empty">
        <p>No diff to display</p>
      </div>
    );
  }

  return (
    <div className="diff-view">
      {files.map((file, fi) => {
        const path = file.new_path ?? file.old_path ?? "unknown";
        return (
          <div key={`${path}-${fi}`} className="diff-file">
            <div className="diff-file-header">{path}</div>
            {file.hunks.map((hunk, hi) => (
              <div key={hi} className="diff-hunk">
                <div className="hunk-header">{hunk.header.trim()}</div>
                {hunk.lines.map((line, li) => {
                  let cls = "diff-line context";
                  if (line.origin === "+") cls = "diff-line added";
                  else if (line.origin === "-") cls = "diff-line removed";
                  return (
                    <pre key={li} className={cls}>
                      {line.origin === "+" ? "+" : line.origin === "-" ? "-" : " "}
                      {line.content}
                    </pre>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
