//! The one object the shell holds, and the only place commands are interpreted.
//!
//! Everything here is reachable from the protocol alone. There is no AppKit type
//! in this crate and no callback into the shell: events queue up and the shell
//! drains them when it is ready to touch the screen. That keeps the question of
//! which thread may draw entirely on the shell's side.

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;

use crate::agent::Rule;
use crate::protocol::{
    parse_request, Command, Event, Response, SessionState, WorkspaceState, PROTOCOL_VERSION,
};
use crate::search::Index;
use crate::session::Session;
use crate::tree::{TreeStore, WorkspaceStatus};

/// What the last detection tick decided, per shell and per workspace.
///
/// Both halves are kept because both are answers somebody already has on
/// screen: the shell's own status is what the tab strip draws, and the rollup is
/// what the sidebar draws. Keeping the rollup rather than recomputing it is what
/// lets a tick report only what moved.
#[derive(Default)]
struct Judged {
    sessions: HashMap<u32, WorkspaceStatus>,
    workspaces: HashMap<u64, WorkspaceStatus>,
}

impl Judged {
    /// Takes the finished colour off what was looked at.
    ///
    /// A named session clears that tab alone and then re-rolls the workspace, so
    /// a workspace whose other tab is still finished stays green. Without a
    /// session the whole workspace is cleared, which is what happens when it is
    /// closed rather than read.
    ///
    /// `members` is passed in rather than looked up, so that this never takes
    /// the sessions lock while holding the statuses one. `detect` takes them the
    /// other way round, and the two orders together are a deadlock waiting for
    /// the day something calls the core from a second thread.
    fn clear(&mut self, workspace: u64, session: Option<u32>, members: &[u32]) {
        let cleared: Vec<u32> = match session {
            Some(one) if members.contains(&one) => vec![one],
            Some(_) => return,
            None => members.to_vec(),
        };
        for id in cleared {
            if self.sessions.get(&id) == Some(&WorkspaceStatus::Completed) {
                self.sessions.insert(id, WorkspaceStatus::Idle);
            }
        }
        let rolled = crate::agent::roll_up(
            &members
                .iter()
                .map(|id| {
                    self.sessions
                        .get(id)
                        .copied()
                        .unwrap_or(WorkspaceStatus::Idle)
                })
                .collect::<Vec<_>>(),
        );
        self.workspaces.insert(workspace, rolled);
    }

    fn retain(&mut self, alive: &HashSet<u64>) {
        self.workspaces.retain(|workspace, _| alive.contains(workspace));
    }
}

pub struct App {
    sessions: Mutex<HashMap<u32, Session>>,
    next_session: Mutex<u32>,
    sender: Sender<Event>,
    receiver: Mutex<Receiver<Event>>,
    tree: Mutex<TreeStore>,
    rules: Mutex<Vec<Rule>>,
    /// The last judgement, per shell and rolled up per workspace. Finished is a
    /// transition rather than something on screen, so the previous answer is
    /// part of the next one.
    statuses: Mutex<Judged>,
    /// The files under the project the palette last searched. Kept because a
    /// palette walks the same tree on every keystroke otherwise, and a project
    /// is thousands of files.
    index: Mutex<Option<Index>>,
}

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

