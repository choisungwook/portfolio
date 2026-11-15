//! The one object the shell holds, and the only place commands are interpreted.
//!
//! Everything here is reachable from the protocol alone. There is no AppKit type
//! in this crate and no callback into the shell: events queue up and the shell
//! drains them when it is ready to touch the screen. That keeps the question of
//! which thread may draw entirely on the shell's side.

use std::collections::{BTreeMap, HashMap};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use crate::agent::Rule;
use crate::protocol::{
    parse_request, product_version, valid_session_name, Command, Event, Response, SessionInfo,
    SessionState, WaitReason, WorkspaceState, PROTOCOL_VERSION,
};
use crate::search::Index;
use crate::session::{write_all, Launch, Session};
use crate::tree::{TreeStore, WorkspaceStatus};

/// A value that is recomputed at most once per `max_age`.
///
/// The cost of judging is one process snapshot, and the number of clients asking
/// should not decide how often that runs.
struct Memo<T> {
    value: Option<(Instant, T)>,
}

impl<T: Clone> Memo<T> {
    fn get(&self, now: Instant, max_age: Duration) -> Option<T> {
        match &self.value {
            Some((at, value)) if now.saturating_duration_since(*at) < max_age => {
                Some(value.clone())
            }
            _ => None,
        }
    }

    fn put(&mut self, now: Instant, value: T) {
        self.value = Some((now, value));
    }

    fn clear(&mut self) {
        self.value = None;
    }
}

/// How long one judgement is reused.
const JUDGE_INTERVAL: Duration = Duration::from_secs(1);

/// How long after text was typed into a shell that it still counts as about to
/// start working. An agent takes a moment to draw its first "working" marker,
/// and a `wait` that read the shell as idle in that gap would return before the
/// work began.
const SEND_SETTLE: Duration = Duration::from_secs(4);

/// The pause between a typed message and the return that submits it. A TUI that
/// sees both in one read takes the return as part of the text.
const SUBMIT_DELAY: Duration = Duration::from_millis(150);

const DEFAULT_WAIT: Duration = Duration::from_secs(180);

/// What one judging pass decided: every shell, and the workspaces that have
/// shells, rolled up. Complete rather than a delta, because several clients
/// ask and each remembers what it was last told.
#[derive(Clone, Default)]
pub struct Judgement {
    /// Per shell: the agent whose process runs under it, and what it is doing.
    sessions: HashMap<u32, (Option<String>, WorkspaceStatus)>,
    /// Empty until rules are loaded, because without them nothing is known.
    pub workspaces: Vec<WorkspaceState>,
}

/// What one client has been told, so that it is answered with only what moved.
#[derive(Default)]
pub struct Told(HashMap<u64, WorkspaceState>);

impl Told {
    /// The workspaces in `current` that differ from what was last said, and
    /// remembers `current` as the new last word.
    pub fn delta(&mut self, current: &[WorkspaceState]) -> Vec<WorkspaceState> {
        let moved = current
            .iter()
            .filter(|state| self.0.get(&state.workspace) != Some(*state))
            .cloned()
            .collect();
        self.0 = current
            .iter()
            .map(|state| (state.workspace, state.clone()))
            .collect();
        moved
    }
}

/// Takes the finished colour off the shells that were looked at.
///
/// A named session clears that tab alone, so a workspace whose other tab is
/// still finished stays green. Without a session every shell of the workspace
/// is cleared, which is what happens when it is closed rather than read.
///
/// `members` is passed in rather than looked up, so that this never takes the
/// sessions lock while holding the statuses one; `judge_all` takes them the
/// other way round.
fn clear_finished(statuses: &mut HashMap<u32, WorkspaceStatus>, session: Option<u32>, members: &[u32]) {
    let cleared: Vec<u32> = match session {
        Some(one) if members.contains(&one) => vec![one],
        Some(_) => return,
        None => members.to_vec(),
    };
    for id in cleared {
        if statuses.get(&id) == Some(&WorkspaceStatus::Completed) {
            statuses.insert(id, WorkspaceStatus::Idle);
        }
    }
}

