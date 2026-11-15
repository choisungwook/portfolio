//! Talking to the daemon from another process.
//!
//! Blocking and thread-based on purpose: a terminal UI and a command line both
//! have one place that waits, and neither wants a runtime for that. Requests
//! are answered one at a time; events arrive on their own channel because the
//! daemon sends them whenever a shell prints.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use crate::paths;
use crate::protocol::{Command, Event, Request, Response, SessionInfo, PROTOCOL_VERSION};

/// How long `connect_or_start` waits for a freshly started daemon to listen.
const START_WAIT: Duration = Duration::from_secs(5);

/// What the daemon said about itself in the handshake.
#[derive(Debug, Clone, PartialEq)]
pub struct Hello {
    pub protocol: u32,
    /// The product version. None from a core that predates the field.
    pub version: Option<String>,
}

struct Wire {
    writer: UnixStream,
    replies: Receiver<Result<Response, String>>,
}

pub struct Client {
    /// Held across a request and its reply, which is what keeps replies lined
    /// up with requests when several threads share one client.
    wire: Mutex<Wire>,
    events: Mutex<Option<Receiver<Event>>>,
    stream: UnixStream,
}

impl Client {
    /// Connects to a daemon that is already running.
    pub fn connect(socket: &Path) -> Result<Client, String> {
        let stream = UnixStream::connect(socket)
            .map_err(|error| format!("cannot connect to {}: {error}", socket.display()))?;
        let writer = stream.try_clone().map_err(|error| error.to_string())?;
        let reader = stream.try_clone().map_err(|error| error.to_string())?;
        let (reply_tx, replies) = channel();
        let (event_tx, events) = channel();
        thread::spawn(move || {
            for line in BufReader::new(reader).lines() {
                let Ok(line) = line else { break };
                let delivered = match classify(&line) {
                    Incoming::Reply(reply) => reply_tx.send(reply).is_ok(),
                    Incoming::Event(event) => event_tx.send(event).is_ok(),
                    Incoming::Skip => true,
                };
                if !delivered {
                    break;
                }
            }
            // Dropping both senders is how the other side learns the daemon went.
        });
        Ok(Client {
            wire: Mutex::new(Wire { writer, replies }),
            events: Mutex::new(Some(events)),
            stream,
        })
    }

    /// Connects to the daemon on the default socket, starting one if none
    /// answers.
    pub fn connect_or_start() -> Result<Client, String> {
        Self::connect_or_start_at(&paths::socket_path())
    }

    /// As `connect_or_start`, for a daemon on `socket`.
    pub fn connect_or_start_at(socket: &Path) -> Result<Client, String> {
        Self::connect_or_start_with(socket, &core_binary())
    }

    /// As `connect_or_start_at`, starting `program` when nothing answers.
    pub fn connect_or_start_with(socket: &Path, program: &Path) -> Result<Client, String> {
        if let Ok(client) = Self::connect(socket) {
            return Ok(client);
        }
        let log = start_daemon(program, socket)?;
        let deadline = Instant::now() + START_WAIT;
        loop {
            match Self::connect(socket) {
                Ok(client) => return Ok(client),
                Err(error) if Instant::now() >= deadline => {
                    return Err(format!("{error}; the daemon did not come up, see {}", log.display()))
                }
                Err(_) => thread::sleep(Duration::from_millis(50)),
            }
        }
    }

    /// Asks the daemon who it is, and fails if it speaks another protocol
    /// version, naming both.
    pub fn handshake(&self) -> Result<Hello, String> {
        match self.send(Command::Hello)? {
            Response::Hello { protocol, version } if protocol == PROTOCOL_VERSION => {
                Ok(Hello { protocol, version })
            }
            Response::Hello { protocol, .. } => Err(format!(
                "protocol mismatch: this client speaks {PROTOCOL_VERSION}, the daemon speaks {protocol}"
            )),
            // A daemon on another version refuses the envelope itself.
            Response::Error { message } => Err(format!(
                "protocol mismatch: this client speaks {PROTOCOL_VERSION}; the daemon said: {message}"
            )),
            other => Err(format!("unexpected answer to hello: {other:?}")),
        }
    }

    /// Sends one command and waits for its reply. An error from the daemon
    /// arrives as `Ok(Response::Error { .. })`; `Err` means the conversation
    /// itself failed.
    pub fn send(&self, command: Command) -> Result<Response, String> {
        let request = serde_json::to_string(&Request {
            v: PROTOCOL_VERSION,
            command,
        })
        .map_err(|error| error.to_string())?;
        let mut wire = self
            .wire
            .lock()
            .map_err(|_| "the client is poisoned".to_string())?;
        wire.writer
            .write_all(request.as_bytes())
            .and_then(|_| wire.writer.write_all(b"\n"))
            .and_then(|_| wire.writer.flush())
            .map_err(|_| CLOSED.to_string())?;
        wire.replies.recv().map_err(|_| CLOSED.to_string())?
    }

    /// The next event if one is waiting. `Disconnected` means the daemon went.
    pub fn try_event(&self) -> Result<Event, TryRecvError> {
        match self.events.lock() {
            Ok(events) => match events.as_ref() {
                Some(events) => events.try_recv(),
                None => Err(TryRecvError::Disconnected),
            },
            Err(_) => Err(TryRecvError::Disconnected),
        }
    }

