//! The core of akbun-terminal: everything except pixels.
//!
//! Nothing here knows what draws it. The shell is expected to be replaced at
//! least once, so the model, the sessions and the protocol live on this side of
//! the boundary and are tested with `cargo test` alone.

pub mod app;
pub mod browse;
pub mod markdown;
pub mod protocol;
pub mod session;
pub mod theme;
pub mod tree;

pub use app::App;
pub use browse::Entry;
pub use markdown::{Block, Span};
pub use theme::Theme;
pub use protocol::{Command, Event, Request, Response, PROTOCOL_VERSION};
pub use tree::{Project, TreeState, Workspace, WorkspaceStatus, STATE_SCHEMA_VERSION};
