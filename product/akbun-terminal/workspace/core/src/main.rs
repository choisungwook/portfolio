//! The `akbun-terminal-core` command: the daemon, and a thin client for it.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::{Duration, Instant};

use akbun_terminal_core::client::Client;
use akbun_terminal_core::daemon::{serve, Config};
use akbun_terminal_core::protocol::{
    product_version, Command, Response, SessionInfo, WaitReason, PROTOCOL_VERSION,
};
use akbun_terminal_core::paths;

const SKILL: &str = include_str!("SKILL.md");

const HELP: &str = "\
akbun-terminal-core: the daemon behind akbun-terminal, and a client for it.

Usage: akbun-terminal-core [--socket PATH] <command>

  serve                       run the daemon in the foreground
  stop                        end every shell and the daemon
  ls [--json]                 list sessions: id, name, parent, agent, status, cwd
  run [--name N] [--cwd DIR] [--workspace ID] [--] <cmd> [args...]
                              start a session running cmd, print its id
  send <t> <text...>          type text into a session and submit it
  read <t>                    print what a session shows on screen
  wait <t> [--timeout SECS]   block until it stops, exits or times out (exit 2)
  kill <t>                    end a session
  skill                       print a manual for agents
  version                     print the version

<t> is a session id or name. The socket is --socket, else $AKBUN_TERMINAL_SOCKET,
else core.sock in the data dir ($AKBUN_TERMINAL_HOME or the platform default).
";

fn main() -> ExitCode {
    match run(std::env::args().skip(1).collect()) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("akbun-terminal-core: {message}");
            ExitCode::from(1)
        }
    }
}

/// Takes `--socket PATH` out of `args`, wherever it is before a `--`.
fn take_socket(args: &mut Vec<String>) -> Result<Option<PathBuf>, String> {
    let end = args.iter().position(|arg| arg == "--").unwrap_or(args.len());
    let Some(at) = args[..end].iter().position(|arg| arg == "--socket") else {
        return Ok(None);
    };
    if at + 1 >= end {
        return Err("--socket needs a path".to_string());
    }
    let path = args.remove(at + 1);
    args.remove(at);
    Ok(Some(PathBuf::from(path)))
}

/// Takes `--flag VALUE` out of `args` before a `--`.
fn take_value(args: &mut Vec<String>, flag: &str) -> Result<Option<String>, String> {
    let end = args.iter().position(|arg| arg == "--").unwrap_or(args.len());
    let Some(at) = args[..end].iter().position(|arg| arg == flag) else {
        return Ok(None);
    };
    if at + 1 >= end {
        return Err(format!("{flag} needs a value"));
    }
    let value = args.remove(at + 1);
    args.remove(at);
    Ok(Some(value))
}

fn run(mut args: Vec<String>) -> Result<u8, String> {
    let socket = take_socket(&mut args)?.unwrap_or_else(paths::socket_path);
    let Some(command) = args.first().cloned() else {
        print!("{HELP}");
        return Ok(0);
    };
    args.remove(0);
    match command.as_str() {
        "--help" | "-h" | "help" => {
            print!("{HELP}");
            Ok(0)
        }
        "version" | "--version" => {
            println!(
                "akbun-terminal-core {} (protocol {PROTOCOL_VERSION})",
                product_version()
            );
            Ok(0)
        }
        "skill" => {
            print!("{SKILL}");
            Ok(0)
        }
        "serve" => {
            serve(Config::new(socket, Some(paths::agents_dir())))?;
            Ok(0)
        }
        "stop" => stop(&socket),
        "ls" => ls(&socket, args.iter().any(|arg| arg == "--json")),
        "run" => start(&socket, args),
        "send" => {
            let target = args.first().ok_or("send needs a session and text")?.clone();
            if args.len() < 2 {
                return Err("send needs a session and text".to_string());
            }
            let client = open(&socket, false)?;
            let session = client.session_id(&target)?;
            let from = std::env::var("AKBUN_TERMINAL_SESSION")
                .ok()
                .and_then(|id| id.parse().ok());
            ok(client.send(Command::Send {
                session,
                text: args[1..].join(" "),
                from,
            }))
        }
        "read" => {
            let target = args.first().ok_or("read needs a session")?;
            let client = open(&socket, false)?;
            let session = client.session_id(target)?;
            match client.send(Command::Read { session })? {
                Response::Text { text } => {
                    println!("{}", text.trim_end());
                    Ok(0)
                }
                other => Err(unexpected(other)),
            }
        }
        "wait" => {
            let timeout = take_value(&mut args, "--timeout")?
                .map(|value| value.parse::<u64>().map_err(|_| format!("bad timeout {value}")))
                .transpose()?;
            let target = args.first().ok_or("wait needs a session")?;
            let client = open(&socket, false)?;
            let session = client.session_id(target)?;
            match client.send(Command::Wait {
                session,
                timeout_secs: timeout,
            })? {
                Response::Waited { reason, status } => {
                    let reason_name = match reason {
                        WaitReason::Stopped => "stopped",
                        WaitReason::Exited => "exited",
                        WaitReason::Timeout => "timeout",
                    };
                    println!("{reason_name} {}", status_name(status));
                    Ok(if reason == WaitReason::Timeout { 2 } else { 0 })
                }
                other => Err(unexpected(other)),
            }
        }
        "kill" => {
            let target = args.first().ok_or("kill needs a session")?;
            let client = open(&socket, false)?;
            let session = client.session_id(target)?;
            ok(client.send(Command::Close { session }))
        }
        other => Err(format!("unknown command {other}; try --help")),
    }
}

