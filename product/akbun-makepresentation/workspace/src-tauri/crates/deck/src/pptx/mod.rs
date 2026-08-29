//! Read and write `.pptx` files.
//!
//! `write` serializes the editor model into a self-contained OOXML package.
//! `read` follows slide relationships and converts supported DrawingML back
//! into editable deck shapes.

mod common;
mod read;
mod write;

pub use read::read;
pub use write::write;

#[cfg(test)]
mod tests;
