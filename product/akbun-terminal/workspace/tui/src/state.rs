//! Everything the screen shows, and every decision about what a key does.
//!
//! No IO lives here. Input goes in (keys, mouse, daemon events), and what has
//! to happen outside comes out as [`Action`]s for the loop to carry out. That
//! split is what lets the whole behaviour be tested without a daemon or a tty.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::num::NonZeroU16;

use akbun_terminal_core::protocol::{SessionInfo, WorkspaceState};
use akbun_terminal_core::tree::{Project, TreeState, WorkspaceStatus};
use ratatui::crossterm::event::{
    KeyCode, KeyEvent, KeyEventKind, KeyModifiers, MouseButton, MouseEvent, MouseEventKind,
};
use ratatui::layout::Rect;

use crate::keys::{encode_key, encode_paste};
use crate::layout::{layout, list_window, pane_size, tab_spans};

/// Lines of history kept per shell on this side. The daemon only replays a
/// raw tail, so this is what the wheel can reach.
const SCROLLBACK_LINES: usize = 5000;
/// Lines the wheel moves per notch.
const WHEEL_LINES: usize = 3;
/// The name of the group for shells that belong to no workspace.
pub const UNASSIGNED: &str = "unassigned";

/// Which workspace's tabs are on screen. Shells with no workspace, or one the
/// tree no longer has, share a group of their own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Group {
    Workspace(u64),
    Unassigned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    Workspaces,
    Agents,
}

/// What the sidebar's selection sits on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cursor {
    Project(u64),
    Workspace(u64),
    Unassigned,
    Agent(u32),
}

