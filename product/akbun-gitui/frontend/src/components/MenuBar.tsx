import type { RepoInfo, TabKind } from "../types";

interface Props {
  repoInfo: RepoInfo;
  tab: TabKind;
  onTabChange: (tab: TabKind) => void;
  sshKeys: string[];
  activeCredential: number;
  onCredentialChange: (index: number) => void;
  onOpenRepo: () => void;
  onRefresh: () => void;
}

const TABS: { key: TabKind; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "log", label: "Log" },
  { key: "branches", label: "Branches" },
];

export default function MenuBar({
  repoInfo,
  tab,
  onTabChange,
  sshKeys,
  activeCredential,
  onCredentialChange,
  onOpenRepo,
  onRefresh,
}: Props) {
  return (
    <div className="menu-bar">
      <div className="menu-left">
        <span className="repo-name" onClick={onOpenRepo} title="Click to open another repo">
          {repoInfo.name}
        </span>
        <span className="branch-badge">
          {repoInfo.current_branch ?? "(detached)"}
        </span>
      </div>
      <div className="menu-center">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="menu-right">
        <select
          className="credential-selector"
          value={activeCredential}
          onChange={(e) => onCredentialChange(Number(e.target.value))}
          title="SSH Key / Credential"
        >
          {sshKeys.length === 0 && <option value={0}>No SSH keys</option>}
          {sshKeys.map((key, i) => (
            <option key={key} value={i}>
              {key.split("/").pop()}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={onRefresh} title="Refresh">
          ↻
        </button>
      </div>
    </div>
  );
}
