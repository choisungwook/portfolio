//! The loop that ties the state to the daemon and the terminal.
//!
//! Deliberately thin: it reads events from both sides, hands them to the
//! [`State`], and carries out the [`Action`]s that come back. Anything that
//! decides something lives in the state, where it is tested without a socket.

use std::collections::VecDeque;
use std::io::Stdout;
use std::sync::mpsc::TryRecvError;
use std::time::{Duration, Instant};

use akbun_terminal_core::protocol::{Command, Event, Response, SessionInfo};
use akbun_terminal_core::tree::WorkspaceStatus;
use akbun_terminal_core::{paths, Client};
use ratatui::backend::CrosstermBackend;
use ratatui::crossterm::event::{self, Event as Input, KeyEventKind};
use ratatui::layout::Rect;
use ratatui::Terminal;

use crate::render::render;
use crate::state::{Action, Group, State};

/// How often statuses and the agent list are refreshed. The daemon judges on
/// the same cadence, so asking faster would only repeat its last answer.
const REFRESH: Duration = Duration::from_secs(2);
/// How long a selection must stay on an empty workspace before it gets a
/// shell, so walking the cursor down a list does not open one per row.
const SPAWN_SETTLE: Duration = Duration::from_millis(350);
/// The wait for keyboard input between looks at the daemon's events. Short
/// enough that output feels live.
const TICK: Duration = Duration::from_millis(15);

/// How a session of the TUI ended.
pub enum Exit {
    /// The person quit; every shell is still running in the daemon.
    Quit,
    /// The daemon went away.
    Lost,
}

pub struct App {
    client: Client,
    state: State,
}

/// The conversation with the daemon failed, which ends the session of the TUI.
struct Lost;

impl App {
    /// Connects (starting the daemon if need be), loads the tree and the agent
    /// rules, and attaches to every shell that is already running, so a
    /// second start shows the first one's work.
    pub fn connect(cwd: &str, size: (u16, u16)) -> Result<App, String> {
        let client = Client::connect_or_start()?;
        client.handshake()?;
        let mut state = State::new(cwd);
        state.set_area(Rect::new(0, 0, size.0, size.1));

        let directory = paths::data_dir().to_string_lossy().into_owned();
        match client.send(Command::LoadState { directory })? {
            Response::State { state: tree } => state.set_tree(tree),
            Response::Error { message } => {
                return Err(format!("cannot load the project tree: {message}"))
            }
            other => return Err(format!("unexpected answer to load_state: {other:?}")),
        }
        let directory = paths::agents_dir().to_string_lossy().into_owned();
        if let Response::Error { message } = client.send(Command::LoadRules { directory })? {
            state.notice = Some(format!("agent rules: {message}"));
        }
        let mut app = App { client, state };
        let infos = app.client.sessions()?;
        for info in &infos {
            app.attach(info)
                .map_err(|_| "the daemon closed the connection".to_string())?;
        }
        let actions = app.state.init_selection();
        let _ = app.perform(actions);
        Ok(app)
    }

    pub fn run(
        &mut self,
        terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ) -> Result<Exit, String> {
        let mut dirty = true;
        let mut quit = false;
        let mut last_refresh = Instant::now();
        let mut settling: Option<(Group, Instant)> = None;
        while !quit {
            // What the daemon has to say first: it is what makes the screen live.
            loop {
                match self.client.try_event() {
                    Ok(Event::Output { session, bytes }) => self.state.output(session, &bytes),
                    Ok(Event::Exited { session }) => self.state.exited(session),
                    Ok(Event::State { state }) => self.state.set_tree(state),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return Ok(Exit::Lost),
                }
                dirty = true;
            }

            let size = terminal.size().map_err(|error| error.to_string())?;
            let area = Rect::new(0, 0, size.width, size.height);
            if area != self.state.area {
                self.state.set_area(area);
                dirty = true;
            }
            let resize = self.state.sync_size();
            if !resize.is_empty() && self.perform(resize).is_err() {
                return Ok(Exit::Lost);
            }

            match (self.state.pending_spawn, &settling) {
                (Some(group), Some((waiting, since))) if group == *waiting => {
                    if since.elapsed() >= SPAWN_SETTLE {
                        settling = None;
                        if let Some(action) = self.state.take_spawn() {
                            if self.perform(vec![action]).is_err() {
                                return Ok(Exit::Lost);
                            }
                            dirty = true;
                        }
                    }
                }
                (Some(group), _) => settling = Some((group, Instant::now())),
                (None, _) => settling = None,
            }

            if dirty {
                terminal
                    .draw(|frame| render(&self.state, frame))
                    .map_err(|error| error.to_string())?;
                dirty = false;
            }

            if event::poll(TICK).map_err(|error| error.to_string())? {
                // Everything already waiting, so a burst of typing or a paste
                // costs one draw.
                loop {
                    let input = event::read().map_err(|error| error.to_string())?;
                    let actions = match input {
                        Input::Key(key) if key.kind != KeyEventKind::Release => {
                            self.state.on_key(key)
                        }
                        Input::Mouse(mouse) => self.state.on_mouse(mouse),
                        Input::Paste(text) => self.state.on_paste(&text),
                        _ => Vec::new(),
                    };
                    dirty = true;
                    match self.perform(actions) {
                        Ok(true) => quit = true,
                        Ok(false) => {}
                        Err(Lost) => return Ok(Exit::Lost),
                    }
                    if quit || !event::poll(Duration::ZERO).map_err(|error| error.to_string())? {
                        break;
                    }
                }
            }

            if last_refresh.elapsed() >= REFRESH {
                last_refresh = Instant::now();
                if self.refresh().is_err() {
                    return Ok(Exit::Lost);
                }
                dirty = true;
            }
        }
        Ok(Exit::Quit)
    }

