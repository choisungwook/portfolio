use std::path::Path;

use anyhow::Result;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use git2::Repository;

use gitui_core::branch::{self, BranchInfo};
use gitui_core::commit;
use gitui_core::credential::{self, CredentialStore};
use gitui_core::diff::{self, DiffFile};
use gitui_core::log::{self, CommitInfo};
use gitui_core::repo::{self, RepoInfo};
use gitui_core::status::{self, StatusResult};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    Status,
    Log,
    Branches,
    Diff,
}

impl Tab {
    pub const ALL: [Tab; 4] = [Tab::Status, Tab::Log, Tab::Branches, Tab::Diff];

    pub fn label(&self) -> &'static str {
        match self {
            Tab::Status => "Status",
            Tab::Log => "Log",
            Tab::Branches => "Branches",
            Tab::Diff => "Diff",
        }
    }

    pub fn index(&self) -> usize {
        match self {
            Tab::Status => 0,
            Tab::Log => 1,
            Tab::Branches => 2,
            Tab::Diff => 3,
        }
    }
}

pub struct App {
    pub repo: Repository,
    pub repo_info: RepoInfo,
    pub current_tab: Tab,

    pub status: StatusResult,
    pub log_entries: Vec<CommitInfo>,
    pub branches: Vec<BranchInfo>,
    pub diff_files: Vec<DiffFile>,

    pub status_selected: usize,
    pub log_selected: usize,
    pub branch_selected: usize,
    pub diff_scroll: u16,

    pub credential_store: CredentialStore,

    pub show_help: bool,
    pub show_commit_input: bool,
    pub show_credential_picker: bool,
    pub commit_message: String,
    pub input_mode: bool,
}

impl App {
    pub fn new(path: &Path) -> Result<Self> {
        let repo = repo::open_repo(path)?;
        let repo_info = repo::repo_info(&repo)?;
        let status_result = status::get_status(&repo).unwrap_or_default();
        let log_entries = log::get_log(&repo, 100).unwrap_or_default();
        let branches = branch::list_branches(&repo).unwrap_or_default();
        let diff_files = diff::get_workdir_diff(&repo).unwrap_or_default();
        let mut credential_store = credential::load_credentials().unwrap_or_default();
        if credential_store.active_index.is_none() && !credential_store.credentials.is_empty() {
            credential_store.active_index = Some(0);
        }

        Ok(Self {
            repo,
            repo_info,
            current_tab: Tab::Status,
            status: status_result,
            log_entries,
            branches,
            diff_files,
            status_selected: 0,
            log_selected: 0,
            branch_selected: 0,
            diff_scroll: 0,
            credential_store,
            show_help: false,
            show_commit_input: false,
            show_credential_picker: false,
            commit_message: String::new(),
            input_mode: false,
        })
    }

    pub fn refresh(&mut self) {
        self.repo_info = repo::repo_info(&self.repo).unwrap_or(self.repo_info.clone());
        self.status = status::get_status(&self.repo).unwrap_or_default();
        self.log_entries = log::get_log(&self.repo, 100).unwrap_or_default();
        self.branches = branch::list_branches(&self.repo).unwrap_or_default();
        self.refresh_diff();
    }

    fn refresh_diff(&mut self) {
        self.diff_files = match self.current_tab {
            Tab::Status => {
                let mut diffs = diff::get_staged_diff(&self.repo).unwrap_or_default();
                diffs.extend(diff::get_workdir_diff(&self.repo).unwrap_or_default());
                diffs
            }
            Tab::Log => {
                if let Some(entry) = self.log_entries.get(self.log_selected) {
                    diff::get_commit_diff(&self.repo, &entry.id).unwrap_or_default()
                } else {
                    Vec::new()
                }
            }
            _ => diff::get_workdir_diff(&self.repo).unwrap_or_default(),
        };
        self.diff_scroll = 0;
    }

    /// Returns true if the app should quit.
    pub fn handle_key(&mut self, key: KeyEvent) -> bool {
        if self.show_commit_input {
            return self.handle_commit_input(key);
        }

        if self.show_help {
            self.show_help = false;
            return false;
        }

        if self.show_credential_picker {
            return self.handle_credential_picker(key);
        }

        match key.code {
            KeyCode::Char('q') => return true,
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => return true,

            KeyCode::Char('1') => self.switch_tab(Tab::Status),
            KeyCode::Char('2') => self.switch_tab(Tab::Log),
            KeyCode::Char('3') => self.switch_tab(Tab::Branches),
            KeyCode::Char('4') => self.switch_tab(Tab::Diff),

            KeyCode::Char('j') | KeyCode::Down => self.next_item(),
            KeyCode::Char('k') | KeyCode::Up => self.prev_item(),

            KeyCode::Char('s') if self.current_tab == Tab::Status => self.toggle_stage(),
            KeyCode::Char('c') if self.current_tab == Tab::Status => {
                self.show_commit_input = true;
                self.input_mode = true;
                self.commit_message.clear();
            }

            KeyCode::Enter => self.handle_enter(),
            KeyCode::Char('?') => self.show_help = true,
            KeyCode::Char('p') => {
                self.show_credential_picker = true;
            }

            KeyCode::Char('r') => self.refresh(),
            _ => {}
        }

        false
    }

