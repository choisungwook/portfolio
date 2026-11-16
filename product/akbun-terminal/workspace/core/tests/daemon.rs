//! The daemon as a client sees it: the real binary on a real socket.
//!
//! Every test gets its own short directory under /tmp (socket paths are limited
//! to about a hundred bytes) and points the daemon's data dir into it, so
//! nothing here can touch the real one.

use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use akbun_terminal_core::protocol::{product_version, Command, Event, Response};
use akbun_terminal_core::Client;

const BIN: &str = env!("CARGO_BIN_EXE_akbun-terminal-core");

static NEXT: AtomicU32 = AtomicU32::new(0);

struct Sandbox {
    root: PathBuf,
}

impl Sandbox {
    fn new() -> Self {
        let root = PathBuf::from(format!(
            "/tmp/akt{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(root.join("h")).unwrap();
        Self { root }
    }

    fn socket(&self) -> PathBuf {
        self.root.join("s.sock")
    }

    fn command(&self, idle_secs: &str) -> std::process::Command {
        let mut command = std::process::Command::new(BIN);
        command
            .env("AKBUN_TERMINAL_HOME", self.root.join("h"))
            .env("AKBUN_TERMINAL_SOCKET", self.socket())
            .env("AKBUN_TERMINAL_IDLE_EXIT_SECS", idle_secs)
            .env("SHELL", "/bin/sh")
            .env_remove("AKBUN_TERMINAL_SESSION")
            .stdin(Stdio::null());
        command
    }

    fn start(&self, idle_secs: &str) -> Daemon {
        let child = self
            .command(idle_secs)
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("start the daemon");
        wait_until("the daemon listens", || Client::connect(&self.socket()).is_ok());
        Daemon(child)
    }
}

impl Drop for Sandbox {
    fn drop(&mut self) {
        // A failed test may leave the daemon its CLI started, which holds shells
        // and so never goes idle on its own.
        let _ = self.command("30").arg("stop").output();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// A running daemon. Killed on drop, so a test that fails halfway does not
/// leave one behind.
struct Daemon(Child);

impl Daemon {
    fn exits_within(&mut self, secs: u64) -> Option<std::process::ExitStatus> {
        let deadline = Instant::now() + Duration::from_secs(secs);
        while Instant::now() < deadline {
            if let Some(status) = self.0.try_wait().unwrap() {
                return Some(status);
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        None
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if ready() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {what}");
}

fn connect(sandbox: &Sandbox) -> Client {
    let client = Client::connect(&sandbox.socket()).expect("connect");
    client.handshake().expect("handshake");
    client
}

fn spawn(client: &Client, workspace: Option<u64>) -> u32 {
    let response = client
        .send(Command::Spawn {
            cwd: String::new(),
            cols: 80,
            rows: 24,
            workspace,
            name: None,
            command: Vec::new(),
            parent: None,
            owned: false,
        })
        .unwrap();
    match response {
        Response::Spawned { session } => session,
        other => panic!("{other:?}"),
    }
}

fn spawn_running(client: &Client, command: &[&str], owned: bool) -> u32 {
    let response = client
        .send(Command::Spawn {
            cwd: String::new(),
            cols: 80,
            rows: 24,
            workspace: None,
            name: None,
            command: command.iter().map(|part| part.to_string()).collect(),
            parent: None,
            owned,
        })
        .unwrap();
    match response {
        Response::Spawned { session } => session,
        other => panic!("{other:?}"),
    }
}

fn type_line(client: &Client, session: u32, line: &str) {
    let bytes = format!("{line}\n").into_bytes();
    assert_eq!(
        client.send(Command::Write { session, bytes }).unwrap(),
        Response::Ok
    );
}

/// Reads output events for `session` until `needle` has shown up.
fn output_until(client: &Client, session: u32, needle: &str) -> String {
    let mut seen = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if let Ok(Event::Output { session: from, bytes }) =
            client.recv_event_timeout(Duration::from_millis(100))
        {
            if from == session {
                seen.extend(bytes);
                if String::from_utf8_lossy(&seen).contains(needle) {
                    break;
                }
            }
        }
    }
    let text = String::from_utf8_lossy(&seen).to_string();
    assert!(text.contains(needle), "wanted {needle:?}, saw {text:?}");
    text
}

#[test]
fn a_shell_outlives_its_client_and_a_new_client_sees_what_it_printed() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("30");

    let a = connect(&sandbox);
    let hello = a.handshake().unwrap();
    assert_eq!(hello.version.as_deref(), Some(product_version()));
    let session = spawn(&a, None);
    type_line(&a, session, "echo one-$((40+2))");
    output_until(&a, session, "one-42");
    drop(a);

    let b = connect(&sandbox);
    let listed = b.sessions().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].session, session);
    let Response::Attached { replay, cols, rows, .. } =
        b.send(Command::Attach { session }).unwrap()
    else {
        panic!("expected attached");
    };
    assert_eq!((cols, rows), (80, 24));
    let earlier = String::from_utf8_lossy(&replay.concat()).to_string();
    assert!(earlier.contains("one-42"), "{earlier:?}");

    type_line(&b, session, "echo two-$((50+5))");
    let live = output_until(&b, session, "two-55");
    assert!(!live.contains("one-42"), "replayed bytes arrived twice: {live:?}");

    assert_eq!(b.send(Command::Close { session }).unwrap(), Response::Ok);
    wait_until("exited", || {
        matches!(
            b.recv_event_timeout(Duration::from_millis(100)),
            Ok(Event::Exited { .. })
        )
    });

    assert_eq!(b.send(Command::Shutdown).unwrap(), Response::Ok);
    let status = daemon.exits_within(10).expect("daemon exits on shutdown");
    assert!(status.success());
    assert!(!sandbox.socket().exists());
}


#[test]
fn a_live_socket_is_refused_and_a_stale_one_is_replaced() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("30");

    let second = sandbox
        .command("30")
        .arg("serve")
        .output()
        .expect("run the second daemon");
    assert!(!second.status.success());
    assert!(
        String::from_utf8_lossy(&second.stderr).contains("already running"),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    // The first one is untouched by the attempt.
    connect(&sandbox);

    assert_eq!(connect(&sandbox).send(Command::Shutdown).unwrap(), Response::Ok);
    assert!(daemon.exits_within(10).is_some());

    // A socket file nobody listens on is what a killed daemon leaves.
    drop(std::os::unix::net::UnixListener::bind(sandbox.socket()).unwrap());
    assert!(sandbox.socket().exists());
    let mut replaced = sandbox.start("30");
    connect(&sandbox).send(Command::Shutdown).unwrap();
    assert!(replaced.exits_within(10).is_some());
}

#[test]
fn an_unused_daemon_leaves_after_its_grace_and_takes_the_socket_with_it() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("1");
    let started = Instant::now();
    // The probe in `start` was a connection, so the grace runs from after it.
    let status = daemon.exits_within(8).expect("the idle daemon exits");
    assert!(status.success());
    assert!(started.elapsed() >= Duration::from_millis(800));
    assert!(!sandbox.socket().exists());
}

#[test]
fn a_connected_client_keeps_the_daemon_up_past_the_grace() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("1");
    let client = connect(&sandbox);
    assert!(daemon.exits_within(3).is_none());
    client.send(Command::Shutdown).unwrap();
    assert!(daemon.exits_within(10).is_some());
}

#[test]
fn sigterm_ends_the_shells_and_removes_the_socket() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("30");
    let client = connect(&sandbox);
    let session = spawn(&client, None);
    type_line(&client, session, "echo pid-$$-e''nd");
    let text = output_until(&client, session, "-end");
    // The typed line is echoed too, with a literal `$$`; the answer is the
    // occurrence that is followed by digits.
    let pid: i32 = text
        .split("pid-")
        .skip(1)
        .filter_map(|rest| rest.split('-').next()?.parse().ok())
        .next()
        .expect("the shell's pid");

