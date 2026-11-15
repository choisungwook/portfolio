//! The boundary between the core and whatever draws it.
//!
//! Every call crosses as one JSON envelope carrying a protocol version, so the
//! same types can travel over a function call today and a socket later without
//! the shell having to guess what the other side speaks. A shell built against
//! an older core sees `UnsupportedVersion` instead of a silent misparse.

use serde::{Deserialize, Serialize};

use crate::browse::Entry;
use crate::git::{GitCommitDetail, GitLog, GitStatus, GitWorking};
use crate::search::Match;
use crate::shortcuts::Shortcut;
use crate::theme::Theme;
use crate::tree::{TreeState, WorkspaceStatus};

/// Bumped only when an existing field changes meaning or disappears. Adding an
/// optional field or a new command variant does not need a bump, because both
/// sides ignore what they do not know.
///
/// 3 is the first version spoken over a socket: replies and events are wrapped
/// in a frame (see [`Frame`]) and sessions outlive the connection that made
/// them.
pub const PROTOCOL_VERSION: u32 = 3;

/// The product version, compiled in from the one file that owns it. Reported in
/// the handshake so a client can say which build it is talking to.
pub fn product_version() -> &'static str {
    include_str!("../../VERSION").trim()
}

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
    ///
    /// `workspace` is what the session's screen is judged under. It is optional
    /// so a shell that does not track workspaces still spawns.
    Spawn {
        cwd: String,
        cols: u16,
        rows: u16,
        #[serde(default)]
        workspace: Option<u64>,
        /// A handle other sessions can address this one by. Unique among live
        /// sessions; see `valid_session_name` for what it may contain.
        #[serde(default)]
        name: Option<String>,
        /// argv to run instead of the login shell. It still goes through the
        /// login shell so PATH is the user's. Empty means the shell itself.
        #[serde(default)]
        command: Vec<String>,
        /// The session that started this one. A child with no workspace of its
        /// own takes its parent's.
        #[serde(default)]
        parent: Option<u32>,
    },
    /// Every live shell.
    Sessions,
    /// Starts delivering a session's `output` and `exited` events to this
    /// connection, after replaying what it already printed.
    Attach {
        session: u32,
    },
    /// Stops delivering a session's events to this connection.
    Detach {
        session: u32,
    },
    /// Ends every shell and the daemon.
    Shutdown,
    /// Types `text` into a session and presses return. With `from` the text is
    /// wrapped so the receiver can tell who to answer.
    Send {
        session: u32,
        text: String,
        #[serde(default)]
        from: Option<u32>,
    },
    /// What a session shows on screen right now.
    Read {
        session: u32,
    },
    /// Blocks this connection until the session stops working, exits, or the
    /// timeout (default 180 seconds) passes.
    Wait {
        session: u32,
        #[serde(default)]
        timeout_secs: Option<u64>,
    },
    /// An empty name removes the session's name.
    RenameSession {
        session: u32,
        name: String,
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
    RenameProject {
        project: u64,
        name: String,
    },
    /// Forgets a project and everything under it. The folder on disk stays.
    DeleteProject {
        project: u64,
    },
    RenameWorkspace {
        workspace: u64,
        name: String,
    },
    DeleteWorkspace {
        workspace: u64,
    },
    /// One directory level. The shell asks again for each folder it opens
    /// rather than receiving a tree it did not ask for.
    ReadDirectory {
        path: String,
    },
    ReadFile {
        path: String,
    },
    /// What git makes of everything under a folder, directories included.
    /// Answered for a folder that is not in a repository too, as nothing to
    /// draw rather than an error.
    GitStatus {
        path: String,
    },
    /// Recent commits across local branches, remotes and tags, in topological
    /// order. A non-repository and an unborn repository are distinct answers.
    GitLog {
        path: String,
    },
    /// What one commit did: its message body and the patch, split per file.
    /// Absent when the hash names no commit in that repository.
    GitShow {
        path: String,
        hash: String,
    },
    /// The index, the working tree and the stash as they stand. Answered for a
    /// folder that is not a repository too, as nothing waiting.
    GitWorking {
        path: String,
    },
    WriteFile {
        path: String,
        text: String,
    },
    Themes,
    SetTheme {
        name: String,
    },
    /// Every menu command with the key it currently runs on.
    Shortcuts,
    /// Puts a key on a command. An empty `key` restores that command's default,
    /// and a key another command already has is refused rather than shared.
    SetShortcut {
        command: String,
        key: String,
    },
    /// Every command back to the key it shipped with.
    ResetShortcuts,
    /// The files under `root` that `query` means, best first.
    ///
    /// The whole query is sent on every keystroke rather than a cursor into a
    /// previous answer, because the ordering is over the whole project and a
    /// narrowed list cannot widen again when a character is deleted.
    FindFiles {
        root: String,
        query: String,
        #[serde(default)]
        limit: Option<usize>,
    },
    /// Every line under `root` that holds `query`, in the order the files are
    /// walked. Case is ignored, because a person searching for a symbol should
    /// not have to remember how it was capitalised.
    ///
    /// This shares the palette's file list rather than walking again: the walk
    /// is what costs, and Command O has usually already paid for it.
    SearchText {
        root: String,
        query: String,
        #[serde(default)]
        limit: Option<usize>,
    },
    /// Points the agent rules at a directory, seeding it with the shipped files
    /// when it holds none. Judging answers `idle` for everything until this has
    /// been called.
    LoadRules {
        directory: String,
    },
    /// Judges every workspace that has a session and answers with the ones whose
    /// status changed. Called on its own timer, away from the path that draws
    /// output, because running the rules per byte would stall a noisy screen.
    Detect,
    /// Takes the finished colour off a workspace. Finished means nobody has
    /// looked yet, so looking is what ends the state.
    ///
    /// `session` names the one tab that was looked at. Without it the whole
    /// workspace is cleared, which is what closing a workspace means; with it
    /// the other tabs keep their bells, which is the point of judging per tab.
    ClearStatus {
        workspace: u64,
        #[serde(default)]
        session: Option<u32>,
    },
    /// The character under a click. `line` is what the terminal has on that row
    /// and `column` is where the click landed in it.
    UrlAt {
        line: String,
        column: usize,
    },
}

