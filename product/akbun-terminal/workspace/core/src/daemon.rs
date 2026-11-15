//! The socket server: what keeps shells alive after every client has gone.
//!
//! One thread per connection reads requests; a pump moves shell events into the
//! hub; a timer keeps agent judgements current. The deciding is in [`Hub`] and
//! [`App`]. What is here is plumbing: the socket, the threads, and the ways the
//! process can end.

use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, FileTypeExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::app::{App, Told};
use crate::hub::{ConnId, Hub};
use crate::protocol::{parse_request, Command, Event, Response};

/// How long the daemon stays up with no connection and no shell.
const DEFAULT_IDLE_EXIT: Duration = Duration::from_secs(10);

/// How often shells are judged while any exist.
const JUDGE_EVERY: Duration = Duration::from_secs(2);

pub struct Config {
    pub socket: PathBuf,
    pub idle_exit: Duration,
    /// Where agent rules are read from at start. None leaves them unloaded
    /// until a client sends `load_rules`.
    pub agents_dir: Option<PathBuf>,
}

impl Config {
    /// The idle grace comes from `AKBUN_TERMINAL_IDLE_EXIT_SECS` when set, so a
    /// test does not have to wait ten seconds to see the daemon leave.
    pub fn new(socket: PathBuf, agents_dir: Option<PathBuf>) -> Self {
        let idle_exit = std::env::var("AKBUN_TERMINAL_IDLE_EXIT_SECS")
            .ok()
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|secs| secs.is_finite() && *secs >= 0.0)
            .map(Duration::from_secs_f64)
            .unwrap_or(DEFAULT_IDLE_EXIT);
        Self {
            socket,
            idle_exit,
            agents_dir,
        }
    }
}

/// Decides when an unused daemon should go. Kept apart from the clock so it can
/// be tested without waiting.
struct IdleClock {
    grace: Duration,
    idle_since: Option<Instant>,
}

impl IdleClock {
    fn expired(&mut self, now: Instant, busy: bool) -> bool {
        if busy {
            self.idle_since = None;
            return false;
        }
        let since = *self.idle_since.get_or_insert(now);
        now.saturating_duration_since(since) >= self.grace
    }
}

enum Stop {
    Shutdown,
    Signal,
}

enum Flow {
    Continue,
    Shutdown,
}

struct Daemon {
    app: App,
    hub: Hub,
    running: AtomicBool,
    /// Held from a tree edit until its `state` event is queued, so two edits
    /// made at once reach every other client in the order they were applied.
    tree_order: Mutex<()>,
}

impl Daemon {
    fn handle(&self, conn: ConnId, line: &str, told: &mut Told) -> Flow {
        let command = match parse_request(line) {
            Ok(command) => command,
            Err(message) => {
                self.hub.reply(conn, &Response::Error { message });
                return Flow::Continue;
            }
        };
        match command {
            spawn @ Command::Spawn { .. } => {
                self.hub
                    .reply_subscribing(conn, || self.app.execute(spawn));
            }
            Command::Attach { session } => {
                self.hub
                    .attach(conn, session, || self.app.session_size(session));
            }
            Command::Detach { session } => {
                self.hub.detach(conn, session);
                self.hub.reply(conn, &Response::Ok);
            }
            Command::Shutdown => {
                self.hub.reply(conn, &Response::Ok);
                return Flow::Shutdown;
            }
            Command::Detect => {
                let statuses = self.app.detect_for(told);
                self.hub.reply(conn, &Response::Statuses { statuses });
            }
            edit if edit.mutates_tree() => {
                let _in_order = self.tree_order.lock();
                let response = self.app.execute(edit);
                self.hub.reply(conn, &response);
                if let Response::State { state } = response {
                    self.hub.broadcast_except(conn, &Event::State { state });
                }
            }
            other => {
                let response = self.app.execute(other);
                self.hub.reply(conn, &response);
            }
        }
        Flow::Continue
    }

    /// Moves shell events to the hub. A shell that exited is taken out of the
    /// app first, so that a client attaching a moment later is refused rather
    /// than subscribed to something whose exit has already been announced.
    fn pump(&self) {
        while self.running.load(Ordering::SeqCst) {
            let Some(event) = self.app.next_event(Duration::from_millis(200)) else {
                continue;
            };
            if let Event::Exited { session } = &event {
                self.app.remove_session(*session);
            }
            self.hub.publish(&event);
        }
    }