/// One line of the sidebar.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub cursor: Cursor,
    pub depth: u16,
    pub label: String,
    /// Absent on a project, which is only a heading.
    pub status: Option<WorkspaceStatus>,
    /// The workspace an agent runs in; empty elsewhere.
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Mode {
    /// Keys go to the shell.
    Terminal,
    /// The prefix was pressed; the next key is a command.
    Command,
    Prompt(Prompt),
    Confirm(Confirm),
    Help,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Prompt {
    pub kind: PromptKind,
    pub title: String,
    pub fields: Vec<Field>,
    pub focus: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PromptKind {
    NewProject,
    NewWorkspace { project: u64 },
    RenameProject { project: u64 },
    RenameWorkspace { workspace: u64 },
    RenameSession { session: u32 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Confirm {
    pub text: String,
    pub action: Action,
}

/// What the loop has to do on the state's behalf.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Write { session: u32, bytes: Vec<u8> },
    Resize { session: u32, cols: u16, rows: u16 },
    Spawn { cwd: String, workspace: Option<u64> },
    Close { session: u32 },
    ClearStatus { workspace: u64, session: u32 },
    CreateProject { name: String, path: String },
    CreateWorkspace { project: u64, name: String },
    RenameProject { project: u64, name: String },
    RenameWorkspace { workspace: u64, name: String },
    RenameSession { session: u32, name: String },
    DeleteWorkspace { workspace: u64 },
    Quit,
}

/// What reconciling with the daemon's session list found.
#[derive(Debug, Default, PartialEq)]
pub struct Reconciled {
    /// Sessions the daemon has that this client has not attached to yet.
    pub attach: Vec<u32>,
    pub actions: Vec<Action>,
}

/// One shell as this client knows it: what the daemon says about it, and the
/// screen this client keeps for it.
pub struct Shell {
    pub id: u32,
    pub name: Option<String>,
    pub parent: Option<u32>,
    pub workspace: Option<u64>,
    pub agent: Option<String>,
    pub status: WorkspaceStatus,
    /// The size the daemon last heard for this shell.
    pub size: (u16, u16),
    pub parser: vt100::Parser,
}

pub struct State {
    pub projects: Vec<Project>,
    shells: BTreeMap<u32, Shell>,
    pub view: View,
    pub sidebar: bool,
    pub active: Option<Group>,
    chosen: HashMap<Group, u32>,
    pub cursor: Option<Cursor>,
    pub mode: Mode,
    pub notice: Option<String>,
    /// The whole screen, as the last draw saw it.
    pub area: Rect,
    /// Where the TUI was started, the default folder for new projects.
    pub cwd: String,
    /// A group that was selected while empty, which gets a shell once the
    /// selection has settled (see `take_spawn`).
    pub pending_spawn: Option<Group>,
}

fn nz(value: u16) -> NonZeroU16 {
    NonZeroU16::new(value).unwrap_or(NonZeroU16::MIN)
}

/// How blocked a status is, so a workspace can show the worst of its shells.
fn severity(status: WorkspaceStatus) -> u8 {
    match status {
        WorkspaceStatus::Idle => 0,
        WorkspaceStatus::Completed => 1,
        WorkspaceStatus::Running => 2,
        WorkspaceStatus::Failed => 3,
        WorkspaceStatus::NeedsAttention => 4,
    }
}

fn is_prefix(key: &KeyEvent) -> bool {
    key.code == KeyCode::Char('g') && key.modifiers.contains(KeyModifiers::CONTROL)
}

impl State {
    pub fn new(cwd: &str) -> State {
        State {
            projects: Vec::new(),
            shells: BTreeMap::new(),
            view: View::Workspaces,
            sidebar: true,
            active: None,
            chosen: HashMap::new(),
            cursor: None,
            mode: Mode::Terminal,
            notice: None,
            area: Rect::new(0, 0, 80, 24),
            cwd: cwd.to_string(),
            pending_spawn: None,
        }
    }

    // ---- the tree and the shells -------------------------------------

    fn workspace_ids(&self) -> Vec<u64> {
        self.projects
            .iter()
            .flat_map(|project| project.workspaces.iter().map(|w| w.id))
            .collect()
    }

    fn workspace_name(&self, id: u64) -> Option<&str> {
        self.projects
            .iter()
            .flat_map(|project| project.workspaces.iter())
            .find(|w| w.id == id)
            .map(|w| w.name.as_str())
    }

    fn project_of_workspace(&self, id: u64) -> Option<&Project> {
        self.projects
            .iter()
            .find(|project| project.workspaces.iter().any(|w| w.id == id))
    }

    fn group_of(&self, shell: &Shell) -> Group {
        match shell.workspace {
            Some(id) if self.workspace_name(id).is_some() => Group::Workspace(id),
            _ => Group::Unassigned,
        }
    }

    pub fn shell(&self, id: u32) -> Option<&Shell> {
        self.shells.get(&id)
    }

    /// The shells of a group in the order they were opened.
    pub fn tabs(&self, group: Group) -> Vec<u32> {
        self.shells
            .values()
            .filter(|shell| self.group_of(shell) == group)
            .map(|shell| shell.id)
            .collect()
    }

    pub fn active_tabs(&self) -> Vec<u32> {
        self.active
            .map(|group| self.tabs(group))
            .unwrap_or_default()
    }

    /// The shell whose screen is showing.
    pub fn visible(&self) -> Option<u32> {
        let group = self.active?;
        let tabs = self.tabs(group);
        match self.chosen.get(&group) {
            Some(id) if tabs.contains(id) => Some(*id),
            _ => tabs.first().copied(),
        }
    }

    /// What a tab says: the shell's name, else its place in the strip.
    pub fn tab_label(&self, id: u32) -> String {
        let Some(shell) = self.shells.get(&id) else {
            return String::new();
        };
        if let Some(name) = &shell.name {
            return name.clone();
        }
        let position = self
            .active_tabs()
            .iter()
            .position(|tab| *tab == id)
            .unwrap_or(0);
        format!("shell {}", position + 1)
    }

    /// The worst status among a group's shells.
    pub fn group_status(&self, group: Group) -> WorkspaceStatus {
        self.shells
            .values()
            .filter(|shell| self.group_of(shell) == group)
            .map(|shell| shell.status)
            .max_by_key(|status| severity(*status))
            .unwrap_or(WorkspaceStatus::Idle)
    }

    /// Takes a shell this client has just attached to. `replay` is drawn
    /// before anything live, so the screen is what a viewer that had been
    /// there all along would show.
    pub fn add_session(&mut self, info: &SessionInfo, cols: u16, rows: u16, replay: &[Vec<u8>]) {
        let mut parser = vt100::Parser::new(nz(rows), nz(cols), SCROLLBACK_LINES);
        for chunk in replay {
            parser.process(chunk);
        }
        self.shells.insert(
            info.session,
            Shell {
                id: info.session,
                name: info.name.clone(),
                parent: info.parent,
                workspace: info.workspace,
                agent: info.agent.clone(),
                status: info.status,
                size: (cols, rows),
                parser,
            },
        );
        if self.active.is_none() {
            self.active = Some(self.group_of(&self.shells[&info.session]));
        }
    }

    pub fn output(&mut self, session: u32, bytes: &[u8]) {
        if let Some(shell) = self.shells.get_mut(&session) {
            shell.parser.process(bytes);
        }
    }

    /// A shell ended or was closed. The tab next to it takes over, the way a
    /// browser does, rather than jumping back to the first.
    pub fn exited(&mut self, session: u32) {
        let Some(shell) = self.shells.get(&session) else {
            return;
        };
        let group = self.group_of(shell);
        let before = self.tabs(group);
        let index = before.iter().position(|id| *id == session).unwrap_or(0);
        self.shells.remove(&session);
        let after = self.tabs(group);
        if self.chosen.get(&group) == Some(&session) || !self.chosen.contains_key(&group) {
            if let Some(next) = after.get(index.min(after.len().saturating_sub(1))) {
                self.chosen.insert(group, *next);
            } else {
                self.chosen.remove(&group);
            }
        }
        self.fix_selection();
    }

    /// Takes what `sessions` says about every live shell. Statuses, names and
    /// parents change under us (another client renames, an agent starts), so
    /// this runs on the timer; a shell that is gone is dropped, a shell this
    /// client has not seen is reported for attaching.
    pub fn reconcile(&mut self, infos: &[SessionInfo]) -> Reconciled {
        let live: HashSet<u32> = infos.iter().map(|info| info.session).collect();
        let gone: Vec<u32> = self
            .shells
            .keys()
            .filter(|id| !live.contains(id))
            .copied()
            .collect();
        for id in gone {
            self.exited(id);
        }
        let mut result = Reconciled::default();
        for info in infos {
            match self.shells.get_mut(&info.session) {
                Some(shell) => {
                    shell.name = info.name.clone();
                    shell.parent = info.parent;
                    shell.workspace = info.workspace;
                    shell.agent = info.agent.clone();
                    shell.status = info.status;
                }
                None => result.attach.push(info.session),
            }
        }
        self.fix_selection();
        result.actions = self.look();
        result
    }

    /// Takes the per-shell statuses a `detect` reply carries.
    pub fn apply_statuses(&mut self, statuses: &[WorkspaceState]) -> Vec<Action> {
        for workspace in statuses {
            for session in &workspace.sessions {
                if let Some(shell) = self.shells.get_mut(&session.session) {
                    shell.status = session.status;
                }
            }
        }
        self.look()
    }

    /// Replaces the tree, for a change another client made. The selection
    /// moves to the neighbour if what it was on is gone.
    pub fn set_tree(&mut self, tree: TreeState) {
        let before = self.workspace_ids();
        self.projects = tree.projects;
        if let Some(Group::Workspace(id)) = self.active {
            if self.workspace_name(id).is_none() {
                let after = self.workspace_ids();
                let index = before.iter().position(|w| *w == id).unwrap_or(0);
                self.active = match after.get(index.min(after.len().saturating_sub(1))) {
                    Some(next) => Some(Group::Workspace(*next)),
                    None => None,
                };
                if let Some(Group::Workspace(next)) = self.active {
                    self.cursor = Some(Cursor::Workspace(next));
                }
            }
        }
        if let Some(Cursor::Workspace(id)) = self.cursor {
            if self.workspace_name(id).is_none() {
                self.cursor = self.active.and_then(|group| match group {
                    Group::Workspace(id) => Some(Cursor::Workspace(id)),
                    Group::Unassigned => Some(Cursor::Unassigned),
                });
            }
        }
        if let Some(Cursor::Project(id)) = self.cursor {
            if !self.projects.iter().any(|project| project.id == id) {
                self.cursor = None;
            }
        }
        self.fix_selection();
    }

    /// As `set_tree`, for the tree this client's own create just returned: the
    /// newest project or workspace is where the person wants to be.
    pub fn set_tree_selecting_new(&mut self, tree: TreeState) -> Vec<Action> {
        let known: HashSet<u64> = self
            .projects
            .iter()
            .flat_map(|project| {
                std::iter::once(project.id).chain(project.workspaces.iter().map(|w| w.id))
            })
            .collect();
        self.set_tree(tree);
        let newest = self
            .projects
            .iter()
            .flat_map(|project| {
                std::iter::once((project.id, true))
                    .chain(project.workspaces.iter().map(|w| (w.id, false)))
            })
            .filter(|(id, _)| !known.contains(id))
            .max_by_key(|(id, _)| *id);
        match newest {
            Some((id, true)) => {
                self.view = View::Workspaces;
                self.cursor = Some(Cursor::Project(id));
                Vec::new()
            }
            Some((id, false)) => {
                self.view = View::Workspaces;
                self.cursor = Some(Cursor::Workspace(id));
                self.set_active(Group::Workspace(id))
            }
            None => Vec::new(),
        }
    }

    /// The first selection once the shells are attached: the group of the
    /// oldest shell, else the first workspace.
    pub fn init_selection(&mut self) -> Vec<Action> {
        let group = self
            .shells
            .values()
            .next()
            .map(|shell| self.group_of(shell))
            .or_else(|| self.workspace_ids().first().map(|id| Group::Workspace(*id)));
        match group {
            Some(group) => {
                self.cursor = Some(match group {
                    Group::Workspace(id) => Cursor::Workspace(id),
                    Group::Unassigned => Cursor::Unassigned,
                });
                self.set_active(group)
            }
            None => {
                self.cursor = self
                    .projects
                    .first()
                    .map(|project| Cursor::Project(project.id));
                Vec::new()
            }
        }
    }

    /// Keeps the selection pointing at something that exists.
    fn fix_selection(&mut self) {
        if let Some(Group::Unassigned) = self.active {
            if self.tabs(Group::Unassigned).is_empty() {
                self.active = self.workspace_ids().first().map(|id| Group::Workspace(*id));
                self.cursor = self.active.map(|group| match group {
                    Group::Workspace(id) => Cursor::Workspace(id),
                    Group::Unassigned => Cursor::Unassigned,
                });
            }
        }
        if self.active.is_none() {
            self.active = self
                .shells
                .values()
                .next()
                .map(|shell| self.group_of(shell))
                .or_else(|| self.workspace_ids().first().map(|id| Group::Workspace(*id)));
        }
        if let Some(Cursor::Agent(id)) = self.cursor {
            if !self.shells.contains_key(&id) {
                self.cursor = None;
            }
        }
        if let Some(Cursor::Unassigned) = self.cursor {
            if self.tabs(Group::Unassigned).is_empty() {
                self.cursor = None;
            }
        }
        if self.cursor.is_none() {
            self.cursor = self.rows().first().map(|row| row.cursor);
        }
    }

    // ---- the sidebar ----------------------------------------------------

    pub fn rows(&self) -> Vec<Row> {
        match self.view {
            View::Workspaces => self.workspace_rows(),
            View::Agents => self.agent_rows(),
        }
    }

    fn workspace_rows(&self) -> Vec<Row> {
        let mut rows = Vec::new();
        for project in &self.projects {
            rows.push(Row {
                cursor: Cursor::Project(project.id),
                depth: 0,
                label: project.name.clone(),
                status: None,
                detail: String::new(),
            });
            for workspace in &project.workspaces {
                rows.push(Row {
                    cursor: Cursor::Workspace(workspace.id),
                    depth: 1,
                    label: workspace.name.clone(),
                    status: Some(self.group_status(Group::Workspace(workspace.id))),
                    detail: String::new(),
                });
            }
        }
        if !self.tabs(Group::Unassigned).is_empty() {
            rows.push(Row {
                cursor: Cursor::Unassigned,
                depth: 0,
                label: UNASSIGNED.to_string(),
                status: Some(self.group_status(Group::Unassigned)),
                detail: String::new(),
            });
        }
        rows
    }

    /// Every shell with an agent under it, a child beneath the shell that
    /// started it. A child whose parent is not itself an agent is a root: the
    /// list is of agents, not of every shell between them.
    fn agent_rows(&self) -> Vec<Row> {
        let agents: Vec<&Shell> = self.shells.values().filter(|s| s.agent.is_some()).collect();
        let ids: HashSet<u32> = agents.iter().map(|s| s.id).collect();
        let mut rows = Vec::new();
        let mut seen = HashSet::new();
        let roots = agents
            .iter()
            .filter(|s| s.parent.is_none_or(|parent| !ids.contains(&parent)));
        for root in roots {
            self.push_agent(&agents, root, 0, &mut seen, &mut rows);
        }
        rows
    }

    fn push_agent(
        &self,
        agents: &[&Shell],
        shell: &Shell,
        depth: u16,
        seen: &mut HashSet<u32>,
        rows: &mut Vec<Row>,
    ) {
        if !seen.insert(shell.id) {
            return;
        }
        let place = match self.group_of(shell) {
            Group::Workspace(id) => self.workspace_name(id).unwrap_or(UNASSIGNED).to_string(),
            Group::Unassigned => UNASSIGNED.to_string(),
        };
        let label = shell
            .name
            .clone()
            .or_else(|| shell.agent.clone())
            .unwrap_or_default();
        rows.push(Row {
            cursor: Cursor::Agent(shell.id),
            depth,
            label,
            status: Some(shell.status),
            detail: place,
        });
        for child in agents.iter().filter(|s| s.parent == Some(shell.id)) {
            self.push_agent(agents, child, depth + 1, seen, rows);
        }
    }

    fn cursor_index(&self, rows: &[Row]) -> usize {
        self.cursor
            .and_then(|cursor| rows.iter().position(|row| row.cursor == cursor))
            .unwrap_or(0)
    }

    fn move_cursor(&mut self, delta: i32) -> Vec<Action> {
        let rows = self.rows();
        if rows.is_empty() {
            return Vec::new();
        }
        let index = self.cursor_index(&rows) as i32 + delta;
        let index = index.clamp(0, rows.len() as i32 - 1) as usize;
        self.cursor = Some(rows[index].cursor);
        self.activate(rows[index].cursor)
    }

    /// Goes where the cursor is: opens the workspace, or the agent's tab.
    fn activate(&mut self, cursor: Cursor) -> Vec<Action> {
        match cursor {
            Cursor::Project(_) => Vec::new(),
            Cursor::Workspace(id) => self.set_active(Group::Workspace(id)),
            Cursor::Unassigned => self.set_active(Group::Unassigned),
            Cursor::Agent(id) => self.select_session(id),
        }
    }

    fn set_active(&mut self, group: Group) -> Vec<Action> {
        self.active = Some(group);
        self.pending_spawn = match group {
            Group::Workspace(_) if self.tabs(group).is_empty() => Some(group),
            _ => None,
        };
        self.look()
    }

    /// Brings a shell's tab to the front, in its own workspace.
    pub fn select_session(&mut self, id: u32) -> Vec<Action> {
        let Some(shell) = self.shells.get(&id) else {
            return Vec::new();
        };
        let group = self.group_of(shell);
        self.active = Some(group);
        self.chosen.insert(group, id);
        self.pending_spawn = None;
        if self.view == View::Workspaces {
            self.cursor = Some(match group {
                Group::Workspace(w) => Cursor::Workspace(w),
                Group::Unassigned => Cursor::Unassigned,
            });
        }
        self.look()
    }

    /// Looking at a finished shell is what ends "finished", so the daemon is
    /// told, and the mark goes at once instead of on the next poll.
    fn look(&mut self) -> Vec<Action> {
        let Some(id) = self.visible() else {
            return Vec::new();
        };
        let Some(shell) = self.shells.get_mut(&id) else {
            return Vec::new();
        };
        if shell.status != WorkspaceStatus::Completed {
            return Vec::new();
        }
        let Some(workspace) = shell.workspace else {
            return Vec::new();
        };
        shell.status = WorkspaceStatus::Idle;
        vec![Action::ClearStatus {
            workspace,
            session: id,
        }]
    }

    /// A shell for a workspace that was selected while empty, once the
    /// selection has stayed put. Walking the cursor over a list must not leave
    /// a shell behind in every workspace it passed.
    pub fn take_spawn(&mut self) -> Option<Action> {
        let group = self.pending_spawn.take()?;
        if !self.tabs(group).is_empty() || self.active != Some(group) {
            return None;
        }
        Some(self.spawn_for(group))
    }

    fn spawn_for(&self, group: Group) -> Action {
        match group {
            Group::Workspace(id) => {
                let cwd = self
                    .project_of_workspace(id)
                    .and_then(|project| project.path.clone())
                    .unwrap_or_else(|| self.cwd.clone());
                Action::Spawn {
                    cwd,
                    workspace: Some(id),
                }
            }
            Group::Unassigned => Action::Spawn {
                cwd: self.cwd.clone(),
                workspace: None,
            },
        }
    }

    fn project_of_cursor(&self) -> Option<u64> {
        match self.cursor? {
            Cursor::Project(id) => Some(id),
            Cursor::Workspace(id) => self.project_of_workspace(id).map(|project| project.id),
            Cursor::Unassigned => None,
            Cursor::Agent(session) => {
                let workspace = self.shells.get(&session)?.workspace?;
                self.project_of_workspace(workspace)
                    .map(|project| project.id)
            }
        }
    }

    // ---- layout -----------------------------------------------------------

    /// Takes the terminal's size. The visible shell is resized to the pane
    /// whenever it differs, so a shell that was last seen at another size (or
    /// by another client) fits what is on screen.
    pub fn set_area(&mut self, area: Rect) {
        self.area = area;
    }

    pub fn pane(&self) -> (u16, u16) {
        pane_size(self.area, self.sidebar)
    }

    pub fn sync_size(&mut self) -> Vec<Action> {
        let (cols, rows) = self.pane();
        let Some(id) = self.visible() else {
            return Vec::new();
        };
        let Some(shell) = self.shells.get_mut(&id) else {
            return Vec::new();
        };
        if shell.size == (cols, rows) {
            return Vec::new();
        }
        shell.size = (cols, rows);
        shell.parser.set_size(nz(rows), nz(cols));
        vec![Action::Resize {
            session: id,
            cols,
            rows,
        }]
    }

    /// The text of every tab in the strip, mark included.
    pub fn tab_texts(&self) -> Vec<(u32, String)> {
        self.active_tabs()
            .into_iter()
            .map(|id| {
                let status = self
                    .shells
                    .get(&id)
                    .map_or(WorkspaceStatus::Idle, |s| s.status);
                (id, format!(" {} {} ", mark(status).0, self.tab_label(id)))
            })
            .collect()
    }

    // ---- keys ----------------------------------------------------------------

    pub fn on_key(&mut self, key: KeyEvent) -> Vec<Action> {
        if key.kind == KeyEventKind::Release {
            return Vec::new();
        }
        self.notice = None;
        match self.mode.clone() {
            Mode::Terminal => self.terminal_key(key),
            Mode::Command => {
                self.mode = Mode::Terminal;
                self.command_key(key)
            }
            Mode::Prompt(prompt) => self.prompt_key(prompt, key),
            Mode::Confirm(confirm) => {
                self.mode = Mode::Terminal;
                match key.code {
                    KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                        vec![confirm.action]
                    }
                    _ => Vec::new(),
                }
            }
            Mode::Help => {
                self.mode = Mode::Terminal;
                Vec::new()
            }
        }
    }

    fn terminal_key(&mut self, key: KeyEvent) -> Vec<Action> {
        if is_prefix(&key) {
            self.mode = Mode::Command;
            return Vec::new();
        }
        let Some(id) = self.visible() else {
            return Vec::new();
        };
        let Some(shell) = self.shells.get_mut(&id) else {
            return Vec::new();
        };
        // Shift with the paging keys is the scrollback, the way terminals
        // themselves treat it; plain paging keys belong to the program.
        if key.modifiers.contains(KeyModifiers::SHIFT) {
            match key.code {
                KeyCode::PageUp => return self.scroll(id, page(self.pane().1)),
                KeyCode::PageDown => return self.scroll(id, -page(self.pane().1)),
                _ => {}
            }
        }
        let application_cursor = shell.parser.screen().application_cursor();
        shell.parser.screen_mut().set_scrollback(0);
        match encode_key(key, application_cursor) {
            Some(bytes) => vec![Action::Write { session: id, bytes }],
            None => Vec::new(),
        }
    }

    pub fn on_paste(&mut self, text: &str) -> Vec<Action> {
        match &mut self.mode {
            Mode::Prompt(prompt) => {
                let flat: String = text.chars().filter(|c| !c.is_control()).collect();
                prompt.fields[prompt.focus].value.push_str(&flat);
                Vec::new()
            }
            Mode::Terminal => {
                let Some(id) = self.visible() else {
                    return Vec::new();
                };
                let Some(shell) = self.shells.get_mut(&id) else {
                    return Vec::new();
                };
                shell.parser.screen_mut().set_scrollback(0);
                let bracketed = shell.parser.screen().bracketed_paste();
                vec![Action::Write {
                    session: id,
                    bytes: encode_paste(text, bracketed),
                }]
            }
            _ => Vec::new(),
        }
    }

    /// Scrolls a shell's history by `lines` (positive is up). A full-screen
    /// program has no history, so there the wheel becomes arrow keys, which
    /// is what it would do in a terminal that did not capture the mouse.
    fn scroll(&mut self, id: u32, lines: i32) -> Vec<Action> {
        let Some(shell) = self.shells.get_mut(&id) else {
            return Vec::new();
        };
        let screen = shell.parser.screen_mut();
        if screen.alternate_screen() {
            let code = if lines > 0 {
                KeyCode::Up
            } else {
                KeyCode::Down
            };
            let application_cursor = screen.application_cursor();
            let key = KeyEvent::new(code, KeyModifiers::NONE);
            let one = encode_key(key, application_cursor).unwrap_or_default();
            let count = (lines.unsigned_abs() as usize).min(WHEEL_LINES);
            return vec![Action::Write {
                session: id,
                bytes: one.repeat(count),
            }];
        }
        let current = screen.scrollback();
        screen.set_scrollback((current as i64 + i64::from(lines)).max(0) as usize);
        Vec::new()
    }

    fn command_key(&mut self, key: KeyEvent) -> Vec<Action> {
        if is_prefix(&key) {
            return match self.visible() {
                Some(session) => vec![Action::Write {
                    session,
                    bytes: vec![0x07],
                }],
                None => Vec::new(),
            };
        }
        match key.code {
            KeyCode::Esc => Vec::new(),
            KeyCode::Down => self.move_cursor(1),
            KeyCode::Up => self.move_cursor(-1),
            KeyCode::PageUp => match self.visible() {
                Some(id) => self.scroll(id, page(self.pane().1)),
                None => Vec::new(),
            },
            KeyCode::PageDown => match self.visible() {
                Some(id) => self.scroll(id, -page(self.pane().1)),
                None => Vec::new(),
            },
            KeyCode::Char(c) => self.command_char(c),
            _ => Vec::new(),
        }
    }

    fn command_char(&mut self, c: char) -> Vec<Action> {
        match c {
            'c' => match self.active {
                Some(group) => vec![self.spawn_for(group)],
                None if self.projects.is_empty() => self.say("Create a project first: Ctrl+G P"),
                None => self.say("Create a workspace first: Ctrl+G w"),
            },
            'x' => match self.visible() {
                Some(session) => vec![Action::Close { session }],
                None => Vec::new(),
            },
            'n' => self.cycle_tab(1),
            'p' => self.cycle_tab(-1),
            'j' => self.move_cursor(1),
            'k' => self.move_cursor(-1),
            'a' => {
                self.toggle_view();
                Vec::new()
            }
            'b' => {
                self.sidebar = !self.sidebar;
                Vec::new()
            }
            'P' => {
                self.mode = Mode::Prompt(Prompt {
                    kind: PromptKind::NewProject,
                    title: "New project".to_string(),
                    fields: vec![
                        Field {
                            label: "Name".to_string(),
                            value: String::new(),
                        },
                        Field {
                            label: "Folder".to_string(),
                            value: self.cwd.clone(),
                        },
                    ],
                    focus: 0,
                });
                Vec::new()
            }
            'w' => match self.project_of_cursor() {
                Some(project) => {
                    self.mode = Mode::Prompt(Prompt {
                        kind: PromptKind::NewWorkspace { project },
                        title: "New workspace".to_string(),
                        fields: vec![Field {
                            label: "Name".to_string(),
                            value: String::new(),
                        }],
                        focus: 0,
                    });
                    Vec::new()
                }
                None => self.say("Select a project or one of its workspaces first"),
            },
            'r' => self.rename_selected(),
            'R' => match self.visible() {
                Some(session) => self.rename_session_prompt(session),
                None => Vec::new(),
            },
            'd' => match self.cursor {
                Some(Cursor::Workspace(id)) => {
                    let name = self.workspace_name(id).unwrap_or_default().to_string();
                    self.mode = Mode::Confirm(Confirm {
                        text: format!("Delete workspace \"{name}\" and close its shells?"),
                        action: Action::DeleteWorkspace { workspace: id },
                    });
                    Vec::new()
                }
                _ => self.say("Select a workspace to delete"),
            },
            'q' => vec![Action::Quit],
            '?' => {
                self.mode = Mode::Help;
                Vec::new()
            }
            other => self.say(&format!("No command on \"{other}\"; ? lists them")),
        }
    }

    fn say(&mut self, text: &str) -> Vec<Action> {
        self.notice = Some(text.to_string());
        Vec::new()
    }

    fn toggle_view(&mut self) {
        self.view = match self.view {
            View::Workspaces => View::Agents,
            View::Agents => View::Workspaces,
        };
        let rows = self.rows();
        let visible = self.visible();
        let wanted = match self.view {
            View::Agents => visible.map(Cursor::Agent),
            View::Workspaces => self.active.map(|group| match group {
                Group::Workspace(id) => Cursor::Workspace(id),
                Group::Unassigned => Cursor::Unassigned,
            }),
        };
        self.cursor = wanted
            .filter(|cursor| rows.iter().any(|row| row.cursor == *cursor))
            .or_else(|| rows.first().map(|row| row.cursor));
    }

    fn cycle_tab(&mut self, delta: i32) -> Vec<Action> {
        let tabs = self.active_tabs();
        let Some(group) = self.active else {
            return Vec::new();
        };
        if tabs.is_empty() {
            return Vec::new();
        }
        let current = self
            .visible()
            .and_then(|id| tabs.iter().position(|t| *t == id))
            .unwrap_or(0);
        let next = (current as i32 + delta).rem_euclid(tabs.len() as i32) as usize;
        self.chosen.insert(group, tabs[next]);
        self.look()
    }

    fn rename_selected(&mut self) -> Vec<Action> {
        match self.cursor {
            Some(Cursor::Workspace(id)) => {
                let name = self.workspace_name(id).unwrap_or_default().to_string();
                self.mode = Mode::Prompt(Prompt {
                    kind: PromptKind::RenameWorkspace { workspace: id },
                    title: "Rename workspace".to_string(),
                    fields: vec![Field {
                        label: "Name".to_string(),
                        value: name,
                    }],
                    focus: 0,
                });
                Vec::new()
            }
            Some(Cursor::Project(id)) => {
                let name = self
                    .projects
                    .iter()
                    .find(|project| project.id == id)
                    .map(|project| project.name.clone())
                    .unwrap_or_default();
                self.mode = Mode::Prompt(Prompt {
                    kind: PromptKind::RenameProject { project: id },
                    title: "Rename project".to_string(),
                    fields: vec![Field {
                        label: "Name".to_string(),
                        value: name,
                    }],
                    focus: 0,
                });
                Vec::new()
            }
            Some(Cursor::Agent(session)) => self.rename_session_prompt(session),
            _ => self.say("Select a workspace, project or agent to rename"),
        }
    }

    fn rename_session_prompt(&mut self, session: u32) -> Vec<Action> {
        let name = self
            .shells
            .get(&session)
            .and_then(|shell| shell.name.clone())
            .unwrap_or_default();
        self.mode = Mode::Prompt(Prompt {
            kind: PromptKind::RenameSession { session },
            title: "Rename tab".to_string(),
            fields: vec![Field {
                label: "Name".to_string(),
                value: name,
            }],
            focus: 0,
        });
        Vec::new()
    }

    fn prompt_key(&mut self, mut prompt: Prompt, key: KeyEvent) -> Vec<Action> {
        let last = prompt.fields.len() - 1;
        match key.code {
            KeyCode::Esc => {
                self.mode = Mode::Terminal;
                return Vec::new();
            }
            KeyCode::Enter if prompt.focus < last => prompt.focus += 1,
            KeyCode::Enter => return self.submit(prompt),
            KeyCode::Tab | KeyCode::Down => prompt.focus = (prompt.focus + 1) % prompt.fields.len(),
            KeyCode::BackTab | KeyCode::Up => {
                prompt.focus = (prompt.focus + prompt.fields.len() - 1) % prompt.fields.len()
            }
            KeyCode::Backspace => {
                prompt.fields[prompt.focus].value.pop();
            }
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                prompt.fields[prompt.focus].value.clear();
            }
            KeyCode::Char(c) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                prompt.fields[prompt.focus].value.push(c);
            }
            _ => {}
        }
        self.mode = Mode::Prompt(prompt);
        Vec::new()
    }

    fn submit(&mut self, prompt: Prompt) -> Vec<Action> {
        let name = prompt.fields[0].value.trim().to_string();
        if name.is_empty() {
            self.mode = Mode::Prompt(prompt);
            return self.say("A name is required");
        }
        self.mode = Mode::Terminal;
        match prompt.kind {
            PromptKind::NewProject => {
                let folder = prompt.fields[1].value.trim();
                let path = if folder.is_empty() {
                    self.cwd.clone()
                } else if folder.starts_with('/') {
                    folder.to_string()
                } else {
                    format!("{}/{}", self.cwd.trim_end_matches('/'), folder)
                };
                vec![Action::CreateProject { name, path }]
            }
            PromptKind::NewWorkspace { project } => vec![Action::CreateWorkspace { project, name }],
            PromptKind::RenameProject { project } => vec![Action::RenameProject { project, name }],
            PromptKind::RenameWorkspace { workspace } => {
                vec![Action::RenameWorkspace { workspace, name }]
            }
            PromptKind::RenameSession { session } => vec![Action::RenameSession { session, name }],
        }
    }

    // ---- mouse -------------------------------------------------------------------

    pub fn on_mouse(&mut self, event: MouseEvent) -> Vec<Action> {
        if !matches!(self.mode, Mode::Terminal | Mode::Command) {
            return Vec::new();
        }
        let l = layout(self.area, self.sidebar);
        let at = ratatui::layout::Position::new(event.column, event.row);
        match event.kind {
            MouseEventKind::Down(MouseButton::Left) => {
                self.mode = Mode::Terminal;
                if l.sidebar.contains(at) {
                    return self.click_sidebar(l.sidebar, event.column, event.row);
                }
                if l.tabs.contains(at) {
                    let texts = self.tab_texts();
                    let spans = tab_spans(&texts, self.visible(), l.tabs.x, l.tabs.width);
                    if let Some(span) = spans
                        .iter()
                        .find(|s| event.column >= s.x && event.column < s.x + s.width)
                    {
                        return self.select_session(span.session);
                    }
                }
                Vec::new()
            }
            MouseEventKind::ScrollUp | MouseEventKind::ScrollDown if l.term.contains(at) => {
                let lines = if event.kind == MouseEventKind::ScrollUp {
                    WHEEL_LINES as i32
                } else {
                    -(WHEEL_LINES as i32)
                };
                match self.visible() {
                    Some(id) => self.scroll(id, lines),
                    None => Vec::new(),
                }
            }
            _ => Vec::new(),
        }
    }

    fn click_sidebar(&mut self, sidebar: Rect, column: u16, row: u16) -> Vec<Action> {
        // The first line names the two views and is itself the switch.
        if row == sidebar.y {
            let wanted = if column < sidebar.x + HEADER_SPLIT {
                View::Workspaces
            } else {
                View::Agents
            };
            if wanted != self.view {
                self.toggle_view();
            }
            return Vec::new();
        }
        let rows = self.rows();
        let height = usize::from(sidebar.height.saturating_sub(1));
        let start = list_window(rows.len(), self.cursor_index(&rows), height);
        let index = start + usize::from(row - sidebar.y - 1);
        match rows.get(index) {
            Some(clicked) => {
                self.cursor = Some(clicked.cursor);
                self.activate(clicked.cursor)
            }
            None => Vec::new(),
        }
    }

    /// Whether the visible shell is scrolled back, and how far.
    pub fn scrollback(&self) -> usize {
        self.visible()
            .and_then(|id| self.shells.get(&id))
            .map_or(0, |shell| shell.parser.screen().scrollback())
    }
}