    fn send(&self, command: Command) -> Result<Response, Lost> {
        self.client.send(command).map_err(|_| Lost)
    }

    /// Attaches to a shell and starts drawing it from its replay.
    fn attach(&mut self, info: &SessionInfo) -> Result<(), Lost> {
        if let Response::Attached {
            cols, rows, replay, ..
        } = self.send(Command::Attach {
            session: info.session,
        })? {
            self.state.add_session(info, cols, rows, &replay);
        }
        Ok(())
    }

    /// Statuses and the list of shells, which also finds the ones another
    /// client started (an agent delegating work, a `run` from a script).
    fn refresh(&mut self) -> Result<(), Lost> {
        let mut actions = Vec::new();
        if let Response::Statuses { statuses } = self.send(Command::Detect)? {
            actions.extend(self.state.apply_statuses(&statuses));
        }
        if let Response::Sessions { sessions } = self.send(Command::Sessions)? {
            let reconciled = self.state.reconcile(&sessions);
            actions.extend(reconciled.actions);
            for id in reconciled.attach {
                if let Some(info) = sessions.iter().find(|info| info.session == id) {
                    self.attach(info)?;
                }
            }
        }
        self.perform(actions).map(|_| ())
    }

    /// Carries out what the state asked for. `Ok(true)` means quit.
    fn perform(&mut self, actions: Vec<Action>) -> Result<bool, Lost> {
        let mut queue: VecDeque<Action> = actions.into();
        while let Some(action) = queue.pop_front() {
            match action {
                Action::Quit => return Ok(true),
                Action::Write { session, bytes } => {
                    self.send(Command::Write { session, bytes })?;
                }
                Action::Resize {
                    session,
                    cols,
                    rows,
                } => {
                    self.send(Command::Resize {
                        session,
                        cols,
                        rows,
                    })?;
                }
                Action::ClearStatus { workspace, session } => {
                    self.send(Command::ClearStatus {
                        workspace,
                        session: Some(session),
                    })?;
                }
                Action::Spawn { cwd, workspace } => {
                    let (cols, rows) = self.state.pane();
                    let reply = self.send(Command::Spawn {
                        cwd: cwd.clone(),
                        cols,
                        rows,
                        workspace,
                        name: None,
                        command: Vec::new(),
                        parent: None,
                    })?;
                    match reply {
                        Response::Spawned { session } => {
                            let info = SessionInfo {
                                session,
                                name: None,
                                parent: None,
                                workspace,
                                cwd,
                                cols,
                                rows,
                                agent: None,
                                status: WorkspaceStatus::Idle,
                            };
                            self.state.add_session(&info, cols, rows, &[]);
                            queue.extend(self.state.select_session(session));
                        }
                        other => self.complain("cannot open a shell", other),
                    }
                }
                Action::Close { session } => {
                    // A shell that is already gone is what closing wanted.
                    self.send(Command::Close { session })?;
                    self.state.exited(session);
                }
                Action::DeleteWorkspace { workspace } => {
                    for session in self.state.tabs(Group::Workspace(workspace)) {
                        self.send(Command::Close { session })?;
                        self.state.exited(session);
                    }
                    let reply = self.send(Command::DeleteWorkspace { workspace })?;
                    self.take_tree(reply, &mut queue);
                }
                Action::CreateProject { name, path } => {
                    let reply = self.send(Command::CreateProject {
                        name,
                        path: Some(path),
                    })?;
                    self.take_tree(reply, &mut queue);
                }
                Action::CreateWorkspace { project, name } => {
                    let reply = self.send(Command::CreateWorkspace { project, name })?;
                    self.take_tree(reply, &mut queue);
                }
                Action::RenameProject { project, name } => {
                    let reply = self.send(Command::RenameProject { project, name })?;
                    self.take_tree(reply, &mut queue);
                }
                Action::RenameWorkspace { workspace, name } => {
                    let reply = self.send(Command::RenameWorkspace { workspace, name })?;
                    self.take_tree(reply, &mut queue);
                }
                Action::RenameSession { session, name } => {
                    match self.send(Command::RenameSession { session, name })? {
                        Response::Ok => self.refresh()?,
                        other => self.complain("cannot rename", other),
                    }
                }
            }
        }
        Ok(false)
    }

    /// The reply to a tree edit is the new tree; anything else is the daemon
    /// refusing, and its reason is shown rather than swallowed.
    fn take_tree(&mut self, reply: Response, queue: &mut VecDeque<Action>) {
        match reply {
            Response::State { state } => queue.extend(self.state.set_tree_selecting_new(state)),
            other => self.complain("cannot change the project tree", other),
        }
    }

    fn complain(&mut self, what: &str, reply: Response) {
        self.state.notice = Some(match reply {
            Response::Error { message } => format!("{what}: {message}"),
            other => format!("{what}: unexpected answer {other:?}"),
        });
    }
}
