import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  RepoInfo,
  StatusResult,
  CommitInfo,
  BranchInfo,
  DiffFile,
  TabKind,
} from "./types";
import MenuBar from "./components/MenuBar";
import StatusView from "./components/StatusView";
import LogView from "./components/LogView";
import BranchView from "./components/BranchView";
import DiffView from "./components/DiffView";
import CommitDialog from "./components/CommitDialog";

function App() {
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [tab, setTab] = useState<TabKind>("status");
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  const [activeCredential, setActiveCredential] = useState<number>(0);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoInfo) return;
    try {
      const [s, c, b, d] = await Promise.all([
        invoke<StatusResult>("get_status"),
        invoke<CommitInfo[]>("get_log", { maxCount: 100 }),
        invoke<BranchInfo[]>("get_branches"),
        invoke<DiffFile[]>("get_workdir_diff"),
      ]);
      setStatus(s);
      setCommits(c);
      setBranches(b);
      setDiffFiles(d);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [repoInfo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openRepo = async () => {
    const dir = await open({ directory: true });
    if (!dir) return;
    try {
      const info = await invoke<RepoInfo>("open_repository", {
        path: dir as string,
      });
      setRepoInfo(info);
      const keys = await invoke<string[]>("get_ssh_keys");
      setSshKeys(keys);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStage = async (paths: string[]) => {
    await invoke("stage_files", { paths });
    refresh();
  };

  const handleUnstage = async (paths: string[]) => {
    await invoke("unstage_files", { paths });
    refresh();
  };

  const handleCommit = async (message: string) => {
    await invoke("create_commit", { message });
    setShowCommitDialog(false);
    refresh();
  };

  const handleCheckout = async (name: string) => {
    await invoke("checkout_branch", { name });
    const info = await invoke<RepoInfo>("get_status");
    setRepoInfo((prev) => (prev ? { ...prev, ...info } : prev));
    refresh();
  };

  const handleViewCommitDiff = async (oid: string) => {
    const d = await invoke<DiffFile[]>("get_commit_diff", { oid });
    setDiffFiles(d);
  };

  const handleCredentialChange = async (index: number) => {
    setActiveCredential(index);
    await invoke("set_active_credential", { index });
  };

  if (!repoInfo) {
    return (
      <div className="welcome">
        <h1>akbun-gitui</h1>
        <p>Open a Git repository to start</p>
        <button onClick={openRepo}>Open Repository</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="app">
      <MenuBar
        repoInfo={repoInfo}
        tab={tab}
        onTabChange={setTab}
        sshKeys={sshKeys}
        activeCredential={activeCredential}
        onCredentialChange={handleCredentialChange}
        onOpenRepo={openRepo}
        onRefresh={refresh}
      />
      <div className="main-layout">
        <div className="content-panel">
          {tab === "status" && status && (
            <StatusView
              status={status}
              onStage={handleStage}
              onUnstage={handleUnstage}
              onCommit={() => setShowCommitDialog(true)}
            />
          )}
          {tab === "log" && (
            <LogView
              commits={commits}
              onViewDiff={handleViewCommitDiff}
            />
          )}
          {tab === "branches" && (
            <BranchView
              branches={branches}
              onCheckout={handleCheckout}
            />
          )}
        </div>
        <div className="diff-panel">
          <DiffView files={diffFiles} />
        </div>
      </div>
      {error && <div className="error-bar">{error}</div>}
      {showCommitDialog && (
        <CommitDialog
          staged={status?.staged ?? []}
          onCommit={handleCommit}
          onCancel={() => setShowCommitDialog(false)}
        />
      )}
    </div>
  );
}

export default App;
