//! One shell process behind a pty, owned by the core.
//!
//! The core owns this rather than the view for two reasons. A terminal view is
//! meant to be swapped, and nothing that survives a swap should live inside it.
//! And the state detection this product is built for has to read what the shell
//! writes, which is only possible where the bytes already pass through.

use std::io::{Read, Write};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};

use crate::protocol::Event;
use crate::screen::Screen;

/// What a session is started with, besides where it draws.
#[derive(Default)]
pub struct Launch {
    /// Which workspace this shell is judged under. None when the shell that
    /// spawned it does not track workspaces.
    pub workspace: Option<u64>,
    pub name: Option<String>,
    pub parent: Option<u32>,
    /// argv run instead of the login shell. Empty means the shell itself.
    pub command: Vec<String>,
}

pub struct Session {
    id: u32,
    workspace: Option<u64>,
    name: Option<String>,
    parent: Option<u32>,
    cwd: String,
    size: Mutex<(u16, u16)>,
    master: Box<dyn MasterPty + Send>,
    /// Shared so a slow typed message can write without holding the table of
    /// sessions for its whole duration.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Held by whoever is feeding the shell a unit of input that must not be
    /// split, such as a typed message and its return. Separate from `writer`
    /// because a message waits between its two writes and the writer lock is
    /// only ever held for one.
    input: Arc<Mutex<()>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    /// The interpreted screen, kept up to date on the reader thread so that
    /// detection never sits on the path that draws output.
    screen: Arc<Mutex<Screen>>,
}

impl Session {
    /// Starts the user's login shell under a new pty and streams its output to
    /// `events` from a reader thread.
    pub fn spawn(
        id: u32,
        launch: Launch,
        cwd: &str,
        cols: u16,
        rows: u16,
        events: Sender<Event>,
    ) -> Result<Self, String> {
        let pty = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())?;

        let mut command = CommandBuilder::new(login_shell());
        // A login shell reads the user's profile, which is the point of wrapping
        // the terminal at all; without it the aliases and PATH are not theirs.
        command.arg("-l");
        if !launch.command.is_empty() {
            // Through the login shell rather than directly, so the program is
            // found on the user's PATH. `--` fills `$0`, leaving argv as `$@`.
            command.args(["-c", r#"exec "$@""#, "--"]);
            command.args(&launch.command);
        }
        let cwd = if cwd.is_empty() { home_dir() } else { cwd.to_string() };
        command.cwd(&cwd);
        command.env("AKBUN_TERMINAL_SESSION", id.to_string());
        // A GUI app is launched by launchd, not by a terminal, so it inherits no
        // TERM. Without it the shell and everything under it think they are on a
        // dumb terminal: `clear` refuses to run and full screen programs draw
        // nothing. The value names what the view on the other side can actually
        // interpret, so it belongs here rather than in the user's profile.
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");

        let child = pty.slave.spawn_command(command).map_err(|error| error.to_string())?;
        let writer = pty.master.take_writer().map_err(|error| error.to_string())?;
        let mut reader = pty.master.try_clone_reader().map_err(|error| error.to_string())?;

        let screen = Arc::new(Mutex::new(Screen::new(cols, rows)));
        let feeding = Arc::clone(&screen);
        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => {
                        if let Ok(mut screen) = feeding.lock() {
                            screen.feed(&buffer[..read]);
                        }
                        if events
                            .send(Event::Output {
                                session: id,
                                bytes: buffer[..read].to_vec(),
                            })
                            .is_err()
                        {
                            // The core is gone, so there is nobody left to tell.
                            return;
                        }
                    }
                }
            }
            let _ = events.send(Event::Exited { session: id });
        });

        Ok(Self {
            id,
            workspace: launch.workspace,
            name: launch.name,
            parent: launch.parent,
            cwd,
            size: Mutex::new((cols, rows)),
            master: pty.master,
            writer: Arc::new(Mutex::new(writer)),
            input: Arc::new(Mutex::new(())),
            child: Arc::new(Mutex::new(child)),
            screen,
        })
    }

    pub fn id(&self) -> u32 {
        self.id
    }

    pub fn workspace(&self) -> Option<u64> {
        self.workspace
    }

    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    pub fn set_name(&mut self, name: Option<String>) {
        self.name = name;
    }

    pub fn parent(&self) -> Option<u32> {
        self.parent
    }

    pub fn cwd(&self) -> &str {
        &self.cwd
    }

    pub fn size(&self) -> (u16, u16) {
        self.size.lock().map(|size| *size).unwrap_or((0, 0))
    }

    /// Whether the program in this shell has asked for bracketed paste.
    pub fn bracketed_paste(&self) -> bool {
        self.screen
            .lock()
            .map(|screen| screen.bracketed_paste())
            .unwrap_or(false)
    }

    pub fn writer(&self) -> Arc<Mutex<Box<dyn Write + Send>>> {
        Arc::clone(&self.writer)
    }

    pub fn input(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.input)
    }

    /// The shell's pid, which is the root of the tree an agent runs somewhere in.
    pub fn pid(&self) -> Option<u32> {
        self.child.lock().ok().and_then(|child| child.process_id())
    }

    /// What this shell has on screen right now.
    pub fn screen_text(&self) -> String {
        self.screen
            .lock()
            .map(|screen| screen.text())
            .unwrap_or_default()
    }

    /// A shell that is not told the new size keeps drawing at the old one, so
    /// every interactive program in it looks broken after a window resize.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        if let Ok(mut screen) = self.screen.lock() {
            screen.resize(cols, rows);
        }
        if let Ok(mut size) = self.size.lock() {
            *size = (cols, rows);
        }
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())
    }

    /// Ends the shell and reaps it. Without the wait the process would linger as
    /// a zombie, and closing tabs all day is how a session list quietly fills up.
    pub fn kill(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Writes through a shared writer handle, as `Session::write` does.
pub fn write_all(writer: &Mutex<Box<dyn Write + Send>>, bytes: &[u8]) -> Result<(), String> {
    let mut writer = writer.lock().map_err(|_| "session writer is poisoned".to_string())?;
    writer.write_all(bytes).map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}