    // SAFETY: signalling the daemon this test started.
    unsafe { libc::kill(daemon.0.id() as i32, libc::SIGTERM) };
    let status = daemon.exits_within(10).expect("the daemon exits on SIGTERM");
    assert!(status.success());
    assert!(!sandbox.socket().exists());
    // Gone, not just signalled: kill(pid, 0) fails once the shell is reaped.
    wait_until("the shell to end", || unsafe { libc::kill(pid, 0) } != 0);
}

#[test]
fn a_shell_that_exits_is_announced_and_removed() {
    let sandbox = Sandbox::new();
    let _daemon = sandbox.start("30");
    let client = connect(&sandbox);
    let session = spawn(&client, None);
    type_line(&client, session, "exit");
    wait_until("the exit event", || {
        matches!(
            client.recv_event_timeout(Duration::from_millis(100)),
            Ok(Event::Exited { session: gone }) if gone == session
        )
    });
    assert!(client.sessions().unwrap().is_empty());
    let Response::Error { message } = client.send(Command::Close { session }).unwrap() else {
        panic!("closing a removed session should fail");
    };
    assert!(message.contains("no session"), "{message}");
    let Response::Error { .. } = client.send(Command::Attach { session }).unwrap() else {
        panic!("attaching to a removed session should fail");
    };
}

