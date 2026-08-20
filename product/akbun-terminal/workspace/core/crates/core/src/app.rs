//! The one object the shell holds, and the only place commands are interpreted.
//!
//! Everything here is reachable from the protocol alone. There is no AppKit type
//! in this crate and no callback into the shell: events queue up and the shell
//! drains them when it is ready to touch the screen. That keeps the question of
//! which thread may draw entirely on the shell's side.

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;

use crate::agent::Rule;
use crate::protocol::{parse_request, Command, Event, Response, WorkspaceState, PROTOCOL_VERSION};
use crate::session::Session;
use crate::tree::{TreeStore, WorkspaceStatus};

pub struct App {
    sessions: Mutex<HashMap<u32, Session>>,
    next_session: Mutex<u32>,
    sender: Sender<Event>,
    receiver: Mutex<Receiver<Event>>,
    tree: Mutex<TreeStore>,
    rules: Mutex<Vec<Rule>>,
    /// The last judgement per workspace. Finished is a transition rather than
    /// something on screen, so the previous answer is part of the next one.
    statuses: Mutex<HashMap<u64, WorkspaceStatus>>,
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
            statuses: Mutex::new(HashMap::new()),
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
            Command::ReadFile { path } => match crate::browse::read_file(&path) {
                Ok(text) => Response::File { text },
                Err(message) => Response::Error { message },
            },
            Command::WriteFile { path, text } => match crate::browse::write_file(&path, &text) {
                Ok(()) => Response::Ok,
                Err(message) => Response::Error { message },
            },
            Command::RenderMarkdown { text } => Response::Markdown {
                blocks: crate::markdown::render(&text),
            },
            Command::Highlight { path, text } => {
                let highlighted = crate::highlight::highlight(&path, &text);
                Response::Highlighted {
                    language: highlighted.language,
                    lines: highlighted.lines,
                }
            }
            Command::Themes => Response::Themes {
                themes: crate::theme::all(),
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
            Command::ClearStatus { workspace } => {
                if let Ok(mut statuses) = self.statuses.lock() {
                    if statuses.get(&workspace) == Some(&WorkspaceStatus::Completed) {
                        statuses.insert(workspace, WorkspaceStatus::Idle);
                    }
                }
                Response::Ok
            }
            Command::UrlAt { line, column } => Response::Url {
                url: crate::url::at(&line, column),
            },
        }
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
        statuses.retain(|workspace, _| alive.contains(workspace));
    }

    /// Judges every workspace that has a session open and answers with the ones
    /// that moved. One process snapshot serves them all, because the cost here
    /// is the snapshot rather than the rules.
    fn detect(&self) -> Vec<WorkspaceState> {
        let (Ok(sessions), Ok(rules), Ok(mut statuses)) =
            (self.sessions.lock(), self.rules.lock(), self.statuses.lock())
        else {
            return Vec::new();
        };
        if rules.is_empty() {
            return Vec::new();
        }

        // workspace -> the screens and pids of every shell open in it.
        let mut open: HashMap<u64, (String, Vec<u32>)> = HashMap::new();
        for session in sessions.values() {
            let Some(workspace) = session.workspace() else {
                continue;
            };
            let entry = open.entry(workspace).or_default();
            entry.0.push_str(&session.screen_text());
            entry.0.push('\n');
            if let Some(pid) = session.pid() {
                entry.1.push(pid);
            }
        }
        if open.is_empty() {
            return Vec::new();
        }

        let snapshot = crate::agent::process_snapshot();
        let mut changed = Vec::new();
        for (workspace, (screen, pids)) in open {
            let processes: Vec<String> = pids
                .iter()
                .flat_map(|pid| crate::agent::descendant_names(*pid, &snapshot))
                .collect();
            let previous = statuses
                .get(&workspace)
                .copied()
                .unwrap_or(WorkspaceStatus::Idle);
            let status = crate::agent::judge(&rules, &processes, &screen, previous);
            if status != previous {
                statuses.insert(workspace, status);
                changed.push(WorkspaceState { workspace, status });
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