    /// Judges on its own schedule, so `wait` and `sessions` are current even
    /// when no client asks `detect`.
    fn judge_periodically(&self) {
        let mut waited = Duration::ZERO;
        while self.running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(100));
            waited += Duration::from_millis(100);
            if waited >= JUDGE_EVERY {
                waited = Duration::ZERO;
                if self.app.session_count() > 0 {
                    self.app.judgement();
                }
            }
        }
    }
}

/// Runs until told to stop, idle, or signalled. Returns once the shells are
/// ended and the socket is removed.
pub fn serve(config: Config) -> Result<(), String> {
    let listener = bind(&config.socket)?;
    let (stop_tx, stop_rx) = channel::<Stop>();
    watch_signals(stop_tx.clone())?;

    let daemon = Arc::new(Daemon {
        app: App::new(),
        hub: Hub::default(),
        running: AtomicBool::new(true),
        tree_order: Mutex::new(()),
    });
    if let Some(directory) = &config.agents_dir {
        let loaded = daemon.app.execute(Command::LoadRules {
            directory: directory.to_string_lossy().to_string(),
        });
        if let Response::Error { message } = loaded {
            log(&format!("agent rules not loaded: {message}"));
        }
    }
    {
        let daemon = Arc::clone(&daemon);
        thread::spawn(move || daemon.pump());
    }
    {
        let daemon = Arc::clone(&daemon);
        thread::spawn(move || daemon.judge_periodically());
    }
    {
        let daemon = Arc::clone(&daemon);
        let stop = stop_tx.clone();
        thread::spawn(move || accept_loop(listener, daemon, stop));
    }
    log(&format!("listening on {}", config.socket.display()));

    let mut idle = IdleClock {
        grace: config.idle_exit,
        idle_since: None,
    };
    let reason = loop {
        match stop_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Stop::Shutdown) => break "shutdown requested",
            Ok(Stop::Signal) => break "signal",
            Err(RecvTimeoutError::Disconnected) => break "stop channel closed",
            Err(RecvTimeoutError::Timeout) => {}
        }
        let busy = daemon.hub.connection_count() > 0 || daemon.app.session_count() > 0;
        if idle.expired(Instant::now(), busy) {
            break "idle";
        }
    };
    log(&format!("stopping: {reason}"));
    daemon.running.store(false, Ordering::SeqCst);
    daemon.app.shutdown();
    let _ = fs::remove_file(&config.socket);
    Ok(())
}

fn accept_loop(listener: UnixListener, daemon: Arc<Daemon>, stop: Sender<Stop>) {
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let daemon = Arc::clone(&daemon);
                let stop = stop.clone();
                thread::spawn(move || {
                    if let Err(error) = connection(stream, &daemon, &stop) {
                        log(&format!("connection failed: {error}"));
                    }
                });
            }
            Err(error) => log(&format!("accept failed: {error}")),
        }
    }
}

/// Reads one client's requests until it goes away. Writing is a second thread
/// on the hub's queue, so a client that stops reading stalls only itself.
fn connection(stream: UnixStream, daemon: &Daemon, stop: &Sender<Stop>) -> Result<(), String> {
    let closer = stream.try_clone().map_err(|error| error.to_string())?;
    let mut out = stream.try_clone().map_err(|error| error.to_string())?;
    let (conn, lines) = daemon.hub.register(move || {
        let _ = closer.shutdown(std::net::Shutdown::Both);
    });
    let writer = thread::spawn(move || {
        for line in lines.iter() {
            if out
                .write_all(line.as_bytes())
                .and_then(|_| out.write_all(b"\n"))
                .and_then(|_| out.flush())
                .is_err()
            {
                let _ = out.shutdown(std::net::Shutdown::Both);
                return;
            }
        }
    });

    let mut told = Told::default();
    let mut flow = Flow::Continue;
    for line in BufReader::new(&stream).lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        flow = daemon.handle(conn, &line, &mut told);
        if matches!(flow, Flow::Shutdown) {
            break;
        }
    }
    // Closing the queue lets the writer finish what it was given, which for a
    // shutdown includes the reply to the request that asked for it.
    daemon.hub.unregister(conn);
    let _ = writer.join();
    let _ = stream.shutdown(std::net::Shutdown::Both);
    if matches!(flow, Flow::Shutdown) {
        let _ = stop.send(Stop::Shutdown);
    }
    Ok(())
}