/// Column in the sidebar where the Agents label starts, so a click on either
/// label can pick its view.
pub const HEADER_SPLIT: u16 = 14;

fn page(rows: u16) -> i32 {
    i32::from(rows.saturating_sub(1).max(1))
}

/// The glyph and style that mark a status. Idle is deliberately plain so
/// the marks that do appear mean something.
pub fn mark(status: WorkspaceStatus) -> (&'static str, ratatui::style::Style) {
    use ratatui::style::{Color, Modifier, Style};
    match status {
        WorkspaceStatus::Idle => ("·", Style::default()),
        WorkspaceStatus::Running => ("●", Style::default().fg(Color::Cyan)),
        WorkspaceStatus::NeedsAttention => (
            "▲",
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        WorkspaceStatus::Completed => ("✓", Style::default().fg(Color::Green)),
        WorkspaceStatus::Failed => ("✗", Style::default().fg(Color::Red)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use akbun_terminal_core::tree::Workspace;

    fn tree(projects: &[(u64, &str, &[(u64, &str)])]) -> TreeState {
        TreeState {
            projects: projects
                .iter()
                .map(|(id, name, workspaces)| Project {
                    id: *id,
                    name: name.to_string(),
                    path: Some(format!("/work/{name}")),
                    workspaces: workspaces
                        .iter()
                        .map(|(id, name)| Workspace {
                            id: *id,
                            name: name.to_string(),
                            status: WorkspaceStatus::Idle,
                        })
                        .collect(),
                })
                .collect(),
            ..TreeState::default()
        }
    }

    fn info(session: u32, workspace: Option<u64>) -> SessionInfo {
        SessionInfo {
            session,
            name: None,
            parent: None,
            workspace,
            cwd: "/".to_string(),
            cols: 80,
            rows: 24,
            agent: None,
            status: WorkspaceStatus::Idle,
        }
    }

    fn agent(session: u32, workspace: Option<u64>, parent: Option<u32>, name: &str) -> SessionInfo {
        SessionInfo {
            parent,
            agent: Some("Claude Code".to_string()),
            name: Some(name.to_string()),
            ..info(session, workspace)
        }
    }

    fn state_with(infos: &[SessionInfo]) -> State {
        let mut state = State::new("/home/me");
        state.set_tree(tree(&[
            (1, "site", &[(2, "main"), (3, "dev")]),
            (4, "api", &[(5, "main")]),
        ]));
        for info in infos {
            state.add_session(info, 80, 24, &[]);
        }
        state.init_selection();
        state
    }

    fn press(state: &mut State, code: KeyCode) -> Vec<Action> {
        state.on_key(KeyEvent::new(code, KeyModifiers::NONE))
    }

    fn command(state: &mut State, c: char) -> Vec<Action> {
        state.on_key(KeyEvent::new(KeyCode::Char('g'), KeyModifiers::CONTROL));
        press(state, KeyCode::Char(c))
    }

    #[test]
    fn shells_group_into_tabs_by_workspace_and_strays_go_unassigned() {
        let state = state_with(&[
            info(1, Some(2)),
            info(2, Some(3)),
            info(3, Some(2)),
            info(4, None),
            info(5, Some(99)),
        ]);
        assert_eq!(state.tabs(Group::Workspace(2)), vec![1, 3]);
        assert_eq!(state.tabs(Group::Workspace(3)), vec![2]);
        assert_eq!(state.tabs(Group::Unassigned), vec![4, 5]);
        let labels: Vec<String> = state.rows().iter().map(|row| row.label.clone()).collect();
        assert_eq!(labels, ["site", "main", "dev", "api", "main", UNASSIGNED]);
    }

    #[test]
    fn the_unassigned_group_is_last_and_only_there_when_it_has_shells() {
        let state = state_with(&[info(1, Some(2))]);
        assert!(state
            .rows()
            .iter()
            .all(|row| row.cursor != Cursor::Unassigned));
    }

    #[test]
    fn startup_selects_the_group_of_the_oldest_shell() {
        let state = state_with(&[info(7, Some(5)), info(8, Some(2))]);
        assert_eq!(state.active, Some(Group::Workspace(5)));
        assert_eq!(state.visible(), Some(7));
        assert_eq!(state.cursor, Some(Cursor::Workspace(5)));
    }

    #[test]
    fn a_workspace_without_shells_asks_for_one_only_once_the_selection_settles() {
        let mut state = state_with(&[info(1, Some(2))]);
        command(&mut state, 'j');
        assert_eq!(state.active, Some(Group::Workspace(3)));
        command(&mut state, 'j');
        command(&mut state, 'j');
        assert_eq!(state.active, Some(Group::Workspace(5)));
        let spawn = state.take_spawn();
        assert_eq!(
            spawn,
            Some(Action::Spawn {
                cwd: "/work/api".to_string(),
                workspace: Some(5)
            })
        );
        assert_eq!(state.take_spawn(), None);
    }

    #[test]
    fn moving_off_an_empty_workspace_withdraws_the_request() {
        let mut state = state_with(&[info(1, Some(2))]);
        command(&mut state, 'j');
        assert!(state.pending_spawn.is_some());
        command(&mut state, 'k');
        assert_eq!(state.pending_spawn, None);
    }

    #[test]
    fn an_exited_shell_hands_the_tab_to_its_neighbour() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2)), info(3, Some(2))]);
        state.select_session(2);
        state.exited(2);
        assert_eq!(state.tabs(Group::Workspace(2)), vec![1, 3]);
        assert_eq!(state.visible(), Some(3));
        state.exited(3);
        assert_eq!(state.visible(), Some(1));
        state.exited(1);
        assert_eq!(state.visible(), None);
        assert_eq!(state.active, Some(Group::Workspace(2)));
    }

    #[test]
    fn an_exit_in_another_workspace_leaves_the_selection_alone() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(3))]);
        state.exited(2);
        assert_eq!(state.visible(), Some(1));
        assert_eq!(state.active, Some(Group::Workspace(2)));
    }

    #[test]
    fn the_last_unassigned_shell_leaving_moves_the_selection_to_a_workspace() {
        let mut state = state_with(&[info(1, None)]);
        assert_eq!(state.active, Some(Group::Unassigned));
        state.exited(1);
        assert_eq!(state.active, Some(Group::Workspace(2)));
    }

    #[test]
    fn deleting_the_selected_workspace_selects_its_next_neighbour_else_the_previous() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(3))]);
        state.select_session(1);
        state.set_tree(tree(&[
            (1, "site", &[(3, "dev")]),
            (4, "api", &[(5, "main")]),
        ]));
        assert_eq!(state.active, Some(Group::Workspace(3)));
        assert_eq!(state.cursor, Some(Cursor::Workspace(3)));
        // The shell that lived in the deleted workspace is now unassigned.
        assert_eq!(state.tabs(Group::Unassigned), vec![1]);
        state.set_tree(tree(&[(1, "site", &[(3, "dev")])]));
        state.set_tree(tree(&[(1, "site", &[])]));
        assert_eq!(state.active, Some(Group::Unassigned));
    }

    #[test]
    fn deleting_the_last_workspace_of_the_list_selects_the_one_before() {
        let mut state = state_with(&[info(1, Some(5))]);
        state.set_tree(tree(&[
            (1, "site", &[(2, "main"), (3, "dev")]),
            (4, "api", &[]),
        ]));
        assert_eq!(state.active, Some(Group::Workspace(3)));
    }

    #[test]
    fn agents_are_listed_flat_with_children_under_their_parent() {
        let mut shell = info(1, Some(2));
        shell.agent = None;
        let state = state_with(&[
            shell,
            agent(4, Some(5), None, "reviewer"),
            agent(2, Some(2), None, "planner"),
            agent(6, Some(2), Some(2), "helper"),
            agent(3, Some(2), Some(6), "grandchild"),
            agent(7, Some(2), Some(1), "orphan"),
        ]);
        let mut state = state;
        command(&mut state, 'a');
        assert_eq!(state.view, View::Agents);
        let rows = state.rows();
        let shown: Vec<(u16, &str, &str)> = rows
            .iter()
            .map(|row| (row.depth, row.label.as_str(), row.detail.as_str()))
            .collect();
        assert_eq!(
            shown,
            [
                (0, "planner", "main"),
                (1, "helper", "main"),
                (2, "grandchild", "main"),
                (0, "reviewer", "main"),
                (0, "orphan", "main"),
            ]
        );
    }

    #[test]
    fn choosing_an_agent_goes_to_its_tab_in_its_workspace() {
        let mut state = state_with(&[
            info(1, Some(2)),
            agent(2, Some(3), None, "helper"),
            info(3, Some(3)),
        ]);
        assert_eq!(state.active, Some(Group::Workspace(2)));
        command(&mut state, 'a');
        assert_eq!(state.rows().len(), 1);
        // The cursor starts on the shell showing, which is not an agent, so
        // the first row is reached by moving onto it.
        command(&mut state, 'j');
        assert_eq!(state.active, Some(Group::Workspace(3)));
        assert_eq!(state.visible(), Some(2));
    }

    #[test]
    fn an_agent_without_a_name_is_listed_under_its_agent_name() {
        let mut named = agent(1, Some(2), None, "x");
        named.name = None;
        let mut state = state_with(&[named]);
        command(&mut state, 'a');
        assert_eq!(state.rows()[0].label, "Claude Code");
    }

    #[test]
    fn reconcile_reports_new_shells_updates_old_ones_and_drops_the_gone() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2))]);
        let mut changed = info(1, Some(2));
        changed.status = WorkspaceStatus::Running;
        changed.name = Some("build".to_string());
        let result = state.reconcile(&[changed, info(9, Some(3))]);
        assert_eq!(result.attach, vec![9]);
        assert_eq!(state.tabs(Group::Workspace(2)), vec![1]);
        assert_eq!(state.shell(1).unwrap().status, WorkspaceStatus::Running);
        assert_eq!(state.tab_label(1), "build");
        assert_eq!(
            state.group_status(Group::Workspace(2)),
            WorkspaceStatus::Running
        );
    }

    #[test]
    fn a_workspace_shows_its_most_blocked_shell() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2)), info(3, Some(2))]);
        let mut running = info(1, Some(2));
        running.status = WorkspaceStatus::Running;
        let mut asking = info(2, Some(2));
        asking.status = WorkspaceStatus::NeedsAttention;
        let mut done = info(3, Some(2));
        done.status = WorkspaceStatus::Completed;
        state.reconcile(&[running, asking, done]);
        assert_eq!(
            state.group_status(Group::Workspace(2)),
            WorkspaceStatus::NeedsAttention
        );
    }

    #[test]
    fn selecting_a_completed_tab_clears_its_status_once() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2))]);
        let mut done = info(2, Some(2));
        done.status = WorkspaceStatus::Completed;
        state.reconcile(&[info(1, Some(2)), done]);
        let actions = command(&mut state, 'n');
        assert_eq!(
            actions,
            vec![Action::ClearStatus {
                workspace: 2,
                session: 2
            }]
        );
        assert_eq!(state.shell(2).unwrap().status, WorkspaceStatus::Idle);
        assert!(command(&mut state, 'p').is_empty());
        assert!(command(&mut state, 'n').is_empty());
    }

    #[test]
    fn output_is_drawn_after_the_replay() {
        let mut state = State::new("/");
        state.set_tree(tree(&[(1, "p", &[(2, "w")])]));
        state.add_session(
            &info(1, Some(2)),
            20,
            3,
            &[b"old ".to_vec(), b"line\r\n".to_vec()],
        );
        state.output(1, b"live");
        let text = state.shell(1).unwrap().parser.screen().contents();
        assert_eq!(text, "old line\nlive");
    }

    #[test]
    fn typing_goes_to_the_visible_shell_and_the_prefix_does_not() {
        let mut state = state_with(&[info(1, Some(2))]);
        assert_eq!(
            press(&mut state, KeyCode::Char('x')),
            vec![Action::Write {
                session: 1,
                bytes: b"x".to_vec()
            }]
        );
        assert!(state
            .on_key(KeyEvent::new(KeyCode::Char('g'), KeyModifiers::CONTROL))
            .is_empty());
        assert_eq!(state.mode, Mode::Command);
        // A second prefix sends the literal Ctrl+G and leaves command mode.
        let actions = state.on_key(KeyEvent::new(KeyCode::Char('g'), KeyModifiers::CONTROL));
        assert_eq!(
            actions,
            vec![Action::Write {
                session: 1,
                bytes: vec![7]
            }]
        );
        assert_eq!(state.mode, Mode::Terminal);
    }

    #[test]
    fn command_mode_takes_exactly_one_key() {
        let mut state = state_with(&[info(1, Some(2))]);
        command(&mut state, 'b');
        assert!(!state.sidebar);
        assert_eq!(state.mode, Mode::Terminal);
        assert_eq!(press(&mut state, KeyCode::Char('b')).len(), 1);
        assert!(!state.sidebar);
    }

    #[test]
    fn new_close_and_quit_commands() {
        let mut state = state_with(&[info(1, Some(2))]);
        assert_eq!(
            command(&mut state, 'c'),
            vec![Action::Spawn {
                cwd: "/work/site".to_string(),
                workspace: Some(2)
            }]
        );
        assert_eq!(command(&mut state, 'x'), vec![Action::Close { session: 1 }]);
        assert_eq!(command(&mut state, 'q'), vec![Action::Quit]);
    }

    #[test]
    fn tabs_cycle_both_ways_and_wrap() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2)), info(3, Some(2))]);
        command(&mut state, 'p');
        assert_eq!(state.visible(), Some(3));
        command(&mut state, 'n');
        assert_eq!(state.visible(), Some(1));
        command(&mut state, 'n');
        assert_eq!(state.visible(), Some(2));
    }

    #[test]
    fn a_new_project_prompt_defaults_the_folder_to_the_working_directory() {
        let mut state = state_with(&[]);
        command(&mut state, 'P');
        let Mode::Prompt(prompt) = &state.mode else {
            panic!("no prompt")
        };
        assert_eq!(prompt.fields[1].value, "/home/me");
        for c in "docs".chars() {
            press(&mut state, KeyCode::Char(c));
        }
        press(&mut state, KeyCode::Enter);
        let actions = press(&mut state, KeyCode::Enter);
        assert_eq!(
            actions,
            vec![Action::CreateProject {
                name: "docs".to_string(),
                path: "/home/me".to_string()
            }]
        );
        assert_eq!(state.mode, Mode::Terminal);
    }

    #[test]
    fn a_relative_folder_is_taken_from_the_working_directory() {
        let mut state = state_with(&[]);
        command(&mut state, 'P');
        press(&mut state, KeyCode::Char('x'));
        press(&mut state, KeyCode::Tab);
        for _ in 0..8 {
            press(&mut state, KeyCode::Backspace);
        }
        for c in "sub".chars() {
            press(&mut state, KeyCode::Char(c));
        }
        let actions = press(&mut state, KeyCode::Enter);
        assert_eq!(
            actions,
            vec![Action::CreateProject {
                name: "x".to_string(),
                path: "/home/me/sub".to_string()
            }]
        );
    }

    #[test]
    fn an_empty_name_keeps_the_prompt_open() {
        let mut state = State::new("/home/me");
        command(&mut state, 'w');
        assert_eq!(state.mode, Mode::Terminal);
        assert!(state.notice.is_some());
        command(&mut state, 'P');
        press(&mut state, KeyCode::Enter);
        assert!(press(&mut state, KeyCode::Enter).is_empty());
        assert!(matches!(state.mode, Mode::Prompt(_)));
        assert_eq!(state.notice.as_deref(), Some("A name is required"));
        press(&mut state, KeyCode::Esc);
        assert_eq!(state.mode, Mode::Terminal);
    }

    #[test]
    fn a_new_workspace_belongs_to_the_project_under_the_cursor() {
        let mut state = state_with(&[info(1, Some(5))]);
        command(&mut state, 'w');
        for c in "feat".chars() {
            press(&mut state, KeyCode::Char(c));
        }
        let actions = press(&mut state, KeyCode::Enter);
        assert_eq!(
            actions,
            vec![Action::CreateWorkspace {
                project: 4,
                name: "feat".to_string()
            }]
        );
    }

    #[test]
    fn a_created_workspace_is_selected_and_gets_a_shell() {
        let mut state = state_with(&[info(1, Some(2))]);
        state.set_tree_selecting_new(tree(&[
            (1, "site", &[(2, "main"), (3, "dev")]),
            (4, "api", &[(5, "main")]),
            (6, "new", &[]),
        ]));
        assert_eq!(state.cursor, Some(Cursor::Project(6)));
        state.set_tree_selecting_new(tree(&[
            (1, "site", &[(2, "main"), (3, "dev")]),
            (4, "api", &[(5, "main")]),
            (6, "new", &[(7, "first")]),
        ]));
        assert_eq!(state.active, Some(Group::Workspace(7)));
        assert_eq!(
            state.take_spawn(),
            Some(Action::Spawn {
                cwd: "/work/new".to_string(),
                workspace: Some(7)
            })
        );
    }

    #[test]
    fn deleting_asks_first_and_only_the_yes_key_goes_through() {
        let mut state = state_with(&[info(1, Some(2))]);
        command(&mut state, 'd');
        assert!(matches!(state.mode, Mode::Confirm(_)));
        assert!(press(&mut state, KeyCode::Char('n')).is_empty());
        assert_eq!(state.mode, Mode::Terminal);
        command(&mut state, 'd');
        assert_eq!(
            press(&mut state, KeyCode::Char('y')),
            vec![Action::DeleteWorkspace { workspace: 2 }]
        );
    }

    #[test]
    fn rename_follows_what_the_cursor_is_on() {
        let mut state = state_with(&[agent(1, Some(2), None, "helper")]);
        command(&mut state, 'r');
        let Mode::Prompt(prompt) = &state.mode else {
            panic!("no prompt")
        };
        assert_eq!(prompt.kind, PromptKind::RenameWorkspace { workspace: 2 });
        assert_eq!(prompt.fields[0].value, "main");
        press(&mut state, KeyCode::Esc);
        command(&mut state, 'R');
        let Mode::Prompt(prompt) = &state.mode else {
            panic!("no prompt")
        };
        assert_eq!(prompt.kind, PromptKind::RenameSession { session: 1 });
        assert_eq!(prompt.fields[0].value, "helper");
    }

    #[test]
    fn the_wheel_scrolls_history_and_typing_returns_to_the_bottom() {
        let mut state = state_with(&[]);
        state.add_session(&info(1, Some(2)), 20, 3, &[]);
        state.init_selection();
        let lines: String = (0..30).map(|i| format!("line {i}\r\n")).collect();
        state.output(1, lines.as_bytes());
        let l = layout(state.area, true);
        let wheel = MouseEvent {
            kind: MouseEventKind::ScrollUp,
            column: l.term.x + 1,
            row: l.term.y + 1,
            modifiers: KeyModifiers::NONE,
        };
        state.on_mouse(wheel);
        assert_eq!(state.scrollback(), 3);
        press(&mut state, KeyCode::Char('a'));
        assert_eq!(state.scrollback(), 0);
    }

    #[test]
    fn the_wheel_in_a_full_screen_program_sends_arrows() {
        let mut state = state_with(&[info(1, Some(2))]);
        state.output(1, b"\x1b[?1049h");
        let l = layout(state.area, true);
        let wheel = MouseEvent {
            kind: MouseEventKind::ScrollUp,
            column: l.term.x + 1,
            row: l.term.y + 1,
            modifiers: KeyModifiers::NONE,
        };
        assert_eq!(
            state.on_mouse(wheel),
            vec![Action::Write {
                session: 1,
                bytes: b"\x1b[A\x1b[A\x1b[A".to_vec()
            }]
        );
    }

    #[test]
    fn clicking_a_sidebar_row_or_a_tab_selects_it() {
        let mut state = state_with(&[info(1, Some(2)), info(2, Some(2)), info(3, Some(3))]);
        let l = layout(state.area, true);
        let click = |column, row| MouseEvent {
            kind: MouseEventKind::Down(MouseButton::Left),
            column,
            row,
            modifiers: KeyModifiers::NONE,
        };
        // Row 0 is the header, then site, main, dev.
        state.on_mouse(click(l.sidebar.x + 3, l.sidebar.y + 3));
        assert_eq!(state.active, Some(Group::Workspace(3)));
        assert_eq!(state.cursor, Some(Cursor::Workspace(3)));
        state.on_mouse(click(l.sidebar.x + 3, l.sidebar.y + 2));
        assert_eq!(state.visible(), Some(1));
        let second =
            tab_spans(&state.tab_texts(), state.visible(), l.tabs.x, l.tabs.width)[1].clone();
        state.on_mouse(click(second.x + 1, l.tabs.y));
        assert_eq!(state.visible(), Some(2));
        // The header switches views.
        state.on_mouse(click(l.sidebar.x + HEADER_SPLIT + 1, l.sidebar.y));
        assert_eq!(state.view, View::Agents);
    }

    #[test]
    fn the_visible_shell_is_resized_to_the_pane_once() {
        let mut state = state_with(&[info(1, Some(2))]);
        state.set_area(Rect::new(0, 0, 100, 30));
        let first = state.sync_size();
        assert_eq!(
            first,
            vec![Action::Resize {
                session: 1,
                cols: 72,
                rows: 28
            }]
        );
        assert_eq!(state.shell(1).unwrap().parser.screen().size().1.get(), 72);
        assert!(state.sync_size().is_empty());
        command(&mut state, 'b');
        assert_eq!(
            state.sync_size(),
            vec![Action::Resize {
                session: 1,
                cols: 100,
                rows: 28
            }]
        );
    }

    #[test]
    fn pasting_follows_the_programs_bracketed_paste_mode() {
        let mut state = state_with(&[info(1, Some(2))]);
        assert_eq!(
            state.on_paste("a\nb"),
            vec![Action::Write {
                session: 1,
                bytes: b"a\rb".to_vec()
            }]
        );
        state.output(1, b"\x1b[?2004h");
        assert_eq!(
            state.on_paste("a"),
            vec![Action::Write {
                session: 1,
                bytes: b"\x1b[200~a\x1b[201~".to_vec()
            }]
        );
    }
}