/// The text a session receives for `send`. With a sender it is wrapped so the
/// receiver knows who to answer.
fn wrap_message(text: &str, from: Option<&str>) -> String {
    match from {
        Some(from) => format!(r#"<akbun from="{from}">{text}</akbun>"#),
        None => text.to_string(),
    }
}

const PASTE_START: &str = "\x1b[200~";
const PASTE_END: &str = "\x1b[201~";

/// The bytes that type a message. As a bracketed paste when the program asked
/// for it, so a TUI takes a multi-line message as one piece of input.
fn typed_bytes(message: &str, bracketed_paste: bool) -> Vec<u8> {
    if bracketed_paste {
        // The end marker is removed from the text, repeatedly because removing
        // one can join its neighbours into another; otherwise a message could
        // end the paste early and have the rest typed as keystrokes.
        let mut text = message.to_string();
        while text.contains(PASTE_END) {
            text = text.replace(PASTE_END, "");
        }
        [PASTE_START.as_bytes(), text.as_bytes(), PASTE_END.as_bytes()].concat()
    } else {
        message.as_bytes().to_vec()
    }
}

/// Whether `status` ends a `wait`. A shell that reads as idle right after
/// being typed into has not started yet, so it does not.
fn settled(status: WorkspaceStatus, recently_sent: bool) -> bool {
    match status {
        WorkspaceStatus::Running => false,
        WorkspaceStatus::Idle => !recently_sent,
        _ => true,
    }
}

pub struct App {
    sessions: Mutex<HashMap<u32, Session>>,
    next_session: Mutex<u32>,
    sender: Sender<Event>,
    receiver: Mutex<Receiver<Event>>,
    tree: Mutex<TreeStore>,
    rules: Mutex<Vec<Rule>>,
    /// The last status of every shell. Finished is a transition rather than
    /// something on screen, so the previous answer is part of the next one.
    statuses: Mutex<HashMap<u32, WorkspaceStatus>>,
    judged: Mutex<Memo<Judgement>>,
    /// What `Command::Detect` has told a caller that has no connection of its
    /// own. The daemon keeps one of these per connection instead.
    told: Mutex<Told>,
    /// When each shell was last typed into with `send`.
    sent: Mutex<HashMap<u32, Instant>>,
    /// Counts changes a `wait` may be waiting for.
    changed: (Mutex<u64>, Condvar),
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
            statuses: Mutex::new(HashMap::new()),
            judged: Mutex::new(Memo { value: None }),
            told: Mutex::new(Told::default()),
            sent: Mutex::new(HashMap::new()),
            changed: (Mutex::new(0), Condvar::new()),
            index: Mutex::new(None),
        }
    }

    /// JSON in, JSON out. The reply is always a `Response`, including for a
    /// request this build cannot read, so the shell has one shape to decode.
    pub fn dispatch(&self, json: &str) -> String {
        let response = match parse_request(json) {
            Ok(command) => self.execute(command),
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

    /// The next event, waiting up to `timeout`. For the one thread that pumps
    /// events somewhere; it and `poll_event` share the same queue.
    pub fn next_event(&self, timeout: Duration) -> Option<Event> {
        self.receiver.lock().ok()?.recv_timeout(timeout).ok()
    }

    pub fn execute(&self, command: Command) -> Response {
        match command {
            Command::Hello => Response::Hello {
                protocol: PROTOCOL_VERSION,
                version: Some(product_version().to_string()),
            },
            Command::Spawn {
                cwd,
                cols,
                rows,
                workspace,
                name,
                command,
                parent,
                // Ownership is about the connection, which the daemon tracks.
                owned: _,
            } => self.spawn(
                &cwd,
                cols,
                rows,
                Launch {
                    workspace,
                    name,
                    parent,
                    command,
                },
            ),
            Command::Sessions => Response::Sessions {
                sessions: self.list_sessions(),
            },
            Command::Attach { .. } | Command::Detach { .. } | Command::Shutdown => Response::Error {
                message: "this command needs a connection to the daemon".to_string(),
            },
            Command::Send {
                session,
                text,
                from,
            } => self.send(session, &text, from),
            Command::Read { session } => {
                self.with_open(session, |shell| Response::Text {
                    text: shell.screen_text(),
                })
            }
            Command::Wait {
                session,
                timeout_secs,
            } => self.wait(
                session,
                timeout_secs.map(Duration::from_secs).unwrap_or(DEFAULT_WAIT),
            ),
            Command::RenameSession { session, name } => self.rename(session, name),
            Command::Write { session, bytes } => self.write(session, &bytes),
            Command::Resize {
                session,
                cols,
                rows,
            } => self.with_session(session, |session| session.resize(cols, rows)),
            Command::Close { session } => self.close(session),
            // A second client must not replace what the first has since changed
            // with what was last written, so a directory already held is
            // answered from memory.
            Command::LoadState { directory } => self.with_tree(|tree| {
                if tree.is_loaded(&directory) {
                    Ok(tree.state())
                } else {
                    tree.load(&directory)
                }
            }),
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
                self.with_tree(|tree| tree.delete_project(project))
            }
            Command::RenameWorkspace { workspace, name } => {
                self.with_tree(|tree| tree.rename_workspace(workspace, name))
            }
            Command::DeleteWorkspace { workspace } => {
                self.with_tree(|tree| tree.delete_workspace(workspace))
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
            Command::GitShow { path, hash } => Response::GitDetail {
                detail: crate::git::show(&path, &hash),
            },
            Command::GitWorking { path } => Response::GitWorking {
                working: crate::git::working(&path),
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
                let members: Vec<u32> = match self.sessions.lock() {
                    Ok(open) => open
                        .values()
                        .filter(|shell| shell.workspace() == Some(workspace))
                        .map(|shell| shell.id())
                        .collect(),
                    Err(_) => Vec::new(),
                };
                if let Ok(mut statuses) = self.statuses.lock() {
                    clear_finished(&mut statuses, session, &members);
                }
                // The next question has to see the cleared colour, not a
                // judgement made a moment ago.
                if let Ok(mut memo) = self.judged.lock() {
                    memo.clear();
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

    /// The workspaces that moved since `told` was last answered. The daemon
    /// keeps one `Told` per connection.
    pub fn detect_for(&self, told: &mut Told) -> Vec<WorkspaceState> {
        told.delta(&self.judgement().workspaces)
    }

    fn detect(&self) -> Vec<WorkspaceState> {
        match self.told.lock() {
            Ok(mut told) => self.detect_for(&mut told),
            Err(_) => Vec::new(),
        }
    }

    /// The current judgement of every shell, at most one process snapshot a
    /// second however many callers there are.
    pub fn judgement(&self) -> Judgement {
        let Ok(mut memo) = self.judged.lock() else {
            return Judgement::default();
        };
        let now = Instant::now();
        if let Some(fresh) = memo.get(now, JUDGE_INTERVAL) {
            return fresh;
        }
        let judgement = self.judge_all();
        memo.put(now, judgement.clone());
        self.announce_change();
        judgement
    }

    /// Judges every shell and rolls them up per workspace. One process snapshot
    /// serves them all, because the cost here is the snapshot rather than the
    /// rules.
    ///
    /// Per shell rather than per workspace. Concatenating three tabs' screens
    /// into one string was cheaper, but it answered the wrong question: with one
    /// agent still working and another waiting on an answer, the workspace knew
    /// it was blocked and nobody could tell which tab to open. Shells without a
    /// workspace are judged too, because an agent that started a helper needs
    /// to know when the helper stops.
    fn judge_all(&self) -> Judgement {
        let (Ok(sessions), Ok(rules), Ok(mut statuses)) =
            (self.sessions.lock(), self.rules.lock(), self.statuses.lock())
        else {
            return Judgement::default();
        };
        // A shell that has gone takes its judgement with it, or a reused id
        // would inherit the last tab's colour.
        statuses.retain(|session, _| sessions.contains_key(session));
        let mut judgement = Judgement::default();
        if sessions.is_empty() {
            return judgement;
        }

        let snapshot = if rules.is_empty() {
            Vec::new()
        } else {
            crate::agent::process_snapshot()
        };
        // Lowest session id first so the tab strip and these lists agree.
        let mut shells: Vec<&Session> = sessions.values().collect();
        shells.sort_by_key(|shell| shell.id());

        let mut by_workspace: BTreeMap<u64, Vec<SessionState>> = BTreeMap::new();
        for shell in shells {
            let (agent, status) = if rules.is_empty() {
                (None, WorkspaceStatus::Idle)
            } else {
                let processes: Vec<String> = shell
                    .pid()
                    .map(|pid| crate::agent::descendant_names(pid, &snapshot))
                    .unwrap_or_default();
                let agent = rules
                    .iter()
                    .find(|rule| rule.processes.iter().any(|name| processes.contains(name)))
                    .map(|rule| rule.name.clone());
                let previous = statuses
                    .get(&shell.id())
                    .copied()
                    .unwrap_or(WorkspaceStatus::Idle);
                let status =
                    crate::agent::judge(&rules, &processes, &shell.screen_text(), previous);
                (agent, status)
            };
            statuses.insert(shell.id(), status);
            judgement.sessions.insert(shell.id(), (agent, status));
            if let Some(workspace) = shell.workspace() {
                by_workspace.entry(workspace).or_default().push(SessionState {
                    session: shell.id(),
                    status,
                });
            }
        }
        if !rules.is_empty() {
            judgement.workspaces = by_workspace
                .into_iter()
                .map(|(workspace, sessions)| WorkspaceState {
                    workspace,
                    status: crate::agent::roll_up(
                        &sessions.iter().map(|state| state.status).collect::<Vec<_>>(),
                    ),
                    sessions,
                })
                .collect();
        }
        judgement
    }

    fn announce_change(&self) {
        if let Ok(mut count) = self.changed.0.lock() {
            *count += 1;
        }
        self.changed.1.notify_all();
    }

    fn list_sessions(&self) -> Vec<SessionInfo> {
        let judgement = self.judgement();
        let Ok(sessions) = self.sessions.lock() else {
            return Vec::new();
        };
        let mut listed: Vec<SessionInfo> = sessions
            .values()
            .map(|shell| {
                let (agent, status) = judgement
                    .sessions
                    .get(&shell.id())
                    .cloned()
                    .unwrap_or((None, WorkspaceStatus::Idle));
                let (cols, rows) = shell.size();
                SessionInfo {
                    session: shell.id(),
                    name: shell.name().map(str::to_string),
                    parent: shell.parent(),
                    workspace: shell.workspace(),
                    cwd: shell.cwd().to_string(),
                    cols,
                    rows,
                    agent,
                    status,
                }
            })
            .collect();
        listed.sort_by_key(|info| info.session);
        listed
    }

    /// Writes raw bytes to a session. The write can block for as long as the
    /// program is not reading its input, so it happens with only the session's
    /// own locks held and never the table's.
    fn write(&self, id: u32, bytes: &[u8]) -> Response {
        let (writer, input) = {
            let Ok(sessions) = self.sessions.lock() else {
                return poisoned("session table");
            };
            let Some(target) = sessions.get(&id) else {
                return no_session(id);
            };
            (target.writer(), target.input())
        };
        let Ok(_input) = input.lock() else {
            return poisoned("session input");
        };
        match write_all(&writer, bytes) {
            Ok(()) => Response::Ok,
            Err(message) => Response::Error { message },
        }
    }

    /// Types `text` into a session and presses return.
    ///
    /// The return comes after a pause and the lock on the session table is not
    /// held across it, so one slow delivery does not stall every other command.
    fn send(&self, id: u32, text: &str, from: Option<u32>) -> Response {
        let (writer, input, bracketed, sender) = {
            let Ok(sessions) = self.sessions.lock() else {
                return poisoned("session table");
            };
            let Some(target) = sessions.get(&id) else {
                return no_session(id);
            };
            let sender = from.map(|from| match sessions.get(&from).and_then(|s| s.name()) {
                Some(name) => format!("{from} {name}"),
                None => from.to_string(),
            });
            (target.writer(), target.input(), target.bracketed_paste(), sender)
        };
        // Held until the return is written, so neither another `send` nor a
        // viewer's keystrokes can land between the text and the return.
        let Ok(_input) = input.lock() else {
            return poisoned("session input");
        };
        let message = wrap_message(text, sender.as_deref());
        if let Err(message) = write_all(&writer, &typed_bytes(&message, bracketed)) {
            return Response::Error { message };
        }
        std::thread::sleep(SUBMIT_DELAY);
        if let Err(message) = write_all(&writer, b"\r") {
            return Response::Error { message };
        }
        if let Ok(mut sent) = self.sent.lock() {
            sent.insert(id, Instant::now());
        }
        Response::Ok
    }

    /// Blocks until the session stops working, exits, or `timeout` passes.
    fn wait(&self, id: u32, timeout: Duration) -> Response {
        let deadline = Instant::now() + timeout;
        let mut last = WorkspaceStatus::Idle;
        let mut first = true;
        loop {
            let seen = self.changed.0.lock().map(|count| *count).unwrap_or(0);
            let exists = self
                .sessions
                .lock()
                .map(|sessions| sessions.contains_key(&id))
                .unwrap_or(false);
            if !exists {
                return if first {
                    no_session(id)
                } else {
                    Response::Waited {
                        reason: WaitReason::Exited,
                        status: last,
                    }
                };
            }
            // The first look decides whether to wait at all, so it must not
            // rest on a judgement made before the caller's own last command.
            if first {
                if let Ok(mut memo) = self.judged.lock() {
                    memo.clear();
                }
            }
            first = false;
            if let Some((_, status)) = self.judgement().sessions.get(&id) {
                last = *status;
            }
            let recent = self
                .sent
                .lock()
                .ok()
                .and_then(|sent| sent.get(&id).copied())
                .is_some_and(|at| at.elapsed() < SEND_SETTLE);
            if settled(last, recent) {
                return Response::Waited {
                    reason: WaitReason::Stopped,
                    status: last,
                };
            }
            let now = Instant::now();
            if now >= deadline {
                return Response::Waited {
                    reason: WaitReason::Timeout,
                    status: last,
                };
            }
            // Woken by a change; the cap covers a change announced between the
            // check above and this wait.
            let pause = (deadline - now).min(Duration::from_millis(500));
            if let Ok(count) = self.changed.0.lock() {
                let _ = self
                    .changed
                    .1
                    .wait_timeout_while(count, pause, |count| *count == seen);
            }
        }
    }

    fn rename(&self, id: u32, name: String) -> Response {
        let Ok(mut sessions) = self.sessions.lock() else {
            return poisoned("session table");
        };
        if !sessions.contains_key(&id) {
            return no_session(id);
        }
        let name = if name.is_empty() {
            None
        } else if !valid_session_name(&name) {
            return invalid_name(&name);
        } else if sessions
            .values()
            .any(|other| other.id() != id && other.name() == Some(name.as_str()))
        {
            return name_taken(&name);
        } else {
            Some(name)
        };
        if let Some(shell) = sessions.get_mut(&id) {
            shell.set_name(name);
        }
        Response::Ok
    }

    fn with_open<F>(&self, id: u32, action: F) -> Response
    where
        F: FnOnce(&Session) -> Response,
    {
        let Ok(sessions) = self.sessions.lock() else {
            return poisoned("session table");
        };
        match sessions.get(&id) {
            Some(shell) => action(shell),
            None => no_session(id),
        }
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

    fn spawn(&self, cwd: &str, cols: u16, rows: u16, mut launch: Launch) -> Response {
        if let Some(name) = &launch.name {
            if !valid_session_name(name) {
                return invalid_name(name);
            }
        }
        // The table stays locked from the name check to the insert, so two
        // spawns asking for the same name cannot both pass.
        let Ok(mut sessions) = self.sessions.lock() else {
            return poisoned("session table");
        };
        if let Some(name) = &launch.name {
            if sessions.values().any(|other| other.name() == Some(name.as_str())) {
                return name_taken(name);
            }
        }
        if launch.workspace.is_none() {
            launch.workspace = launch
                .parent
                .and_then(|parent| sessions.get(&parent))
                .and_then(|parent| parent.workspace());
        }
        let id = {
            let Ok(mut next) = self.next_session.lock() else {
                return poisoned("session counter");
            };
            let id = *next;
            *next += 1;
            id
        };
        match Session::spawn(id, launch, cwd, cols, rows, self.sender.clone()) {
            Ok(session) => {
                sessions.insert(id, session);
                Response::Spawned { session: id }
            }
            Err(message) => Response::Error { message },
        }
    }

    fn close(&self, id: u32) -> Response {
        match self.remove_session(id) {
            true => Response::Ok,
            false => no_session(id),
        }
    }

    /// Takes a session out of the table and ends its shell. Reports whether
    /// there was one.
    pub fn remove_session(&self, id: u32) -> bool {
        let removed = match self.sessions.lock() {
            Ok(mut sessions) => sessions.remove(&id),
            Err(_) => None,
        };
        if let Ok(mut sent) = self.sent.lock() {
            sent.remove(&id);
        }
        // Dropped after the table is unlocked: it kills and reaps the shell,
        // which can take a moment.
        let found = removed.is_some();
        drop(removed);
        self.announce_change();
        found
    }

    /// The size a session was last given, if it is still there.
    pub fn session_size(&self, id: u32) -> Option<(u16, u16)> {
        self.sessions.lock().ok()?.get(&id).map(Session::size)
    }

    fn with_session<F>(&self, id: u32, action: F) -> Response
    where
        F: FnOnce(&mut Session) -> Result<(), String>,
    {
        let Ok(mut sessions) = self.sessions.lock() else {
            return poisoned("session table");
        };
        match sessions.get_mut(&id) {
            Some(session) => match action(session) {
                Ok(()) => Response::Ok,
                Err(message) => Response::Error { message },
            },
            None => no_session(id),
        }
    }

    /// Ends every shell. Called when the app quits, because a pty that outlives
    /// its window leaves a shell nobody can reach.
    pub fn shutdown(&self) {
        let all: Vec<Session> = match self.sessions.lock() {
            Ok(mut sessions) => sessions.drain().map(|(_, session)| session).collect(),
            Err(_) => Vec::new(),
        };
        drop(all);
        self.announce_change();
    }

    pub fn session_count(&self) -> usize {
        self.sessions
            .lock()
            .map(|sessions| sessions.len())
            .unwrap_or(0)
    }
}

fn poisoned(what: &str) -> Response {
    Response::Error {
        message: format!("{what} is poisoned"),
    }
}

fn no_session(id: u32) -> Response {
    Response::Error {
        message: format!("no session {id}"),
    }
}

fn invalid_name(name: &str) -> Response {
    Response::Error {
        message: format!(
            "invalid session name {name:?}: use letters, digits, '-', '_' or '.', and not only digits"
        ),
    }
}

fn name_taken(name: &str) -> Response {
    Response::Error {
        message: format!("a session is already named {name}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(workspace: u64, status: WorkspaceStatus) -> WorkspaceState {
        WorkspaceState {
            workspace,
            status,
            sessions: Vec::new(),
        }
    }

    #[test]
    fn each_client_is_told_only_what_moved_since_it_last_asked() {
        let mut first = Told::default();
        let mut second = Told::default();
        let now = vec![state(1, WorkspaceStatus::Running), state(2, WorkspaceStatus::Idle)];

        // A client that has heard nothing hears everything.
        assert_eq!(first.delta(&now).len(), 2);
        assert!(first.delta(&now).is_empty());
        // Another client asking in between does not use up the first's news.
        assert_eq!(second.delta(&now).len(), 2);

        let next = vec![state(1, WorkspaceStatus::Completed), state(2, WorkspaceStatus::Idle)];
        let moved = first.delta(&next);
        assert_eq!(moved, vec![state(1, WorkspaceStatus::Completed)]);
        assert_eq!(second.delta(&next), moved);
    }

    #[test]
    fn a_judgement_is_reused_until_it_is_old_enough() {
        let start = Instant::now();
        let mut memo = Memo { value: None };
        assert_eq!(memo.get(start, JUDGE_INTERVAL), None::<u32>);
        memo.put(start, 7u32);
        assert_eq!(memo.get(start + Duration::from_millis(900), JUDGE_INTERVAL), Some(7));
        assert_eq!(memo.get(start + Duration::from_millis(1100), JUDGE_INTERVAL), None);
        memo.put(start, 8);
        memo.clear();
        assert_eq!(memo.get(start, JUDGE_INTERVAL), None);
    }

    #[test]
    fn looking_at_one_tab_leaves_the_other_tab_finished() {
        let mut statuses = HashMap::from([
            (1, WorkspaceStatus::Completed),
            (2, WorkspaceStatus::Completed),
        ]);
        clear_finished(&mut statuses, Some(1), &[1, 2]);
        assert_eq!(statuses[&1], WorkspaceStatus::Idle);
        assert_eq!(statuses[&2], WorkspaceStatus::Completed);
        clear_finished(&mut statuses, None, &[1, 2]);
        assert_eq!(statuses[&2], WorkspaceStatus::Idle);
    }

    #[test]
    fn a_message_names_its_sender_and_is_pasted_when_asked() {
        assert_eq!(wrap_message("hi", None), "hi");
        assert_eq!(
            wrap_message("hi", Some("3 lead")),
            r#"<akbun from="3 lead">hi</akbun>"#
        );
        assert_eq!(typed_bytes("a\nb", false), b"a\nb");
        assert_eq!(typed_bytes("a", true), b"\x1b[200~a\x1b[201~");
    }

    #[test]
    fn a_message_cannot_end_the_bracketed_paste_it_is_typed_in() {
        assert_eq!(typed_bytes("a\x1b[201~b", false), b"a\x1b[201~b".to_vec());
        assert_eq!(
            typed_bytes("a\x1b[201~b", true),
            b"\x1b[200~ab\x1b[201~".to_vec()
        );
        // Removing one marker must not leave a new one made of what was around it.
        assert_eq!(
            typed_bytes("a\x1b[20\x1b[201~1~b", true),
            b"\x1b[200~ab\x1b[201~".to_vec()
        );
    }

    #[test]
    fn two_sends_to_one_session_do_not_interleave() {
        let app = std::sync::Arc::new(App::new());
        let spawned = app.execute(Command::Spawn {
            cwd: String::new(),
            cols: 200,
            rows: 24,
            workspace: None,
            name: None,
            // No echo, so the screen holds only what cat printed: one line per
            // line it received.
            command: vec![
                "sh".into(),
                "-c".into(),
                "stty -echo; echo ready; exec cat".into(),
            ],
            parent: None,
            owned: false,
        });
        let Response::Spawned { session } = spawned else {
            panic!("{spawned:?}");
        };
        let screen_of = |app: &App| match app.execute(Command::Read { session }) {
            Response::Text { text } => text,
            other => panic!("expected text: {other:?}"),
        };
        let deadline = Instant::now() + Duration::from_secs(5);
        while !screen_of(&app).contains("ready") {
            assert!(Instant::now() < deadline, "the shell never got ready");
            std::thread::sleep(Duration::from_millis(20));
        }
        // Two messages written whole, then both returns, would reach cat as one
        // line holding both.
        let senders: Vec<_> = ["alpha-alpha-alpha", "bravo-bravo-bravo"]
            .into_iter()
            .map(|text| {
                let app = std::sync::Arc::clone(&app);
                std::thread::spawn(move || {
                    app.execute(Command::Send {
                        session,
                        text: text.to_string(),
                        from: None,
                    })
                })
            })
            .collect();
        for sender in senders {
            assert_eq!(sender.join().unwrap(), Response::Ok);
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        let screen = loop {
            let text = screen_of(&app);
            if text.contains("alpha-alpha-alpha") && text.contains("bravo-bravo-bravo") {
                break text;
            }
            assert!(Instant::now() < deadline, "messages never arrived: {text:?}");
            std::thread::sleep(Duration::from_millis(50));
        };
        let lines: Vec<&str> = screen.lines().filter(|line| !line.is_empty()).collect();
        assert!(
            lines.contains(&"alpha-alpha-alpha") && lines.contains(&"bravo-bravo-bravo"),
            "the messages were mixed: {screen:?}"
        );
        app.shutdown();
    }

    #[test]
    fn a_shell_just_typed_into_is_not_yet_stopped() {
        assert!(!settled(WorkspaceStatus::Running, false));
        assert!(settled(WorkspaceStatus::Idle, false));
        assert!(!settled(WorkspaceStatus::Idle, true));
        assert!(settled(WorkspaceStatus::NeedsAttention, true));
        assert!(settled(WorkspaceStatus::Completed, true));
    }

    #[test]
    fn names_are_unique_and_children_inherit_the_workspace() {
        let app = App::new();
        let spawn = |name: Option<&str>, parent: Option<u32>, workspace: Option<u64>| {
            app.execute(Command::Spawn {
                cwd: String::new(),
                cols: 80,
                rows: 24,
                workspace,
                name: name.map(str::to_string),
                command: vec!["sleep".into(), "30".into()],
                parent,
                owned: false,
            })
        };
        assert_eq!(spawn(Some("lead"), None, Some(9)), Response::Spawned { session: 1 });
        assert!(matches!(spawn(Some("lead"), None, None), Response::Error { .. }));
        assert!(matches!(spawn(Some("42"), None, None), Response::Error { .. }));
        assert_eq!(spawn(Some("kid"), Some(1), None), Response::Spawned { session: 2 });

        let Response::Sessions { sessions } = app.execute(Command::Sessions) else {
            panic!("expected sessions");
        };
        assert_eq!(sessions[1].parent, Some(1));
        assert_eq!(sessions[1].workspace, Some(9));
        assert_eq!(sessions[1].name.as_deref(), Some("kid"));

        // Renaming into a taken name is refused; into its own name is fine.
        let rename = |session, name: &str| {
            app.execute(Command::RenameSession {
                session,
                name: name.to_string(),
            })
        };
        assert!(matches!(rename(2, "lead"), Response::Error { .. }));
        assert_eq!(rename(2, "kid"), Response::Ok);
        assert_eq!(rename(2, "worker"), Response::Ok);
        assert_eq!(spawn(Some("kid"), None, None), Response::Spawned { session: 3 });
        app.shutdown();
    }

    #[test]
    fn wait_comes_back_when_the_session_exits_and_when_time_runs_out() {
        let app = std::sync::Arc::new(App::new());
        let spawned = app.execute(Command::Spawn {
            cwd: String::new(),
            cols: 80,
            rows: 24,
            workspace: None,
            name: None,
            command: vec!["sleep".into(), "30".into()],
            parent: None,
            owned: false,
        });
        let Response::Spawned { session } = spawned else {
            panic!("{spawned:?}");
        };
        // Nothing here is an agent, so the shell reads as idle and has already
        // stopped; a rule that says it is running is what makes it wait.
        let rule: Rule = serde_json::from_str(
            r#"{"name":"t","processes":["sleep"],"running":["never-on-screen"]}"#,
        )
        .unwrap();
        *app.rules.lock().unwrap() = vec![rule];
        // The shell takes a moment to become `sleep`, so look until it has.
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            app.judged.lock().unwrap().clear();
            if app.judgement().sessions[&session].0.as_deref() == Some("t") {
                break;
            }
            assert!(Instant::now() < deadline, "the agent was never recognised");
            std::thread::sleep(Duration::from_millis(50));
        }

        // Make it read as running by seeding the memory the judge reads.
        app.statuses
            .lock()
            .unwrap()
            .insert(session, WorkspaceStatus::Running);
        app.judged.lock().unwrap().clear();
        let started = Instant::now();
        let response = app.execute(Command::Wait {
            session,
            timeout_secs: Some(1),
        });
        assert_eq!(
            response,
            Response::Waited {
                reason: WaitReason::Timeout,
                status: WorkspaceStatus::Running
            }
        );
        assert!(started.elapsed() >= Duration::from_secs(1));

        let waiter = {
            let app = std::sync::Arc::clone(&app);
            std::thread::spawn(move || {
                app.execute(Command::Wait {
                    session,
                    timeout_secs: Some(20),
                })
            })
        };
        std::thread::sleep(Duration::from_millis(300));
        assert!(app.remove_session(session));
        let Response::Waited { reason, .. } = waiter.join().unwrap() else {
            panic!("expected waited");
        };
        assert_eq!(reason, WaitReason::Exited);
        assert!(matches!(
            app.execute(Command::Wait {
                session,
                timeout_secs: Some(1)
            }),
            Response::Error { .. }
        ));
    }

    #[test]
    fn loading_the_directory_already_loaded_does_not_read_it_again() {
        let directory = std::env::temp_dir().join(format!("akbun-load-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        let path = directory.to_string_lossy().to_string();
        let app = App::new();
        let load = || app.execute(Command::LoadState { directory: path.clone() });
        assert!(matches!(load(), Response::State { .. }));
        app.execute(Command::CreateProject {
            name: "a".into(),
            path: None,
        });
        // The file on disk changes behind the daemon's back; a second client's
        // load must see what the daemon holds, not what is on disk.
        std::fs::write(directory.join("projects.json"), r#"{"schema_version":1,"projects":[]}"#).unwrap();
        let Response::State { state } = load() else {
            panic!("expected state");
        };
        assert_eq!(state.projects.len(), 1);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