/// What the core answers with. One shape per call, so the shell never has to
/// match a command against a reply.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Response {
    /// `version` is the product version of the core. Absent from cores that
    /// predate it, so decoders treat it as optional.
    Hello {
        protocol: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        version: Option<String>,
    },
    Spawned { session: u32 },
    Sessions { sessions: Vec<SessionInfo> },
    /// `replay` is the retained tail of the session's raw output, in chunks, so
    /// a new view can draw what is already there. Every `output` event that
    /// follows on this connection starts exactly where the replay ends.
    Attached {
        session: u32,
        cols: u16,
        rows: u16,
        replay: Vec<Vec<u8>>,
    },
    Text { text: String },
    Waited {
        reason: WaitReason,
        status: WorkspaceStatus,
    },
    Ok,
    State { state: TreeState },
    Entries { entries: Vec<Entry> },
    Git { status: GitStatus },
    GitLog { log: GitLog },
    /// Absent when the hash names no commit here.
    GitDetail { detail: Option<GitCommitDetail> },
    GitWorking { working: GitWorking },
    File { text: String },
    Themes { themes: Vec<Theme> },
    Shortcuts { shortcuts: Vec<Shortcut> },
    Matches { matches: Vec<Match> },
    Hits { hits: Vec<crate::grep::Hit> },
    /// Only the workspaces whose status changed since the last call.
    Statuses { statuses: Vec<WorkspaceState> },
    /// Absent when the click did not land on something this core will open.
    Url { url: Option<String> },
    Error { message: String },
}

/// One live shell, as `sessions` lists it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session: u32,
    pub name: Option<String>,
    pub parent: Option<u32>,
    pub workspace: Option<u64>,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    /// The name of the rule whose process runs under this shell, if any.
    #[serde(default)]
    pub agent: Option<String>,
    pub status: WorkspaceStatus,
}

