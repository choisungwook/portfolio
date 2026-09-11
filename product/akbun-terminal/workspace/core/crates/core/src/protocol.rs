//! The boundary between the core and whatever draws it.
//!
//! Every call crosses as one JSON envelope carrying a protocol version, so the
//! same types can travel over a function call today and a socket later without
//! the shell having to guess what the other side speaks. A shell built against
//! an older core sees `UnsupportedVersion` instead of a silent misparse.

use serde::{Deserialize, Serialize};

use crate::browse::Entry;
use crate::git::{GitLog, GitStatus};
use crate::search::Match;
use crate::shortcuts::Shortcut;
use crate::theme::Theme;
use crate::tree::{TreeState, WorkspaceStatus};

/// Bumped only when an existing field changes meaning or disappears. Adding an
/// optional field or a new command variant does not need a bump, because both
/// sides ignore what they do not know.
pub const PROTOCOL_VERSION: u32 = 2;

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
    Hello { protocol: u32 },
    Spawned { session: u32 },
    Ok,
    State { state: TreeState },
    Entries { entries: Vec<Entry> },
    Git { status: GitStatus },
    GitLog { log: GitLog },
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
        let json = r#"{"v":2,"command":{"type":"spawn","cwd":"/tmp","cols":80,"rows":24}}"#;
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
        let json = r#"{"v":2,"command":{"type":"hello"},"sent_at":"2026-08-19"}"#;
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
        let json = r#"{"v":2,"command":{"type":"spawn","cwd":"","cols":80,"rows":24}}"#;
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
        let json = r#"{"v":2,"command":{"type":"clear_status","workspace":3}}"#;
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

        let json = r#"{"v":2,"command":{"type":"set_shortcut","command":"save","key":"cmd+shift+s"}}"#;
        match parse_request(json).expect("should parse") {
            Command::SetShortcut { command, key } => {
                assert_eq!((command.as_str(), key.as_str()), ("save", "cmd+shift+s"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
        // The limit is optional, so a shell that does not send one still asks.
        let json = r#"{"v":2,"command":{"type":"find_files","root":"/tmp","query":"ap"}}"#;
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
        let json = r#"{"v":2,"command":{"type":"git_status","path":"/tmp"}}"#;
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
        let json = r#"{"v":2,"command":{"type":"search_text","root":"/p","query":"x"}}"#;
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
        let json = r#"{"v":2,"command":{"type":"git_log","path":"/tmp"}}"#;
        assert!(matches!(parse_request(json), Ok(Command::GitLog { .. })));
    }

    #[test]
    fn reads_rename_and_delete_commands() {
        let json = r#"{"v":2,"command":{"type":"delete_workspace","workspace":4}}"#;
        match parse_request(json).expect("should parse") {
            Command::DeleteWorkspace { workspace } => assert_eq!(workspace, 4),
            other => panic!("unexpected command: {other:?}"),
        }
        let json = r#"{"v":2,"command":{"type":"rename_project","project":2,"name":"New"}}"#;
        match parse_request(json).expect("should parse") {
            Command::RenameProject { project, name } => {
                assert_eq!((project, name.as_str()), (2, "New"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn reads_tree_mutation_commands() {
        let json = r#"{"v":2,"command":{"type":"create_workspace","project":3,"name":"Server"}}"#;
        match parse_request(json).expect("should parse") {
            Command::CreateWorkspace { project, name } => {
                assert_eq!(project, 3);
                assert_eq!(name, "Server");
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }
}