    fn handle_commit_input(&mut self, key: KeyEvent) -> bool {
        match key.code {
            KeyCode::Esc => {
                self.show_commit_input = false;
                self.input_mode = false;
                self.commit_message.clear();
            }
            KeyCode::Enter => {
                self.do_commit();
                self.show_commit_input = false;
                self.input_mode = false;
            }
            KeyCode::Backspace => {
                self.commit_message.pop();
            }
            KeyCode::Char(c) => {
                self.commit_message.push(c);
            }
            _ => {}
        }
        false
    }

    fn handle_credential_picker(&mut self, key: KeyEvent) -> bool {
        let count = self.credential_store.credentials.len();
        match key.code {
            KeyCode::Esc | KeyCode::Char('p') => {
                self.show_credential_picker = false;
            }
            KeyCode::Char('j') | KeyCode::Down => {
                if count > 0 {
                    let current = self.credential_store.active_index.unwrap_or(0);
                    self.credential_store.active_index = Some((current + 1) % count);
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                if count > 0 {
                    let current = self.credential_store.active_index.unwrap_or(0);
                    self.credential_store.active_index =
                        Some(current.checked_sub(1).unwrap_or(count - 1));
                }
            }
            KeyCode::Enter => {
                self.show_credential_picker = false;
            }
            _ => {}
        }
        false
    }

    fn switch_tab(&mut self, tab: Tab) {
        self.current_tab = tab;
        self.diff_scroll = 0;
        self.refresh_diff();
    }

    fn next_item(&mut self) {
        match self.current_tab {
            Tab::Status => {
                let total = self.status_item_count();
                if total > 0 {
                    self.status_selected = (self.status_selected + 1) % total;
                }
            }
            Tab::Log => {
                let total = self.log_entries.len();
                if total > 0 {
                    self.log_selected = (self.log_selected + 1) % total;
                    self.refresh_diff();
                }
            }
            Tab::Branches => {
                let total = self.branches.len();
                if total > 0 {
                    self.branch_selected = (self.branch_selected + 1) % total;
                }
            }
            Tab::Diff => {
                self.diff_scroll = self.diff_scroll.saturating_add(1);
            }
        }
    }

    fn prev_item(&mut self) {
        match self.current_tab {
            Tab::Status => {
                let total = self.status_item_count();
                if total > 0 {
                    self.status_selected =
                        self.status_selected.checked_sub(1).unwrap_or(total - 1);
                }
            }
            Tab::Log => {
                let total = self.log_entries.len();
                if total > 0 {
                    self.log_selected = self.log_selected.checked_sub(1).unwrap_or(total - 1);
                    self.refresh_diff();
                }
            }
            Tab::Branches => {
                let total = self.branches.len();
                if total > 0 {
                    self.branch_selected =
                        self.branch_selected.checked_sub(1).unwrap_or(total - 1);
                }
            }
            Tab::Diff => {
                self.diff_scroll = self.diff_scroll.saturating_sub(1);
            }
        }
    }

    fn handle_enter(&mut self) {
        if self.current_tab == Tab::Status || self.current_tab == Tab::Log {
            self.switch_tab(Tab::Diff);
        }
    }

    fn toggle_stage(&mut self) {
        let (section, index) = self.resolve_status_index();
        let path = match section {
            StatusSection::Staged => self.status.staged.get(index).map(|f| f.path.clone()),
            StatusSection::Unstaged => self.status.unstaged.get(index).map(|f| f.path.clone()),
            StatusSection::Untracked => self.status.untracked.get(index).map(|f| f.path.clone()),
            StatusSection::None => None,
        };

        if let Some(path) = path {
            match section {
                StatusSection::Staged => {
                    let _ = commit::unstage_files(&self.repo, &[path.as_str()]);
                }
                StatusSection::Unstaged | StatusSection::Untracked => {
                    let _ = commit::stage_files(&self.repo, &[path.as_str()]);
                }
                StatusSection::None => {}
            }
            self.status = status::get_status(&self.repo).unwrap_or_default();
            self.refresh_diff();
        }
    }

    fn do_commit(&mut self) {
        if self.commit_message.trim().is_empty() {
            return;
        }
        if self.status.staged.is_empty() {
            return;
        }
        let _ = commit::create_commit(&self.repo, &self.commit_message);
        self.commit_message.clear();
        self.refresh();
    }

    pub fn status_item_count(&self) -> usize {
        self.status.staged.len() + self.status.unstaged.len() + self.status.untracked.len()
    }

    pub fn resolve_status_index(&self) -> (StatusSection, usize) {
        let staged_len = self.status.staged.len();
        let unstaged_len = self.status.unstaged.len();
        let untracked_len = self.status.untracked.len();

        if self.status_selected < staged_len {
            (StatusSection::Staged, self.status_selected)
        } else if self.status_selected < staged_len + unstaged_len {
            (StatusSection::Unstaged, self.status_selected - staged_len)
        } else if self.status_selected < staged_len + unstaged_len + untracked_len {
            (
                StatusSection::Untracked,
                self.status_selected - staged_len - unstaged_len,
            )
        } else {
            (StatusSection::None, 0)
        }
    }

    pub fn active_credential_label(&self) -> String {
        match self.credential_store.active_index {
            Some(idx) => self
                .credential_store
                .credentials
                .get(idx)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "none".into()),
            None => "none".into(),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StatusSection {
    Staged,
    Unstaged,
    Untracked,
    None,
}
