//! The native view the monitor draws on, and where to put it.
//!
//! This is the thin platform layer the issue's decision record asks for. Making
//! a view, placing it and resizing it are the only things about the native
//! viewport that differ between operating systems; the swapchain
//! (`makevideo_present::surface`), the compositing and every decision about
//! *when* to draw are the same code everywhere. A Windows build replaces this
//! file and nothing else.
//!
//! # The view goes over the webview, and hides when the page needs the space
//!
//! A native view is not part of the page's stacking order, so one of the two
//! has to be on top and neither answer is free.
//!
//! Underneath is the tempting one — the page would keep drawing the whole
//! editor and the monitor would show through a hole in it — and it does not
//! work. CSS transparency composites down the element stack, not through the
//! window: for the monitor to be visible, every ancestor of the stage would
//! have to be transparent as well, up to and including `body`. The window would
//! be transparent everywhere the app has not painted something, which is a
//! rewrite of the whole page's background for one rectangle.
//!
//! So the view sits on top and is **hidden** whenever the page has something to
//! draw over it: a sheet, an open menu. That is a small contract with one rule
//! — the page hides the monitor before covering it — and it costs nothing at
//! the moment that matters, because nobody has the settings sheet open while
//! they are watching playback.
//!
//! # Failing here is not fatal
//!
//! Every function that can fail says so, and the caller falls back to the media
//! element preview. Playback is the app's main path: an editor that cannot play
//! is not an editor, and a machine where this layer does not work should get
//! the preview the app has always had rather than a black rectangle.

use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(not(target_os = "macos"))]
mod unsupported;
#[cfg(not(target_os = "macos"))]
use unsupported as platform;

/// Where the monitor sits inside the window, in **physical** pixels.
///
/// Physical because that is what a native view is placed in and what a
/// swapchain is sized in. The page measures in CSS pixels and multiplies by
/// `devicePixelRatio` before sending, which is the same conversion the drag and
/// drop handler already does in the other direction.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The clipped monitor box and the larger picture inside it.
///
/// Both rectangles use physical window pixels. The page keeps the transform in
/// CSS pixels so cursor math stays in one coordinate system, then converts the
/// two rectangles together at the IPC boundary.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorPlace {
    pub stage: Place,
    pub content: Place,
}

impl MonitorPlace {
    pub fn surface_size(&self) -> (u32, u32) {
        self.content.surface_size()
    }

    pub fn is_visible(&self) -> bool {
        self.stage.is_visible() && self.content.is_visible()
    }
}

impl Place {
    /// The size to configure a swapchain at, never zero. A surface configured
    /// at zero is a validation error on every backend, and a stage box can
    /// genuinely be zero for a moment while the window is being laid out.
    pub fn surface_size(&self) -> (u32, u32) {
        (
            (self.width.max(1.0).round() as u32).max(1),
            (self.height.max(1.0).round() as u32).max(1),
        )
    }

    /// Whether this is worth drawing on at all.
    pub fn is_visible(&self) -> bool {
        self.width >= 1.0 && self.height >= 1.0
    }
}

/// A native view, owned for as long as playback is.
pub struct Viewport {
    inner: platform::Inner,
    place: MonitorPlace,
    visible: bool,
}

impl Viewport {
    /// Attach a view to `window` and put it at `place`.
    pub fn attach(window: &tauri::WebviewWindow, place: MonitorPlace) -> Result<Viewport, String> {
        let inner = platform::attach(window, place)?;
        Ok(Viewport {
            inner,
            place,
            visible: true,
        })
    }

    /// Move or resize it. Cheap, and safe to call with what it already is.
    pub fn place(&mut self, place: MonitorPlace) {
        if place == self.place {
            return;
        }
        self.place = place;
        platform::place(&self.inner, place);
    }

    /// Show or hide it. The page hides it before drawing anything over the
    /// stage, because a native view is not in the page's stacking order and
    /// would otherwise sit on top of a sheet.
    pub fn set_visible(&mut self, visible: bool) {
        if visible == self.visible {
            return;
        }
        self.visible = visible;
        platform::set_visible(&self.inner, visible);
    }

    /// A surface target for wgpu.
    ///
    /// `'static` because the swapchain outlives the call, and it is sound
    /// because the view is owned by this `Viewport`, which the playback thread
    /// holds for as long as it holds the surface. Dropping the viewport while a
    /// surface is alive is the one thing that would break it, and the two live
    /// and die together in `playback.rs`.
    pub fn target(&self) -> Result<wgpu::SurfaceTarget<'static>, String> {
        platform::target(&self.inner)
    }
}

impl Drop for Viewport {
    fn drop(&mut self) {
        platform::detach(&self.inner);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_surface_is_never_configured_at_zero() {
        let place = Place {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        assert_eq!(place.surface_size(), (1, 1));
        assert!(!place.is_visible());
    }

    #[test]
    fn a_fractional_box_rounds_to_whole_pixels() {
        let place = Place {
            x: 10.5,
            y: 20.25,
            width: 640.4,
            height: 360.6,
        };
        assert_eq!(place.surface_size(), (640, 361));
        assert!(place.is_visible());
    }

    /// A collapsed panel is a real state — the window can be dragged small
    /// enough — and it has to read as "nothing to draw" rather than as a size.
    #[test]
    fn a_collapsed_stage_is_not_visible() {
        for (width, height) in [(0.0, 100.0), (100.0, 0.0), (0.5, 0.5)] {
            let place = Place {
                x: 0.0,
                y: 0.0,
                width,
                height,
            };
            assert!(!place.is_visible(), "{width}x{height}");
        }
    }
}