#[test]
fn each_client_gets_its_own_detect_delta_from_one_judgement() {
    let sandbox = Sandbox::new();
    let _daemon = sandbox.start("30");
    let a = connect(&sandbox);
    let b = connect(&sandbox);
    spawn(&a, Some(7));

    let detect = |client: &Client| match client.send(Command::Detect).unwrap() {
        Response::Statuses { statuses } => statuses,
        other => panic!("{other:?}"),
    };
    let first = detect(&a);
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].workspace, 7);
    assert!(detect(&a).is_empty());
    // B has not been told anything yet, whatever A has heard.
    assert_eq!(detect(&b).len(), 1);
    assert!(detect(&b).is_empty());
}

#[test]
fn a_tree_edit_reaches_the_other_client_and_a_second_load_does_not_clobber_it() {
    let sandbox = Sandbox::new();
    let _daemon = sandbox.start("30");
    let a = connect(&sandbox);
    let b = connect(&sandbox);
    let directory = sandbox.root.join("state").to_string_lossy().to_string();
    let load = |client: &Client| match client
        .send(Command::LoadState {
            directory: directory.clone(),
        })
        .unwrap()
    {
        Response::State { state } => state,
        other => panic!("{other:?}"),
    };
    load(&a);
    let Response::State { .. } = a
        .send(Command::CreateProject {
            name: "akbun".into(),
            path: None,
        })
        .unwrap()
    else {
        panic!("expected state");
    };
    let Ok(Event::State { state }) = b.recv_event_timeout(Duration::from_secs(5)) else {
        panic!("b should be told about the new project");
    };
    assert_eq!(state.projects[0].name, "akbun");
    assert!(a.recv_event_timeout(Duration::from_millis(300)).is_err());

    // B loading the same directory sees the live tree, and A hears nothing.
    assert_eq!(load(&b).projects.len(), 1);
    assert!(a.recv_event_timeout(Duration::from_millis(300)).is_err());
}

fn cli(sandbox: &Sandbox, args: &[&str]) -> std::process::Output {
    sandbox
        .command("30")
        .args(args)
        .output()
        .expect("run the cli")
}

