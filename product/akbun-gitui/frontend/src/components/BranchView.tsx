import type { BranchInfo } from "../types";

interface Props {
  branches: BranchInfo[];
  onCheckout: (name: string) => void;
}

export default function BranchView({ branches, onCheckout }: Props) {
  const local = branches.filter((b) => !b.is_remote);
  const remote = branches.filter((b) => b.is_remote);

  return (
    <div className="branch-view">
      <div className="branch-section">
        <h3>Local</h3>
        {local.map((b) => (
          <div
            key={b.name}
            className={`branch-item ${b.is_head ? "current" : ""}`}
          >
            <span className="branch-name">
              {b.is_head && "* "}
              {b.name}
            </span>
            {!b.is_head && (
              <button
                className="checkout-btn"
                onClick={() => onCheckout(b.name)}
              >
                Checkout
              </button>
            )}
          </div>
        ))}
      </div>
      {remote.length > 0 && (
        <div className="branch-section">
          <h3>Remote</h3>
          {remote.map((b) => (
            <div key={b.name} className="branch-item remote">
              <span className="branch-name">{b.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