/// Connects and checks the protocol. Only `run` starts a daemon; asking
/// about sessions of a daemon that is not there should say so, not make one.
fn open(socket: &Path, start: bool) -> Result<Client, String> {
    let client = if start {
        Client::connect_or_start_at(socket)?
    } else {
        Client::connect(socket).map_err(|_| "the daemon is not running".to_string())?
    };
    client.handshake()?;
    Ok(client)
}

fn ok(response: Result<Response, String>) -> Result<u8, String> {
    match response? {
        Response::Ok => Ok(0),
        other => Err(unexpected(other)),
    }
}

fn unexpected(response: Response) -> String {
    match response {
        Response::Error { message } => message,
        other => format!("unexpected answer: {other:?}"),
    }
}

fn status_name(status: akbun_terminal_core::WorkspaceStatus) -> String {
    serde_json::to_value(status)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn stop(socket: &Path) -> Result<u8, String> {
    let Ok(client) = Client::connect(socket) else {
        eprintln!("akbun-terminal-core: the daemon is not running");
        return Ok(0);
    };
    ok(client.send(Command::Shutdown))?;
    drop(client);
    // The reply comes before the shells are ended, so wait for the socket to go
    // to make `stop` mean stopped.
    let deadline = Instant::now() + Duration::from_secs(10);
    while socket.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    if socket.exists() {
        return Err("the daemon did not stop in time".to_string());
    }
    Ok(0)
}

fn ls(socket: &Path, json: bool) -> Result<u8, String> {
    let client = open(socket, false)?;
    let sessions = client.sessions()?;
    if json {
        println!("{}", serde_json::to_string(&sessions).map_err(|e| e.to_string())?);
        return Ok(0);
    }
    for line in table(&sessions) {
        println!("{line}");
    }
    Ok(0)
}

/// One line per session, columns padded to the widest value. Empty fields are
/// `-` so every line has the same number of words.
fn table(sessions: &[SessionInfo]) -> Vec<String> {
    let rows: Vec<[String; 6]> = sessions
        .iter()
        .map(|session| {
            let dash = |value: Option<String>| value.unwrap_or_else(|| "-".to_string());
            [
                session.session.to_string(),
                dash(session.name.clone()),
                dash(session.parent.map(|parent| parent.to_string())),
                dash(session.agent.as_ref().map(|agent| agent.replace(' ', "_"))),
                status_name(session.status),
                session.cwd.clone(),
            ]
        })
        .collect();
    let widths: Vec<usize> = (0..5)
        .map(|column| rows.iter().map(|row| row[column].len()).max().unwrap_or(0))
        .collect();
    rows.iter()
        .map(|row| {
            let mut line = String::new();
            for (column, width) in widths.iter().enumerate() {
                line.push_str(&format!("{:<width$}  ", row[column], width = width));
            }
            line.push_str(&row[5]);
            line
        })
        .collect()
}

fn start(socket: &Path, mut args: Vec<String>) -> Result<u8, String> {
    // Options come first and the program starts at the first word that is not
    // one, so `run sh -c ...` works without a `--`.
    let mut name = None;
    let mut cwd = None;
    let mut workspace = None;
    while let Some(first) = args.first().cloned() {
        match first.as_str() {
            "--" => {
                args.remove(0);
                break;
            }
            "--name" | "--cwd" | "--workspace" => {
                if args.len() < 2 {
                    return Err(format!("{first} needs a value"));
                }
                let value = args.remove(1);
                args.remove(0);
                match first.as_str() {
                    "--name" => name = Some(value),
                    "--cwd" => cwd = Some(value),
                    _ => {
                        workspace = Some(
                            value
                                .parse::<u64>()
                                .map_err(|_| format!("bad workspace id {value}"))?,
                        )
                    }
                }
            }
            _ => break,
        }
    }
    if args.is_empty() {
        return Err("run needs a command".to_string());
    }
    let cwd = match cwd {
        Some(cwd) => cwd,
        None => std::env::current_dir()
            .map(|dir| dir.to_string_lossy().to_string())
            .unwrap_or_default(),
    };
    let parent = std::env::var("AKBUN_TERMINAL_SESSION")
        .ok()
        .and_then(|id| id.parse().ok());
    let client = open(socket, true)?;
    match client.send(Command::Spawn {
        cwd,
        cols: 120,
        rows: 40,
        workspace,
        name,
        command: args,
        parent,
    })? {
        Response::Spawned { session } => {
            println!("{session}");
            Ok(0)
        }
        other => Err(unexpected(other)),
    }
}