impl App {
    pub fn new() -> Self {
        let (sender, receiver) = channel();
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_session: Mutex::new(1),
            sender,
            receiver: Mutex::new(receiver),
            tree: Mutex::new(TreeStore::default()),
            rules: Mutex::new(Vec::new()),
            statuses: Mutex::new(Judged::default()),
            index: Mutex::new(None),
        }
    }

    /// JSON in, JSON out. The reply is always a `Response`, including for a
    /// request this build cannot read, so the shell has one shape to decode.
    pub fn dispatch(&self, json: &str) -> String {
        let response = match parse_request(json) {
            Ok(command) => self.run(command),
            Err(message) => Response::Error { message },
        };
        serde_json::to_string(&response).unwrap_or_else(|error| {
            format!(r#"{{"type":"error","message":"failed to encode response: {error}"}}"#)
        })
    }

    /// The next queued event as JSON, or `None` when there is nothing waiting.
    /// Draining beats a callback here: the shell already has a run loop, and a
    /// callback would arrive on a reader thread with a screen to update.
    pub fn poll_event(&self) -> Option<String> {
        let event = self.receiver.lock().ok()?.try_recv().ok()?;
        serde_json::to_string(&event).ok()
    }

    fn run(&self, command: Command) -> Response {
        match command {
            Command::Hello => Response::Hello {
                protocol: PROTOCOL_VERSION,
            },
            Command::Spawn {
                cwd,
                cols,
                rows,
                workspace,
            } => self.spawn(workspace, &cwd, cols, rows),
            Command::Write { session, bytes } => {
                self.with_session(session, |session| session.write(&bytes))
            }
            Command::Resize {
                session,
                cols,
                rows,
            } => self.with_session(session, |session| session.resize(cols, rows)),
            Command::Close { session } => self.close(session),
            Command::LoadState { directory } => self.with_tree(|tree| tree.load(&directory)),
            Command::CreateProject { name, path } => {
                self.with_tree(|tree| tree.create_project(name, path))
            }
            Command::CreateWorkspace { project, name } => {
                self.with_tree(|tree| tree.create_workspace(project, name))
            }
            Command::RenameProject { project, name } => {
                self.with_tree(|tree| tree.rename_project(project, name))
            }
            Command::DeleteProject { project } => {
                let response = self.with_tree(|tree| tree.delete_project(project));
                self.forget_statuses_outside(&response);
                response
            }
            Command::RenameWorkspace { workspace, name } => {
                self.with_tree(|tree| tree.rename_workspace(workspace, name))
            }
            Command::DeleteWorkspace { workspace } => {
                let response = self.with_tree(|tree| tree.delete_workspace(workspace));
                self.forget_statuses_outside(&response);
                response
            }
            Command::SetTheme { name } => self.with_tree(|tree| tree.set_theme(name)),
            Command::ReadDirectory { path } => match crate::browse::read_directory(&path) {
                Ok(entries) => Response::Entries { entries },
                Err(message) => Response::Error { message },
            },
            Command::GitStatus { path } => Response::Git {
                status: crate::git::status(&path),
            },
            Command::GitLog { path } => Response::GitLog {
                log: crate::git::log(&path),
            },
            Command::ReadFile { path } => match crate::browse::read_file(&path) {
                Ok(text) => Response::File { text },
                Err(message) => Response::Error { message },
            },
            Command::WriteFile { path, text } => match crate::browse::write_file(&path, &text) {
                Ok(()) => Response::Ok,
                Err(message) => Response::Error { message },
            },
            Command::Themes => Response::Themes {
                themes: crate::theme::all(),
            },
            Command::Shortcuts => match self.tree.lock() {
                Ok(tree) => Response::Shortcuts {
                    shortcuts: tree.shortcuts(),
                },
                Err(_) => Response::Error {
                    message: "project state is poisoned".to_string(),
                },
            },
            Command::SetShortcut { command, key } => {
                self.with_tree(|tree| tree.set_shortcut(&command, &key))
            }
            Command::ResetShortcuts => self.with_tree(|tree| tree.reset_shortcuts()),
            Command::FindFiles { root, query, limit } => Response::Matches {
                matches: self.find_files(&root, &query, limit.unwrap_or(Self::MATCH_LIMIT)),
            },
            Command::SearchText { root, query, limit } => Response::Hits {
                hits: self.search_text(&root, &query, limit.unwrap_or(Self::HIT_LIMIT)),
            },
            Command::LoadRules { directory } => match crate::agent::load(&directory) {
                Ok(loaded) => match self.rules.lock() {
                    Ok(mut rules) => {
                        *rules = loaded;
                        Response::Ok
                    }
                    Err(_) => Response::Error {
                        message: "agent rules are poisoned".to_string(),
                    },
                },
                Err(message) => Response::Error { message },
            },
            Command::Detect => Response::Statuses {
                statuses: self.detect(),
            },
            Command::ClearStatus { workspace, session } => {
                // Sessions first, then statuses — the order `detect` uses.
                let members: Vec<u32> = match self.sessions.lock() {
                    Ok(open) => open
                        .values()
                        .filter(|shell| shell.workspace() == Some(workspace))
                        .map(|shell| shell.id())
                        .collect(),
                    Err(_) => Vec::new(),
                };
                if let Ok(mut statuses) = self.statuses.lock() {
                    statuses.clear(workspace, session, &members);
                }
                Response::Ok
            }
            Command::UrlAt { line, column } => Response::Url {
                url: crate::url::at(&line, column),
            },
        }
    }

    /// How many rows a palette shows before scrolling stops being reading.
    const MATCH_LIMIT: usize = 200;

    /// How long the walked file list is trusted. Long enough that typing does
    /// not walk the tree, short enough that a file the shell beside it just
    /// created turns up without a restart.
    const INDEX_AGE: Duration = Duration::from_secs(5);

    fn find_files(&self, root: &str, query: &str, limit: usize) -> Vec<crate::search::Match> {
        let Ok(mut index) = self.index.lock() else {
            return Vec::new();
        };
        let fresh = index
            .as_ref()
            .is_some_and(|built| built.is_fresh_for(root, Self::INDEX_AGE));
        if !fresh {
            *index = Some(Index::build(root));
        }
        index
            .as_ref()
            .map(|built| built.search(query, limit))
            .unwrap_or_default()
    }

    /// How many hits a search pane shows. Past this nobody scrolls, and the
    /// files not opened are what makes the search feel immediate.
    const HIT_LIMIT: usize = 400;

    /// The lines under `root` holding `query`. Shares the palette's walk, which
    /// is why this is here rather than in `grep`: the cached list is the App's.
    fn search_text(&self, root: &str, query: &str, limit: usize) -> Vec<crate::grep::Hit> {
        let Ok(mut index) = self.index.lock() else {
            return Vec::new();
        };
        let fresh = index
            .as_ref()
            .is_some_and(|built| built.is_fresh_for(root, Self::INDEX_AGE));
        if !fresh {
            *index = Some(Index::build(root));
        }
        index
            .as_ref()
            .map(|built| crate::grep::search(root, built.files(), query, limit))
            .unwrap_or_default()
    }

    /// Drops the judged status of every workspace the tree no longer has.
    ///
    /// The statuses are kept apart from the tree, because they describe what is
    /// happening now rather than what was saved. That means a deletion has to
    /// reach them separately, and reading the answer the tree just gave is the
    /// way to do it that cannot miss one: deleting a project takes its
    /// workspaces with it without ever naming them.
    fn forget_statuses_outside(&self, response: &Response) {
        let Response::State { state } = response else {
            return;
        };
        let Ok(mut statuses) = self.statuses.lock() else {
            return;
        };
        let alive: HashSet<u64> = state
            .projects
            .iter()
            .flat_map(|project| project.workspaces.iter())
            .map(|workspace| workspace.id)
            .collect();
        statuses.retain(&alive);
    }

    /// Judges every shell that has a workspace and answers with the workspaces
    /// that moved. One process snapshot serves them all, because the cost here
    /// is the snapshot rather than the rules.
    ///
    /// Per shell rather than per workspace. Concatenating three tabs' screens
    /// into one string was cheaper, but it answered the wrong question: with one
    /// agent still working and another waiting on an answer, the workspace knew
    /// it was blocked and nobody could tell which tab to open.
    fn detect(&self) -> Vec<WorkspaceState> {
        let (Ok(sessions), Ok(rules), Ok(mut statuses)) =
            (self.sessions.lock(), self.rules.lock(), self.statuses.lock())
        else {
            return Vec::new();
        };
        if rules.is_empty() {
            return Vec::new();
        }

        // workspace -> its open shells, lowest session id first so the tab strip
        // and this list are in the same order.
        let mut open: HashMap<u64, Vec<&Session>> = HashMap::new();
        for session in sessions.values() {
            let Some(workspace) = session.workspace() else {
                continue;
            };
            open.entry(workspace).or_default().push(session);
        }
        // A shell that has gone takes its judgement with it, or a reused id
        // would inherit the last tab's colour.
        let alive: HashSet<u32> = sessions.keys().copied().collect();
        statuses.sessions.retain(|session, _| alive.contains(session));
        if open.is_empty() {
            return Vec::new();
        }

        let snapshot = crate::agent::process_snapshot();
        let mut changed = Vec::new();
        for (workspace, mut shells) in open {
            shells.sort_by_key(|session| session.id());
            let mut moved = false;
            let mut judged = Vec::with_capacity(shells.len());
            for shell in shells {
                let processes: Vec<String> = shell
                    .pid()
                    .map(|pid| crate::agent::descendant_names(pid, &snapshot))
                    .unwrap_or_default();
                let previous = statuses
                    .sessions
                    .get(&shell.id())
                    .copied()
                    .unwrap_or(WorkspaceStatus::Idle);
                let status =
                    crate::agent::judge(&rules, &processes, &shell.screen_text(), previous);
                if status != previous {
                    statuses.sessions.insert(shell.id(), status);
                    moved = true;
                }
                judged.push(SessionState {
                    session: shell.id(),
                    status,
                });
            }

            let rolled = crate::agent::roll_up(
                &judged.iter().map(|state| state.status).collect::<Vec<_>>(),
            );
            let previous = statuses.workspaces.get(&workspace).copied();
            if previous != Some(rolled) {
                statuses.workspaces.insert(workspace, rolled);
                moved = true;
            }
            // A tab moving without the rollup moving is still news: the tab
            // strip draws one icon per shell and would otherwise miss it.
            if moved {
                changed.push(WorkspaceState {
                    workspace,
                    status: rolled,
                    sessions: judged,
                });
            }
        }
        changed
    }

    fn with_tree<F>(&self, action: F) -> Response
    where
        F: FnOnce(&mut TreeStore) -> Result<crate::tree::TreeState, String>,
    {
        let Ok(mut tree) = self.tree.lock() else {
            return Response::Error {
                message: "project state is poisoned".to_string(),
            };
        };
        match action(&mut tree) {
            Ok(state) => Response::State { state },
            Err(message) => Response::Error { message },
        }
    }

    fn spawn(&self, workspace: Option<u64>, cwd: &str, cols: u16, rows: u16) -> Response {
        let id = {
            let Ok(mut next) = self.next_session.lock() else {
                return Response::Error {
                    message: "session counter is poisoned".to_string(),
                };
            };
            let id = *next;
            *next += 1;
            id
        };

        match Session::spawn(id, workspace, cwd, cols, rows, self.sender.clone()) {
            Ok(session) => match self.sessions.lock() {
                Ok(mut sessions) => {
                    sessions.insert(id, session);
                    Response::Spawned { session: id }
                }
                Err(_) => Response::Error {
                    message: "session table is poisoned".to_string(),
                },
            },
            Err(message) => Response::Error { message },
        }
    }

    fn close(&self, id: u32) -> Response {
        match self.sessions.lock() {
            // Dropping the session kills and reaps the shell.
            Ok(mut sessions) => match sessions.remove(&id) {
                Some(_) => Response::Ok,
                None => Response::Error {
                    message: format!("no session {id}"),
                },
            },
            Err(_) => Response::Error {
                message: "session table is poisoned".to_string(),
            },
        }
    }

    fn with_session<F>(&self, id: u32, action: F) -> Response
    where
        F: FnOnce(&mut Session) -> Result<(), String>,
    {
        let Ok(mut sessions) = self.sessions.lock() else {
            return Response::Error {
                message: "session table is poisoned".to_string(),
            };
        };
        match sessions.get_mut(&id) {
            Some(session) => match action(session) {
                Ok(()) => Response::Ok,
                Err(message) => Response::Error { message },
            },
            None => Response::Error {
                message: format!("no session {id}"),
            },
        }
    }

    /// Ends every shell. Called when the app quits, because a pty that outlives
    /// its window leaves a shell nobody can reach.
    pub fn shutdown(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }

    pub fn session_count(&self) -> usize {
        self.sessions
            .lock()
            .map(|sessions| sessions.len())
            .unwrap_or(0)
    }
}
