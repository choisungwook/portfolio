//! The core of akbun-terminal: everything except pixels.
//!
//! Nothing here knows what draws it. The shell is expected to be replaced at
//! least once, so the model, the sessions and the protocol live on this side of
//! the boundary and are tested with `cargo test` alone.

pub mod app;
pub mod protocol;
pub mod session;

pub use app::App;
pub use protocol::{Command, Event, PROTOCOL_VERSION, Request, Response};
