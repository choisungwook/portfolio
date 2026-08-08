//! Every platform that has no viewport layer yet.
//!
//! It refuses rather than pretending, and refusing is a supported answer:
//! `fallback::choose` turns it into the media element preview with the reason
//! shown in Settings. That is the same path a Mac with no graphics device takes,
//! so there is one behaviour for "the native monitor cannot run here" rather
//! than one per reason.
//!
//! This is also what a Windows implementation replaces. The rest of playback —
//! the scheduler, the surface, the compositing — is already platform
//! independent, and wgpu and ffmpeg both run there, so what is missing is a
//! child HWND, its placement, and its resize.

use super::MonitorPlace;

pub struct Inner;

pub fn attach(_window: &tauri::WebviewWindow, _place: MonitorPlace) -> Result<Inner, String> {
    Err("the native monitor is macOS only so far; playback uses media elements here".into())
}

pub fn place(_inner: &Inner, _at: MonitorPlace) {}

pub fn set_visible(_inner: &Inner, _visible: bool) {}

pub fn detach(_inner: &Inner) {}

pub fn target(_inner: &Inner) -> Result<wgpu::SurfaceTarget<'static>, String> {
    Err("there is no native view on this platform".into())
}
