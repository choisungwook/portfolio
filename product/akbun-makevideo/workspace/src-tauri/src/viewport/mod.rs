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

/// Where the monitor sits inside the WebView, in **points**.
///
/// Points, because that is the one unit both sides already have without
/// converting: a CSS pixel in the page and an AppKit point in a view inside
/// that page's `WKWebView` are the same length, so `getBoundingClientRect()`
/// values are an `NSRect` with the y origin flipped and nothing else done to
/// them.
///
/// It used to be physical pixels, which meant the page multiplied by
/// `devicePixelRatio` and this side divided by the view's backing scale. Those
/// two cancel, so the whole conversion was a round trip that only landed where
/// it started while the page's cached ratio and the window's real one agreed —
/// and when they did not, every coordinate was scaled at once and the monitor
/// was drawn outside the panel.
///
/// Physical pixels are still what a swapchain is sized in. That number is asked
/// of the view itself, in [`Viewport::surface_size`], on the side that can know
/// which display the window is on.
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
/// Both in points, both measured from the WebView's top left, and both computed
/// from one measurement in `geometry.js` so they cannot describe two different
/// moments.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorPlace {
    pub stage: Place,
    pub content: Place,
}

impl MonitorPlace {
    pub fn is_visible(&self) -> bool {
        self.stage.is_visible() && self.content.is_visible()
    }
}

impl Place {
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

    /// Move or resize it, and answer the size the surface on it should now be.
    ///
    /// `None` when the box is what it already was. Both halves of this are main
    /// thread calls that the caller waits on, and the page re-measures its
    /// panel on every animation frame, so a placement that changes nothing has
    /// to cost nothing.
    pub fn place(&mut self, place: MonitorPlace) -> Option<(u32, u32)> {
        if place == self.place {
            return None;
        }
        self.place = place;
        let (width, height) = platform::place(&self.inner, place);
        Some((width.max(1), height.max(1)))
    }

    /// The picture view's size in **physical** pixels, which is what a
    /// swapchain is configured at.
    ///
    /// Asked of the view rather than worked out from a ratio the page sent,
    /// because the view is the only thing that knows which display it is on.
    /// Read *after* the view has been moved, so a window dragged onto a display
    /// with a different scale factor is a size that already accounts for it.
    ///
    /// Never zero: a surface configured at zero is a validation error on every
    /// backend, and the box genuinely is zero for a moment while a window is
    /// being laid out.
    pub fn surface_size(&self) -> (u32, u32) {
        let (width, height) = platform::surface_size(&self.inner);
        (width.max(1), height.max(1))
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

    fn place(width: f64, height: f64) -> Place {
        Place {
            x: 0.0,
            y: 0.0,
            width,
            height,
        }
    }

    /// A collapsed panel is a real state — the window can be dragged small
    /// enough, and the page answers an unfittable panel with an empty box on
    /// purpose — and it has to read as "nothing to draw" rather than as a size.
    #[test]
    fn a_collapsed_stage_is_not_visible() {
        for (width, height) in [(0.0, 100.0), (100.0, 0.0), (0.5, 0.5)] {
            assert!(!place(width, height).is_visible(), "{width}x{height}");
        }
        assert!(place(640.0, 360.0).is_visible());
    }

    /// Both rectangles have to be worth drawing on. The picture is the one a
    /// surface is made for and the stage is the one that clips it, so a zero
    /// either side is a session with nothing on screen.
    #[test]
    fn a_monitor_needs_both_of_its_boxes() {
        let good = place(640.0, 360.0);
        let empty = place(0.0, 0.0);
        assert!(MonitorPlace {
            stage: good,
            content: good
        }
        .is_visible());
        assert!(!MonitorPlace {
            stage: empty,
            content: good
        }
        .is_visible());
        assert!(!MonitorPlace {
            stage: good,
            content: empty
        }
        .is_visible());
    }
}
