import type { CommitInfo } from "../types";

interface Props {
  commits: CommitInfo[];
  onViewDiff: (oid: string) => void;
}

export default function LogView({ commits, onViewDiff }: Props) {
  return (
    <div className="log-view">
      <table className="log-table">
        <thead>
          <tr>
            <th>Hash</th>
            <th>Author</th>
            <th>Message</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {commits.map((c) => (
            <tr
              key={c.id}
              className="log-row"
              onClick={() => onViewDiff(c.id)}
            >
              <td className="hash">{c.short_id}</td>
              <td className="author">{c.author}</td>
              <td className="message">{c.message.split("\n")[0]}</td>
              <td className="date">
                {new Date(c.time).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