    /// The next event, waiting up to `timeout`.
    pub fn recv_event_timeout(&self, timeout: Duration) -> Result<Event, RecvTimeoutError> {
        match self.events.lock() {
            Ok(events) => match events.as_ref() {
                Some(events) => events.recv_timeout(timeout),
                None => Err(RecvTimeoutError::Disconnected),
            },
            Err(_) => Err(RecvTimeoutError::Disconnected),
        }
    }

    /// Hands the event channel to the caller, for a UI that wants to block on
    /// events in a thread of its own. After this `try_event` and
    /// `recv_event_timeout` report a disconnect. `None` the second time.
    pub fn take_event_receiver(&self) -> Option<Receiver<Event>> {
        self.events.lock().ok()?.take()
    }

    /// The id for a session given as a number or a name.
    pub fn session_id(&self, target: &str) -> Result<u32, String> {
        if let Ok(id) = target.parse::<u32>() {
            return Ok(id);
        }
        match self.send(Command::Sessions)? {
            Response::Sessions { sessions } => sessions
                .into_iter()
                .find(|session| session.name.as_deref() == Some(target))
                .map(|session| session.session)
                .ok_or_else(|| format!("no session named {target}")),
            Response::Error { message } => Err(message),
            other => Err(format!("unexpected answer to sessions: {other:?}")),
        }
    }

    /// Every live shell.
    pub fn sessions(&self) -> Result<Vec<SessionInfo>, String> {
        match self.send(Command::Sessions)? {
            Response::Sessions { sessions } => Ok(sessions),
            Response::Error { message } => Err(message),
            other => Err(format!("unexpected answer to sessions: {other:?}")),
        }
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // Ends the reader thread, which would otherwise wait on the daemon.
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
    }
}

/// What one line from the daemon is.
#[derive(Debug, PartialEq)]
enum Incoming {
    Reply(Result<Response, String>),
    Event(Event),
    Skip,
}

/// Sorts a line by its frame key before decoding what is inside it.
///
/// Replies are matched to requests by position, so the two kinds must not fail
/// alike. An event this client does not know is skipped, as the protocol says
/// of anything unknown, since nobody is waiting for it. A reply that cannot be
/// decoded is handed on as an error, because the caller waiting for it would
/// otherwise take the next reply for its own. A line with neither key comes
/// from a daemon too old to frame its replies, which is also a reply.
fn classify(line: &str) -> Incoming {
    let value = match serde_json::from_str::<serde_json::Value>(line) {
        Ok(value) => value,
        Err(error) => return unreadable_reply(error),
    };
    if let Some(event) = value.get("event") {
        return match serde_json::from_value::<Event>(event.clone()) {
            Ok(event) => Incoming::Event(event),
            Err(_) => Incoming::Skip,
        };
    }
    let body = value.get("reply").unwrap_or(&value);
    match serde_json::from_value::<Response>(body.clone()) {
        Ok(response) => Incoming::Reply(Ok(response)),
        Err(error) => unreadable_reply(error),
    }
}

fn unreadable_reply(error: serde_json::Error) -> Incoming {
    Incoming::Reply(Err(format!("unreadable reply from the daemon: {error}")))
}

const CLOSED: &str = "the daemon closed the connection";

/// The daemon binary: `$AKBUN_TERMINAL_CORE`, else the one beside this
/// executable, else whatever is on `PATH`.
pub fn core_binary() -> PathBuf {
    if let Some(path) = std::env::var_os("AKBUN_TERMINAL_CORE").filter(|path| !path.is_empty()) {
        return PathBuf::from(path);
    }
    if let Some(beside) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("akbun-terminal-core")))
        .filter(|path| path.is_file())
    {
        return beside;
    }
    PathBuf::from("akbun-terminal-core")
}

/// Starts the daemon in a session of its own, so closing the terminal that
/// started it does not take it down, with its output going to a log. Returns
/// the log's path.
fn start_daemon(program: &Path, socket: &Path) -> Result<PathBuf, String> {
    // A daemon on the default socket logs in the data dir. One on a socket
    // somebody chose logs beside it, so it cannot write into a directory the
    // caller never meant to use.
    let log = if socket == paths::socket_path() {
        paths::log_path()
    } else {
        socket.with_extension("log")
    };
    if let Some(parent) = log.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log)
        .map_err(|error| format!("cannot open {}: {error}", log.display()))?;
    let errors = output.try_clone().map_err(|error| error.to_string())?;

    let mut command = std::process::Command::new(program);
    command
        .arg("serve")
        .arg("--socket")
        .arg(socket)
        .stdin(Stdio::null())
        .stdout(output)
        .stderr(errors);
    // SAFETY: setsid is async-signal-safe and touches nothing in this process.
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot start {}: {error}", program.display()))?;
    // Reaps it if it exits while this process is still around, which is what a
    // second daemon losing the race for the socket does.
    thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(log)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_event_that_cannot_be_decoded_is_skipped_not_taken_for_a_reply() {
        assert_eq!(
            classify(r#"{"event":{"type":"from_the_future","x":1}}"#),
            Incoming::Skip
        );
        assert_eq!(
            classify(r#"{"event":{"type":"exited","session":4}}"#),
            Incoming::Event(Event::Exited { session: 4 })
        );
    }

    #[test]
    fn a_reply_that_cannot_be_decoded_is_an_error_reply() {
        assert_eq!(
            classify(r#"{"reply":{"type":"ok"}}"#),
            Incoming::Reply(Ok(Response::Ok))
        );
        assert!(matches!(
            classify(r#"{"reply":{"type":"from_the_future"}}"#),
            Incoming::Reply(Err(_))
        ));
        assert!(matches!(classify("not json"), Incoming::Reply(Err(_))));
    }
}
