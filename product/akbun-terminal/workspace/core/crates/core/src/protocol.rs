//! The boundary between the core and whatever draws it.
//!
//! Every call crosses as one JSON envelope carrying a protocol version, so the
//! same types can travel over a function call today and a socket later without
//! the shell having to guess what the other side speaks. A shell built against
//! an older core sees `UnsupportedVersion` instead of a silent misparse.

use serde::{Deserialize, Serialize};

use crate::browse::Entry;
use crate::markdown::Block;
use crate::theme::Theme;
use crate::tree::TreeState;

/// Bumped only when an existing field changes meaning or disappears. Adding an
/// optional field or a new command variant does not need a bump, because both
/// sides ignore what they do not know.
pub const PROTOCOL_VERSION: u32 = 1;

/// What the shell sends in.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub v: u32,
    pub command: Command,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    /// Protocol handshake. The shell calls this first and refuses to run when
    /// the core answers with a version it does not know.
    Hello,
    /// Starts a shell session. `cwd` empty means the home directory.
    Spawn {
        cwd: String,
        cols: u16,
        rows: u16,
    },
    /// Keystrokes on their way to the shell.
    Write {
        session: u32,
        bytes: Vec<u8>,
    },
    Resize {
        session: u32,
        cols: u16,
        rows: u16,
    },
    Close {
        session: u32,
    },
    LoadState {
        directory: String,
    },
    CreateProject {
        name: String,
        path: Option<String>,
    },
    CreateWorkspace {
        project: u64,
        name: String,
    },
    /// One directory level. The shell asks again for each folder it opens
    /// rather than receiving a tree it did not ask for.
    ReadDirectory {
        path: String,
    },
    ReadFile {
        path: String,
    },
    WriteFile {
        path: String,
        text: String,
    },
    /// Markdown in, blocks out. The text is sent rather than a path so the
    /// preview follows what is being typed, not what is on disk.
    RenderMarkdown {
        text: String,
    },
    Themes,
    SetTheme {
        name: String,
    },
}

/// What the core answers with. One shape per call, so the shell never has to
/// match a command against a reply.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Response {
    Hello { protocol: u32 },
    Spawned { session: u32 },
    Ok,
    State { state: TreeState },
    Entries { entries: Vec<Entry> },
    File { text: String },
    Markdown { blocks: Vec<Block> },
    Themes { themes: Vec<Theme> },
    Error { message: String },
}

/// What the core pushes out on its own. The shell drains these; the core never
/// calls back into it, which keeps thread ownership on one side.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    /// Shell output on its way to a terminal view.
    ///
    /// Bytes ride as a JSON array, which costs several times their size. That is
    /// affordable while one session is being proved out and is the first thing
    /// to move to its own channel; the version field above is what makes that
    /// move possible without touching the rest of the protocol.
    Output { session: u32, bytes: Vec<u8> },
    /// The shell process ended, so the view can stop accepting keys.
    Exited { session: u32 },
}

/// Reads an envelope, rejecting a version this build does not implement.
pub fn parse_request(json: &str) -> Result<Command, String> {
    let request: Request = serde_json::from_str(json).map_err(|error| error.to_string())?;
    if request.v != PROTOCOL_VERSION {
        return Err(format!(
            "unsupported protocol version {}, this core speaks {}",
            request.v, PROTOCOL_VERSION
        ));
    }
    Ok(request.command)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_command_at_the_current_version() {
        let json = r#"{"v":1,"command":{"type":"spawn","cwd":"/tmp","cols":80,"rows":24}}"#;
        match parse_request(json).expect("should parse") {
            Command::Spawn { cwd, cols, rows } => {
                assert_eq!(cwd, "/tmp");
                assert_eq!((cols, rows), (80, 24));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn refuses_a_version_it_does_not_speak() {
        let json = r#"{"v":99,"command":{"type":"hello"}}"#;
        let error = parse_request(json).expect_err("should refuse");
        assert!(error.contains("unsupported protocol version 99"), "{error}");
    }

    #[test]
    fn an_unknown_field_does_not_break_an_old_core() {
        // Forward compatibility in the direction that matters: a newer shell
        // adding a field must not stop an installed core from working.
        let json = r#"{"v":1,"command":{"type":"hello"},"sent_at":"2026-08-19"}"#;
        assert!(parse_request(json).is_ok());
    }

    #[test]
    fn responses_and_events_keep_their_wire_names() {
        // The Swift side decodes by these strings, and it is not compiled
        // together with this crate, so a rename has to fail here.
        let response = serde_json::to_string(&Response::Spawned { session: 7 }).unwrap();
        assert_eq!(response, r#"{"type":"spawned","session":7}"#);

        let event = serde_json::to_string(&Event::Exited { session: 7 }).unwrap();
        assert_eq!(event, r#"{"type":"exited","session":7}"#);

        let response = serde_json::to_string(&Response::State {
            state: TreeState::default(),
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"state","state":{"schema_version":1,"projects":[]}}"#
        );
    }

    #[test]
    fn reads_tree_mutation_commands() {
        let json = r#"{"v":1,"command":{"type":"create_workspace","project":3,"name":"Server"}}"#;
        match parse_request(json).expect("should parse") {
            Command::CreateWorkspace { project, name } => {
                assert_eq!(project, 3);
                assert_eq!(name, "Server");
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }
}
