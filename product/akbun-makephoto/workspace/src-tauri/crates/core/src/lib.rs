//! The whole photo model: what the desktop app and the CLI both call.
//!
//! The catalog file on disk is the only shared state. Every mutation goes
//! through [`catalog::Store::update`], which locks, reads, changes, and writes
//! it atomically, so the app and the CLI can run at the same time.

pub mod auto;
pub mod catalog;
pub mod decode;
pub mod develop;
pub mod edit;
pub mod geometry;
pub mod look;
pub mod render;

pub type Result<T> = std::result::Result<T, String>;