/// Why a `wait` came back.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WaitReason {
    Stopped,
    Exited,
    Timeout,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub workspace: u64,
    /// The workspace's own colour: the most blocked of the shells under it.
    pub status: WorkspaceStatus,
    /// Every shell open in this workspace and what it is doing, so the tab strip
    /// can say which one finished rather than only that something did.
    ///
    /// Sent whole rather than as a delta. A workspace has a handful of tabs, and
    /// a list that is always complete is one the shell cannot get out of step
    /// with.
    #[serde(default)]
    pub sessions: Vec<SessionState>,
}

/// One shell's judgement.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionState {
    pub session: u32,
    pub status: WorkspaceStatus,
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
    /// The project tree after another connection changed it, so two clients do
    /// not drift apart. Never sent to the connection that made the change.
    State { state: TreeState },
}

/// What the daemon writes on a socket, one per line. Replies answer requests in
/// the order they were made; events arrive at any time between them.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Frame {
    Reply(Response),
    Event(Event),
}

impl Command {
    /// Whether a successful run changes the project tree, which is what other
    /// connections are told about. `LoadState` is left out on purpose: it
    /// reads rather than edits, and a second client loading the directory the
    /// first already has changes nothing for anyone.
    pub fn mutates_tree(&self) -> bool {
        matches!(
            self,
            Command::CreateProject { .. }
                | Command::CreateWorkspace { .. }
                | Command::RenameProject { .. }
                | Command::DeleteProject { .. }
                | Command::RenameWorkspace { .. }
                | Command::DeleteWorkspace { .. }
                | Command::SetTheme { .. }
                | Command::SetShortcut { .. }
                | Command::ResetShortcuts
        )
    }
}