fn stdout(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[test]
fn the_cli_starts_a_helper_types_into_it_and_reads_its_screen() {
    let sandbox = Sandbox::new();
    // `run` starts the daemon itself, detached, from the binary beside it.
    let run = cli(
        &sandbox,
        &["run", "--name", "echoer", "--", "sh", "-c", "read x; echo got:$x; sleep 30"],
    );
    assert!(run.status.success(), "{}", String::from_utf8_lossy(&run.stderr));
    let id: u32 = stdout(&run).parse().expect("run prints the session id");

    let listing = stdout(&cli(&sandbox, &["ls"]));
    assert!(listing.contains("echoer"), "{listing}");
    let json: serde_json::Value =
        serde_json::from_str(&stdout(&cli(&sandbox, &["ls", "--json"]))).unwrap();
    assert_eq!(json[0]["session"], id);
    assert_eq!(json[0]["name"], "echoer");

    let send = cli(&sandbox, &["send", "echoer", "hello"]);
    assert!(send.status.success(), "{}", String::from_utf8_lossy(&send.stderr));
    wait_until("the helper to answer", || {
        stdout(&cli(&sandbox, &["read", &id.to_string()])).contains("got:hello")
    });

    assert!(cli(&sandbox, &["kill", "echoer"]).status.success());
    assert!(stdout(&cli(&sandbox, &["ls"])).is_empty());
    assert!(cli(&sandbox, &["stop"]).status.success());
    assert!(!sandbox.socket().exists());
}

#[test]
fn the_cli_wait_times_out_with_exit_code_two_while_an_agent_works() {
    let sandbox = Sandbox::new();
    // A rule that calls anything running `sleep` an agent that is working while
    // its marker is on screen.
    let agents = sandbox.root.join("h/agents");
    std::fs::create_dir_all(&agents).unwrap();
    std::fs::write(
        agents.join("t.json"),
        r#"{"name":"T","processes":["sleep"],"running":["running-marker"]}"#,
    )
    .unwrap();

    let run = cli(
        &sandbox,
        &["run", "--name", "w", "--", "sh", "-c", "sleep 30 & echo running-marker; wait"],
    );
    assert!(run.status.success(), "{}", String::from_utf8_lossy(&run.stderr));
    wait_until("the marker", || stdout(&cli(&sandbox, &["read", "w"])).contains("running-marker"));

    let waited = cli(&sandbox, &["wait", "w", "--timeout", "1"]);
    assert_eq!(waited.status.code(), Some(2), "{}", stdout(&waited));
    assert_eq!(stdout(&waited), "timeout running");
    let listing = stdout(&cli(&sandbox, &["ls"]));
    assert!(listing.contains("running"), "{listing}");
    assert!(listing.contains('T'), "{listing}");

    assert!(cli(&sandbox, &["stop"]).status.success());
}

#[test]
fn a_client_can_start_the_daemon_for_itself() {
    let sandbox = Sandbox::new();
    // A wrapper so the daemon the client starts uses the sandbox's data dir
    // rather than the real one.
    let wrapper = sandbox.root.join("core.sh");
    std::fs::write(
        &wrapper,
        format!(
            "#!/bin/sh\nexec env AKBUN_TERMINAL_HOME={} AKBUN_TERMINAL_IDLE_EXIT_SECS=2 {BIN} \"$@\"\n",
            sandbox.root.join("h").display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&wrapper, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();

    let client = Client::connect_or_start_with(&sandbox.socket(), &wrapper).expect("start");
    client.handshake().unwrap();
    assert_eq!(client.send(Command::Shutdown).unwrap(), Response::Ok);
    wait_until("the socket to go", || !sandbox.socket().exists());
}

#[test]
fn a_write_to_a_shell_that_is_not_reading_does_not_stall_the_daemon() {
    let sandbox = Sandbox::new();
    let mut daemon = sandbox.start("30");
    let writer = std::sync::Arc::new(connect(&sandbox));
    let other = connect(&sandbox);
    // Raw and without echo, so what is written piles up in the pty rather than
    // being discarded as an over-long line; `sleep` never reads it.
    let session = spawn_running(
        &writer,
        &["sh", "-c", "stty raw -echo; echo ready; exec sleep 30"],
        false,
    );
    output_until(&writer, session, "ready");

    let blocked = {
        let writer = std::sync::Arc::clone(&writer);
        std::thread::spawn(move || {
            writer.send(Command::Write {
                session,
                bytes: vec![b'x'; 512 * 1024],
            })
        })
    };
    std::thread::sleep(Duration::from_millis(500));
    assert!(!blocked.is_finished(), "the pty took everything, so nothing is blocked");

    // Other connections get answers while that write is stuck.
    let started = Instant::now();
    assert_eq!(other.sessions().unwrap().len(), 1);
    assert!(matches!(
        other.send(Command::Detect).unwrap(),
        Response::Statuses { .. }
    ));
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "commands waited {:?} behind a stuck write",
        started.elapsed()
    );

    // And so does shutdown, which ends the shell and frees the write.
    assert_eq!(other.send(Command::Shutdown).unwrap(), Response::Ok);
    assert!(daemon.exits_within(10).is_some());
    let _ = blocked.join();
}

#[test]
fn an_owned_shell_ends_with_its_connection_and_the_others_stay() {
    let sandbox = Sandbox::new();
    let _daemon = sandbox.start("30");
    let pid_file = sandbox.root.join("owned.pid");
    let script = format!("echo $$ > {}; exec sleep 30", pid_file.display());

    let spawner = connect(&sandbox);
    let owned = spawn_running(&spawner, &["sh", "-c", &script], true);
    let kept = spawn_running(&spawner, &["sleep", "30"], false);

    let watcher = connect(&sandbox);
    assert!(matches!(
        watcher.send(Command::Attach { session: owned }).unwrap(),
        Response::Attached { .. }
    ));
    wait_until("the owned shell to start", || pid_file.exists());
    let pid: i32 = loop {
        if let Some(pid) = std::fs::read_to_string(&pid_file)
            .ok()
            .and_then(|text| text.trim().parse().ok())
        {
            break pid;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(watcher.sessions().unwrap().len(), 2);

    drop(spawner);
    wait_until("the owned shell's exit", || {
        matches!(
            watcher.recv_event_timeout(Duration::from_millis(100)),
            Ok(Event::Exited { session }) if session == owned
        )
    });
    let left = watcher.sessions().unwrap();
    assert_eq!(left.iter().map(|info| info.session).collect::<Vec<_>>(), [kept]);
    // Gone and reaped: a zombie would still answer to signal 0.
    wait_until("the process to be reaped", || {
        // SAFETY: signal 0 only checks whether the process exists.
        let gone = unsafe { libc::kill(pid, 0) } == -1;
        gone
    });
}
