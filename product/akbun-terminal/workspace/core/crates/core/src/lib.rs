//! The core of akbun-terminal: everything except pixels.
//!
//! Nothing here knows what draws it. The shell is expected to be replaced at
//! least once, so the model, the sessions and the protocol live on this side of
//! the boundary and are tested with `cargo test` alone.

pub mod agent;
pub mod app;
pub mod browse;
pub mod git;
pub mod protocol;
pub mod screen;
pub mod search;
pub mod session;
pub mod shortcuts;
pub mod theme;
pub mod tree;
pub mod url;

pub use agent::Rule;
pub use app::App;
pub use browse::Entry;
pub use git::{FileStatus, GitCommit, GitEntry, GitLog, GitStatus};
pub use screen::Screen;
pub use search::Match;
pub use shortcuts::Shortcut;
pub use theme::Theme;
pub use protocol::{Command, Event, Request, Response, WorkspaceState, PROTOCOL_VERSION};
pub use tree::{Project, TreeState, Workspace, WorkspaceStatus, STATE_SCHEMA_VERSION};
