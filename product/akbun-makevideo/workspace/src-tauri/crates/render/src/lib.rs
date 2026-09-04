//! Turning a project into a file: the ffmpeg command, and everything around it
//! that has to know where the tools and the folders are.
//!
//! The model itself is not here. It moved to makevideo-edit when the page
//! stopped owning it, and this crate re-exports the types so that the render
//! and the compositor go on naming one project shape rather than converting
//! between two of them.
//!
//! Nothing in here spawns a process. The argument list is built and handed
//! back, which is what lets the whole graph be asserted on a runner with no
//! ffmpeg installed.

pub mod accel;
pub mod ffmpeg;
pub mod layout;
pub mod probe;
pub mod tools;
pub mod workspace;

pub use makevideo_edit::{
    asset_id, Asset, AssetKind, BlendMode, Clip, Easing, GradientStop, Keyframe, KeyframeTrack,
    Paint, PaintPoint, Project, ProjectSettings, Shadow, ShapeKind, Stroke, TextAlign, TextStyle,
    Track, TrackKind, VisualAnimation, VisualContent, VisualItem, VisualProperty, VisualStyle,
    VisualTransform, FORMAT_VERSION,
};
pub use makevideo_time::{Rate, RationalTime};