/// Binds the socket, replacing one that nothing answers on.
///
/// Two daemons started at once must not both decide the other's socket is
/// stale, so the check and the bind happen under a lock on the directory.
fn bind(socket: &Path) -> Result<UnixListener, String> {
    let directory = match socket.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(directory)
        .map_err(|error| format!("cannot create {}: {error}", directory.display()))?;
    let lock = File::open(directory).map_err(|error| error.to_string())?;
    // SAFETY: flock on a descriptor this function owns.
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX) } != 0 {
        return Err(format!("cannot lock {}", directory.display()));
    }

    if let Ok(metadata) = fs::symlink_metadata(socket) {
        if !metadata.file_type().is_socket() {
            return Err(format!("{} exists and is not a socket", socket.display()));
        }
        match UnixStream::connect(socket) {
            Ok(_) => {
                return Err(format!(
                    "a daemon is already running on {}",
                    socket.display()
                ))
            }
            Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {
                fs::remove_file(socket).map_err(|error| error.to_string())?;
            }
            Err(error) => {
                return Err(format!("cannot tell if {} is in use: {error}", socket.display()))
            }
        }
    }

    // The socket is created with the process umask, so tighten it for the
    // moment of the bind rather than chmod afterwards and leave a window.
    // SAFETY: umask only changes this process's file creation mask.
    let previous = unsafe { libc::umask(0o177) };
    let bound = UnixListener::bind(socket);
    unsafe { libc::umask(previous) };
    bound.map_err(|error| format!("cannot bind {}: {error}", socket.display()))
}

static SIGNAL_PIPE: AtomicI32 = AtomicI32::new(-1);

extern "C" fn on_signal(_signal: libc::c_int) {
    let fd = SIGNAL_PIPE.load(Ordering::Relaxed);
    if fd >= 0 {
        let byte = 1u8;
        // SAFETY: write is async-signal-safe and `byte` outlives the call.
        unsafe { libc::write(fd, (&byte as *const u8).cast(), 1) };
    }
}

/// Turns SIGTERM and SIGINT into a message on the stop channel. The handler
/// only writes to a pipe, because almost nothing else is safe in one.
fn watch_signals(stop: Sender<Stop>) -> Result<(), String> {
    let mut fds = [0 as libc::c_int; 2];
    // SAFETY: `fds` has room for the two descriptors pipe writes.
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
        return Err("cannot create the signal pipe".to_string());
    }
    SIGNAL_PIPE.store(fds[1], Ordering::Relaxed);
    for signal in [libc::SIGTERM, libc::SIGINT] {
        // SAFETY: a zeroed sigaction is a valid starting point, and the handler
        // is an `extern "C"` function that stays valid for the process.
        unsafe {
            let mut action: libc::sigaction = std::mem::zeroed();
            action.sa_sigaction = on_signal as *const () as usize;
            libc::sigemptyset(&mut action.sa_mask);
            action.sa_flags = libc::SA_RESTART;
            libc::sigaction(signal, &action, std::ptr::null_mut());
        }
    }
    let read_end = fds[0];
    thread::spawn(move || {
        let mut byte = 0u8;
        loop {
            // SAFETY: reads one byte into `byte` from the pipe's read end.
            let read = unsafe { libc::read(read_end, (&mut byte as *mut u8).cast(), 1) };
            if read == 1 {
                let _ = stop.send(Stop::Signal);
                return;
            }
            if read < 0 && std::io::Error::last_os_error().kind() != std::io::ErrorKind::Interrupted {
                return;
            }
        }
    });
    Ok(())
}

/// Daemon output goes to the log file, so lines say when they happened.
fn log(message: &str) {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    eprintln!("{seconds} {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_daemon_leaves_only_after_a_full_idle_grace() {
        let start = Instant::now();
        let mut clock = IdleClock {
            grace: Duration::from_secs(10),
            idle_since: None,
        };
        assert!(!clock.expired(start, false));
        assert!(!clock.expired(start + Duration::from_secs(9), false));
        assert!(clock.expired(start + Duration::from_secs(10), false));
    }

    #[test]
    fn any_connection_or_shell_restarts_the_idle_grace() {
        let start = Instant::now();
        let mut clock = IdleClock {
            grace: Duration::from_secs(10),
            idle_since: None,
        };
        assert!(!clock.expired(start, false));
        assert!(!clock.expired(start + Duration::from_secs(8), true));
        // Idle again at +9s, so the grace runs from there, not from the start.
        assert!(!clock.expired(start + Duration::from_secs(9), false));
        assert!(!clock.expired(start + Duration::from_secs(18), false));
        assert!(clock.expired(start + Duration::from_secs(19), false));
    }
}
