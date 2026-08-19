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

pub struct Session {
    id: u32,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

impl Session {
    /// Starts the user's login shell under a new pty and streams its output to
    /// `events` from a reader thread.
    pub fn spawn(
        id: u32,
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
        command.cwd(if cwd.is_empty() { home_dir() } else { cwd.to_string() });
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

        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => {
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
            master: pty.master,
            writer,
            child: Arc::new(Mutex::new(child)),
        })
    }

    pub fn id(&self) -> u32 {
        self.id
    }

    pub fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.writer.write_all(bytes).map_err(|error| error.to_string())?;
        self.writer.flush().map_err(|error| error.to_string())
    }

    /// A shell that is not told the new size keeps drawing at the old one, so
    /// every interactive program in it looks broken after a window resize.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
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

fn login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}