/// A reply as it goes on the wire.
pub fn reply_line(response: &Response) -> String {
    match serde_json::to_string(response) {
        Ok(json) => format!(r#"{{"reply":{json}}}"#),
        Err(error) => format!(r#"{{"reply":{{"type":"error","message":"failed to encode response: {error}"}}}}"#),
    }
}

/// An event as it goes on the wire. `None` only if it cannot be encoded, which
/// means there is nothing to deliver.
pub fn event_line(event: &Event) -> Option<String> {
    serde_json::to_string(event)
        .ok()
        .map(|json| format!(r#"{{"event":{json}}}"#))
}

/// Names that are safe to type on a command line and cannot be mistaken for a
/// session id, because the CLI accepts either.
pub fn valid_session_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && name.parse::<u32>().is_err()
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
    fn v3_commands_and_replies_keep_their_wire_names() {
        // The desktop client decodes these strings and is compiled apart from
        // this crate, so a rename has to fail here.
        let json = r#"{"v":3,"command":{"type":"attach","session":4}}"#;
        assert!(matches!(
            parse_request(json),
            Ok(Command::Attach { session: 4 })
        ));
        for (json, name) in [
            (r#"{"v":3,"command":{"type":"sessions"}}"#, "sessions"),
            (r#"{"v":3,"command":{"type":"shutdown"}}"#, "shutdown"),
            (r#"{"v":3,"command":{"type":"detach","session":1}}"#, "detach"),
            (r#"{"v":3,"command":{"type":"read","session":1}}"#, "read"),
        ] {
            assert!(parse_request(json).is_ok(), "{name}");
        }

        let response = serde_json::to_string(&Response::Hello {
            protocol: 3,
            version: Some("0.15.1".to_string()),
        })
        .unwrap();
        assert_eq!(response, r#"{"type":"hello","protocol":3,"version":"0.15.1"}"#);
        // A core without the field still decodes.
        let old: Response = serde_json::from_str(r#"{"type":"hello","protocol":2}"#).unwrap();
        assert_eq!(
            old,
            Response::Hello {
                protocol: 2,
                version: None
            }
        );

        let response = serde_json::to_string(&Response::Attached {
            session: 1,
            cols: 80,
            rows: 24,
            replay: vec![vec![104, 105], vec![10]],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"attached","session":1,"cols":80,"rows":24,"replay":[[104,105],[10]]}"#
        );

        let response = serde_json::to_string(&Response::Sessions {
            sessions: vec![SessionInfo {
                session: 2,
                name: Some("review".to_string()),
                parent: Some(1),
                workspace: None,
                cwd: "/tmp".to_string(),
                cols: 80,
                rows: 24,
                agent: Some("Claude Code".to_string()),
                status: WorkspaceStatus::Running,
            }],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"sessions","sessions":[{"session":2,"name":"review","parent":1,"workspace":null,"cwd":"/tmp","cols":80,"rows":24,"agent":"Claude Code","status":"running"}]}"#
        );

        let response = serde_json::to_string(&Response::Waited {
            reason: WaitReason::Timeout,
            status: WorkspaceStatus::NeedsAttention,
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"waited","reason":"timeout","status":"needs_attention"}"#
        );
        let response = serde_json::to_string(&Response::Text {
            text: "hi".to_string(),
        })
        .unwrap();
        assert_eq!(response, r#"{"type":"text","text":"hi"}"#);
    }

    #[test]
    fn agent_commands_read_with_their_optional_fields_absent() {
        let json = r#"{"v":3,"command":{"type":"spawn","cwd":"","cols":80,"rows":24,"name":"a","command":["sh","-c","true"],"parent":2}}"#;
        match parse_request(json).expect("should parse") {
            Command::Spawn {
                name,
                command,
                parent,
                ..
            } => {
                assert_eq!(name.as_deref(), Some("a"));
                assert_eq!(command, ["sh", "-c", "true"]);
                assert_eq!(parent, Some(2));
            }
            other => panic!("unexpected command: {other:?}"),
        }
        let json = r#"{"v":3,"command":{"type":"send","session":2,"text":"hi"}}"#;
        assert!(matches!(
            parse_request(json),
            Ok(Command::Send { from: None, .. })
        ));
        let json = r#"{"v":3,"command":{"type":"wait","session":2}}"#;
        assert!(matches!(
            parse_request(json),
            Ok(Command::Wait {
                timeout_secs: None,
                ..
            })
        ));
        let json = r#"{"v":3,"command":{"type":"rename_session","session":2,"name":"x"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::RenameSession { .. })));
    }

    #[test]
    fn frames_wrap_replies_and_events_one_per_line() {
        let line = reply_line(&Response::Ok);
        assert_eq!(line, r#"{"reply":{"type":"ok"}}"#);
        assert_eq!(
            serde_json::from_str::<Frame>(&line).unwrap(),
            Frame::Reply(Response::Ok)
        );

        let line = event_line(&Event::Output {
            session: 1,
            bytes: vec![65],
        })
        .unwrap();
        assert_eq!(line, r#"{"event":{"type":"output","session":1,"bytes":[65]}}"#);
        assert_eq!(
            serde_json::from_str::<Frame>(&line).unwrap(),
            Frame::Event(Event::Output {
                session: 1,
                bytes: vec![65]
            })
        );

        let line = event_line(&Event::State {
            state: TreeState::default(),
        })
        .unwrap();
        assert_eq!(
            line,
            r#"{"event":{"type":"state","state":{"schema_version":1,"projects":[]}}}"#
        );
        assert!(!line.contains('\n'));
    }

    #[test]
    fn session_names_cannot_be_mistaken_for_ids() {
        assert!(valid_session_name("reviewer-2"));
        assert!(!valid_session_name("12"));
        assert!(!valid_session_name(""));
        assert!(!valid_session_name("has space"));
    }

    #[test]
    fn only_tree_edits_count_as_mutations() {
        assert!(Command::SetTheme { name: "x".into() }.mutates_tree());
        assert!(!Command::LoadState { directory: "/x".into() }.mutates_tree());
        assert!(!Command::Detect.mutates_tree());
    }

    #[test]
    fn reads_a_command_at_the_current_version() {
        let json = r#"{"v":3,"command":{"type":"spawn","cwd":"/tmp","cols":80,"rows":24}}"#;
        match parse_request(json).expect("should parse") {
            Command::Spawn { cwd, cols, rows, .. } => {
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
        let json = r#"{"v":3,"command":{"type":"hello"},"sent_at":"2026-08-19"}"#;
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
    fn a_spawn_without_a_workspace_still_reads() {
        // The field was added after the first release, so an older shell has to
        // keep working against a newer core.
        let json = r#"{"v":3,"command":{"type":"spawn","cwd":"","cols":80,"rows":24}}"#;
        match parse_request(json).expect("should parse") {
            Command::Spawn { workspace, .. } => assert_eq!(workspace, None),
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn status_and_url_keep_their_wire_names() {
        let response = serde_json::to_string(&Response::Statuses {
            statuses: vec![WorkspaceState {
                workspace: 3,
                status: WorkspaceStatus::NeedsAttention,
                sessions: vec![SessionState {
                    session: 7,
                    status: WorkspaceStatus::Running,
                }],
            }],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"statuses","statuses":[{"workspace":3,"status":"needs_attention","sessions":[{"session":7,"status":"running"}]}]}"#
        );
        // The tab a click cleared travels with the workspace, and an older shell
        // that names neither still parses.
        let json = r#"{"v":3,"command":{"type":"clear_status","workspace":3}}"#;
        match parse_request(json).expect("should parse") {
            Command::ClearStatus { session, .. } => assert_eq!(session, None),
            other => panic!("unexpected command: {other:?}"),
        }
        let response = serde_json::to_string(&Response::Url { url: None }).unwrap();
        assert_eq!(response, r#"{"type":"url","url":null}"#);
    }

    #[test]
    fn shortcuts_and_file_search_keep_their_wire_names() {
        // Decoded by a Swift file compiled apart from this crate, so a rename
        // has to fail here rather than at runtime on somebody's machine.
        let response = serde_json::to_string(&Response::Shortcuts {
            shortcuts: vec![crate::shortcuts::Shortcut {
                command: "save".to_string(),
                title: "Save".to_string(),
                menu: "File".to_string(),
                key: "cmd+s".to_string(),
                default_key: "cmd+s".to_string(),
            }],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"shortcuts","shortcuts":[{"command":"save","title":"Save","menu":"File","key":"cmd+s","default_key":"cmd+s"}]}"#
        );
        let response = serde_json::to_string(&Response::Matches {
            matches: vec![crate::search::Match {
                path: "/tmp/a/b.rs".to_string(),
                relative: "a/b.rs".to_string(),
                score: 42,
                positions: vec![0, 2],
            }],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"matches","matches":[{"path":"/tmp/a/b.rs","relative":"a/b.rs","score":42,"positions":[0,2]}]}"#
        );

        let json = r#"{"v":3,"command":{"type":"set_shortcut","command":"save","key":"cmd+shift+s"}}"#;
        match parse_request(json).expect("should parse") {
            Command::SetShortcut { command, key } => {
                assert_eq!((command.as_str(), key.as_str()), ("save", "cmd+shift+s"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
        // The limit is optional, so a shell that does not send one still asks.
        let json = r#"{"v":3,"command":{"type":"find_files","root":"/tmp","query":"ap"}}"#;
        match parse_request(json).expect("should parse") {
            Command::FindFiles { root, query, limit } => {
                assert_eq!((root.as_str(), query.as_str(), limit), ("/tmp", "ap", None));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn git_status_keeps_its_wire_names() {
        // The Swift side decodes these strings and is compiled separately.
        let response = serde_json::to_string(&Response::Git {
            status: GitStatus {
                repository: true,
                entries: vec![crate::git::GitEntry {
                    path: "/tmp/a.txt".to_string(),
                    status: crate::git::FileStatus::Untracked,
                    stage: crate::git::Stage::Unstaged,
                }],
            },
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"git","status":{"repository":true,"entries":[{"path":"/tmp/a.txt","status":"untracked","stage":"unstaged"}]}}"#
        );
        let json = r#"{"v":3,"command":{"type":"git_status","path":"/tmp"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::GitStatus { .. })));
    }

    #[test]
    fn text_search_keeps_its_wire_names() {
        let response = serde_json::to_string(&Response::Hits {
            hits: vec![crate::grep::Hit {
                path: "/p/a.rs".to_string(),
                relative: "a.rs".to_string(),
                line: 2,
                text: "let x = 1;".to_string(),
                column: 4,
                length: 1,
            }],
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"hits","hits":[{"path":"/p/a.rs","relative":"a.rs","line":2,"text":"let x = 1;","column":4,"length":1}]}"#
        );
        let json = r#"{"v":3,"command":{"type":"search_text","root":"/p","query":"x"}}"#;
        match parse_request(json).expect("should parse") {
            Command::SearchText { limit, .. } => assert_eq!(limit, None),
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn git_log_keeps_its_wire_names() {
        let response = serde_json::to_string(&Response::GitLog {
            log: GitLog {
                repository: true,
                commits: vec![crate::git::GitCommit {
                    hash: "abc".to_string(),
                    parents: vec!["def".to_string()],
                    author: "A".to_string(),
                    date: "2026-08-23 10:00".to_string(),
                    refs: vec!["HEAD -> main".to_string()],
                    subject: "message".to_string(),
                }],
            },
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"git_log","log":{"repository":true,"commits":[{"hash":"abc","parents":["def"],"author":"A","date":"2026-08-23 10:00","refs":["HEAD -> main"],"subject":"message"}]}}"#
        );
        let json = r#"{"v":3,"command":{"type":"git_log","path":"/tmp"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::GitLog { .. })));
    }

    #[test]
    fn git_show_and_git_working_keep_their_wire_names() {
        let response = serde_json::to_string(&Response::GitDetail {
            detail: Some(crate::git::GitCommitDetail {
                commit: crate::git::GitCommit {
                    hash: "abc".to_string(),
                    parents: vec![],
                    author: "A".to_string(),
                    date: "2026-09-13 10:00".to_string(),
                    refs: vec![],
                    subject: "message".to_string(),
                },
                body: "why".to_string(),
                files: vec![crate::git::GitDiffFile {
                    path: "a.txt".to_string(),
                    status: crate::git::FileStatus::Modified,
                    additions: 1,
                    deletions: 2,
                    patch: "@@".to_string(),
                }],
            }),
        })
        .unwrap();
        assert_eq!(
            response,
            r#"{"type":"git_detail","detail":{"commit":{"hash":"abc","parents":[],"author":"A","date":"2026-09-13 10:00","refs":[],"subject":"message"},"body":"why","files":[{"path":"a.txt","status":"modified","additions":1,"deletions":2,"patch":"@@"}]}}"#
        );
        let working = serde_json::to_string(&Response::GitWorking {
            working: crate::git::GitWorking {
                repository: true,
                staged: vec![],
                unstaged: vec![],
                stash: vec![crate::git::GitStashEntry {
                    name: "stash@{0}".to_string(),
                    subject: "WIP".to_string(),
                }],
            },
        })
        .unwrap();
        assert_eq!(
            working,
            r#"{"type":"git_working","working":{"repository":true,"staged":[],"unstaged":[],"stash":[{"name":"stash@{0}","subject":"WIP"}]}}"#
        );
        let json = r#"{"v":3,"command":{"type":"git_show","path":"/tmp","hash":"abc"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::GitShow { .. })));
        let json = r#"{"v":3,"command":{"type":"git_working","path":"/tmp"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::GitWorking { .. })));
    }

    #[test]
    fn reads_rename_and_delete_commands() {
        let json = r#"{"v":3,"command":{"type":"delete_workspace","workspace":4}}"#;
        match parse_request(json).expect("should parse") {
            Command::DeleteWorkspace { workspace } => assert_eq!(workspace, 4),
            other => panic!("unexpected command: {other:?}"),
        }
        let json = r#"{"v":3,"command":{"type":"rename_project","project":2,"name":"New"}}"#;
        match parse_request(json).expect("should parse") {
            Command::RenameProject { project, name } => {
                assert_eq!((project, name.as_str()), (2, "New"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn reads_tree_mutation_commands() {
        let json = r#"{"v":3,"command":{"type":"create_workspace","project":3,"name":"Server"}}"#;
        match parse_request(json).expect("should parse") {
            Command::CreateWorkspace { project, name } => {
                assert_eq!(project, 3);
                assert_eq!(name, "Server");
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }
}
