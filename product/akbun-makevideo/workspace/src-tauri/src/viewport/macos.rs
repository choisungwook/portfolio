//! The macOS half of the viewport: an `NSView` over the webview.
//!
//! Everything here is AppKit and nothing here is timing. If a Windows build
//! happens, this file gets a sibling and the rest of playback is untouched.
//!
//! # Everything runs on the main thread
//!
//! AppKit views may only be made and messaged from the main thread, and the
//! playback loop is on its own. So every call here hops through
//! `run_on_main_thread` and the view is held as a retained pointer rather than
//! as a `Retained`, which is `!Send` and could not be kept beside the rest of
//! playback.
//!
//! The one thing that does *not* hop is handing the pointer to wgpu. That is
//! not an AppKit message: wgpu attaches a `CAMetalLayer` and then talks to
//! Metal, which is safe from any thread.
//!
//! # One AppKit conversion owns the coordinate boundary
//!
//! The page measures from the visible viewport's top-left in `WKWebView`. The
//! monitor is a sibling overlay in the window content view, so AppKit converts
//! the rectangle between those two views. No title-bar offset or ancestor
//! transform is reconstructed by hand.

use super::{MonitorPlace, Place};
use objc2::rc::Retained;
use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSView, NSWindowOrderingMode};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use raw_window_handle::{
    AppKitDisplayHandle, AppKitWindowHandle, DisplayHandle, HandleError, HasDisplayHandle,
    HasWindowHandle, RawDisplayHandle, RawWindowHandle, WindowHandle,
};
use std::ptr::NonNull;
use std::sync::{mpsc::channel, Arc, Mutex};

pub struct Inner {
    /// Clips the enlarged Metal view to the monitor rectangle and lets pointer
    /// events continue through to the WebView, which owns zoom gestures.
    container: Handle,
    /// A retained `NSView`. Released in `detach`, on the main thread.
    view: Handle,
    window: tauri::WebviewWindow,
    geometry: Arc<Mutex<String>>,
}

struct PassThroughIvars;

define_class!(
    #[unsafe(super(NSView))]
    #[ivars = PassThroughIvars]
    struct PassThroughView;

    impl PassThroughView {
        #[unsafe(method(isFlipped))]
        fn is_flipped(&self) -> bool {
            true
        }

        #[unsafe(method(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> Option<&NSView> {
            None
        }
    }
);

impl PassThroughView {
    fn new(main: MainThreadMarker, frame: NSRect) -> Retained<Self> {
        let view = Self::alloc(main).set_ivars(PassThroughIvars);
        unsafe { msg_send![super(view), initWithFrame: frame] }
    }
}

/// A retained view pointer that can be carried between threads.
///
/// The pointer is only *messaged* on the main thread, which every function here
/// arranges. What crosses threads is the address, and an address is just a
/// number until somebody sends it something.
#[derive(Clone, Copy)]
struct Handle(NonNull<NSView>);

// SAFETY: see the type's own note. AppKit messages go through
// `run_on_main_thread`; the only cross-thread use is handing the address to
// wgpu, which attaches a layer and then talks to Metal.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

impl Handle {
    /// The address, taken through the whole handle.
    ///
    /// Every closure below reaches the pointer through this rather than through
    /// `.0`. A `move` closure that names the field captures the `NonNull`
    /// alone, and a `NonNull` is not `Send` — the `unsafe impl` above is on
    /// `Handle`, so the closure has to capture the `Handle`. Calling a method
    /// that takes `self` is what makes it do that.
    fn ptr(self) -> NonNull<NSView> {
        self.0
    }
}

/// What wgpu is given. Separate from [`Inner`] because a surface target has to
/// be owned and `'static`, and because it must not carry the window with it.
struct ViewTarget(NonNull<std::ffi::c_void>);

// SAFETY: as `Handle`. The view outlives every surface made from it: the
// playback thread owns the `Viewport` and the `SurfaceSink` together and drops
// them in that order.
unsafe impl Send for ViewTarget {}
unsafe impl Sync for ViewTarget {}

impl HasWindowHandle for ViewTarget {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let handle = AppKitWindowHandle::new(self.0);
        // SAFETY: valid for as long as the `Viewport` that made it, and the
        // borrow is tied to `&self`.
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::AppKit(handle)) })
    }
}

impl HasDisplayHandle for ViewTarget {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        // SAFETY: AppKit's display handle carries nothing and is always valid.
        Ok(unsafe {
            DisplayHandle::borrow_raw(RawDisplayHandle::AppKit(AppKitDisplayHandle::new()))
        })
    }
}

/// Run `work` against the actual WebKit view and wait for what it returns.
///
/// The callback supplies the source coordinate system for AppKit's conversion
/// into the window overlay. This keeps WebKit's private subview hierarchy out
/// of the placement arithmetic.
///
/// Waiting is deliberate. Attaching and placing are rare — a project opening,
/// a panel resizing — and a caller that carried on without knowing whether the
/// view exists would go on to make a surface for nothing.
fn on_webview<T, F>(window: &tauri::WebviewWindow, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(MainThreadMarker, &NSView) -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = channel();
    window
        .with_webview(move |webview| {
            let answer = match MainThreadMarker::new() {
                Some(main) => {
                    // WKWebView inherits NSView. Tauri gives this callback the
                    // WebKit pointer on the main thread, where AppKit permits
                    // this cast and every message below.
                    let host = unsafe { &*webview.inner().cast::<NSView>() };
                    work(main, host)
                }
                None => Err("with_webview did not run on the main thread".into()),
            };
            let _ = sender.send(answer);
        })
        .map_err(|error| format!("cannot reach the WebView: {error}"))?;
    receiver
        .recv()
        .map_err(|error| format!("the WebView never answered: {error}"))?
}

fn overlay_host(host: &NSView) -> Result<Retained<NSView>, String> {
    host.window()
        .and_then(|window| window.contentView())
        .ok_or_else(|| "the WebView window has no content view".to_string())
}

pub fn attach(window: &tauri::WebviewWindow, place: MonitorPlace) -> Result<Inner, String> {
    let ((container, view), report) = on_webview(window, move |main, host| {
        let overlay = overlay_host(host)?;
        let container = PassThroughView::new(main, overlay_rect(host, &overlay, place.stage));
        container.setWantsLayer(true);
        container.setClipsToBounds(true);
        // The overlay is outside WebKit's private view hierarchy. AppKit owns
        // the conversion into this coordinate system, and `None` places it at
        // the front of the window content view.
        overlay.addSubview_positioned_relativeTo(&container, NSWindowOrderingMode::Above, None);
        let view = NSView::initWithFrame(NSView::alloc(main), child_rect(place));
        // Metal draws into this view's layer, so it has to have one. wgpu
        // replaces it with a CAMetalLayer when it makes the surface; without
        // this the view is not layer backed and there is nothing to replace.
        view.setWantsLayer(true);
        container.addSubview(&view);
        let report = geometry_report(host, &overlay, &container, &view, place);
        // Retained past the end of this block on purpose: the `Viewport` owns
        // it now and `detach` is what releases it.
        let pointer =
            NonNull::new(Retained::into_raw(view)).ok_or("the monitor view has no address")?;
        let container = NonNull::new(Retained::into_raw(container))
            .ok_or("the monitor container has no address")?;
        let handles = (Handle(container.cast()), Handle(pointer));
        Ok((handles, report))
    })?;
    Ok(Inner {
        container,
        view,
        window: window.clone(),
        geometry: Arc::new(Mutex::new(report)),
    })
}

/// Move both views and answer what the picture's size in physical pixels now
/// is.
///
/// The size is read in the same main thread hop that moved the view, and after
/// the move rather than before. A window dragged onto a display with a
/// different scale factor changes that number without changing the box, so a
/// reading taken anywhere else is a reading of the display it used to be on.
pub fn place(inner: &Inner, at: MonitorPlace) -> (u32, u32) {
    let view = inner.view;
    let container = inner.container;
    let geometry = Arc::clone(&inner.geometry);
    on_webview(&inner.window, move |_, host| {
        let overlay = overlay_host(host)?;
        // SAFETY: both views are alive until `detach` releases the container.
        let container = unsafe { container.ptr().as_ref() };
        container.setFrame(overlay_rect(host, &overlay, at.stage));
        let view = unsafe { view.ptr().as_ref() };
        view.setFrame(child_rect(at));
        *geometry.lock().unwrap() = geometry_report(host, &overlay, container, view, at);
        Ok(backing_size(view))
    })
    // Placement is best effort: a window that has gone during a resize is a
    // window nobody is looking at. A surface still may not be sized at zero.
    .unwrap_or((1, 1))
}

pub fn debug_geometry(inner: &Inner) -> String {
    inner.geometry.lock().unwrap().clone()
}

fn rect_text(rect: NSRect) -> String {
    format!(
        "({:.1},{:.1} {:.1}x{:.1})",
        rect.origin.x, rect.origin.y, rect.size.width, rect.size.height
    )
}

fn geometry_report(
    host: &NSView,
    overlay: &NSView,
    container: &NSView,
    view: &NSView,
    requested: MonitorPlace,
) -> String {
    let content_layout = host
        .window()
        .map(|window| rect_text(window.contentLayoutRect()))
        .unwrap_or_else(|| "unavailable".into());
    format!(
        "requested stage=({:.1},{:.1} {:.1}x{:.1}) content=({:.1},{:.1} {:.1}x{:.1}); host frame={} bounds={} visible={} safe={} flipped={}; overlay frame={} bounds={} flipped={}; contentLayout={}; container frame={} bounds={} flipped={}; view frame={} bounds={} flipped={}",
        requested.stage.x,
        requested.stage.y,
        requested.stage.width,
        requested.stage.height,
        requested.content.x,
        requested.content.y,
        requested.content.width,
        requested.content.height,
        rect_text(host.frame()),
        rect_text(host.bounds()),
        rect_text(host.visibleRect()),
        rect_text(host.safeAreaRect()),
        host.isFlipped(),
        rect_text(overlay.frame()),
        rect_text(overlay.bounds()),
        overlay.isFlipped(),
        content_layout,
        rect_text(container.frame()),
        rect_text(container.bounds()),
        container.isFlipped(),
        rect_text(view.frame()),
        rect_text(view.bounds()),
        view.isFlipped(),
    )
}

pub fn set_visible(inner: &Inner, visible: bool) {
    let container = inner.container;
    let _ = on_webview(&inner.window, move |_, _| {
        // SAFETY: messaged on the main thread, and the view is alive until
        // `detach` releases it.
        unsafe { container.ptr().as_ref().setHidden(!visible) };
        Ok(())
    });
}

pub fn detach(inner: &Inner) {
    let view = inner.view;
    let container = inner.container;
    let _ = on_webview(&inner.window, move |_, _| {
        // SAFETY: the pointer came from `Retained::into_raw` in `attach` and is
        // released exactly once, here.
        let _view: Retained<NSView> = unsafe { Retained::from_raw(view.ptr().as_ptr()) }
            .ok_or("the monitor view was already gone")?;
        let container: Retained<NSView> = unsafe { Retained::from_raw(container.ptr().as_ptr()) }
            .ok_or("the monitor container was already gone")?;
        container.removeFromSuperview();
        Ok(())
    });
}

pub fn target(inner: &Inner) -> Result<wgpu::SurfaceTarget<'static>, String> {
    Ok(wgpu::SurfaceTarget::DisplayAndWindow(Box::new(ViewTarget(
        inner.view.0.cast::<std::ffi::c_void>(),
    ))))
}

/// The page's rectangle converted into the window overlay's coordinates.
///
/// DOM viewport coordinates start at the WebView's safe content area. Tauri's
/// macOS window uses a full-size content view, so the AppKit view can extend
/// under the title bar while the page begins below it. `visibleRect` and
/// `bounds` both start at zero in that state; `safeAreaRect` carries the title
/// bar inset. Once the rectangle exists in that coordinate system,
/// `convertRect_toView` carries every ancestor offset, flip and transform into
/// the overlay. Physical pixels do not participate in placement.
fn overlay_rect(host: &NSView, overlay: &NSView, at: Place) -> NSRect {
    let viewport = host.safeAreaRect();
    let width = at.width.max(1.0);
    let height = at.height.max(1.0);
    let inside_webview = NSRect::new(
        NSPoint::new(
            viewport.origin.x + at.x,
            top_origin(host.isFlipped(), viewport, at.y, height),
        ),
        NSSize::new(width, height),
    );
    host.convertRect_toView(inside_webview, Some(overlay))
}

/// The picture inside the container that clips it, so its origin is relative to
/// the stage rather than to the WebView.
fn child_rect(at: MonitorPlace) -> NSRect {
    let width = at.content.width.max(1.0);
    let height = at.content.height.max(1.0);
    NSRect::new(
        NSPoint::new(at.content.x - at.stage.x, at.content.y - at.stage.y),
        NSSize::new(width, height),
    )
}

/// A frame origin for a box whose top edge is `top` points below the visible
/// viewport, in whichever coordinate origin that superview uses.
fn top_origin(flipped: bool, visible: NSRect, top: f64, height: f64) -> f64 {
    if flipped {
        visible.origin.y + top
    } else {
        visible.origin.y + visible.size.height - top - height
    }
}

#[cfg(test)]
mod tests {
    use super::top_origin;
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    fn visible(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }

    /// WKWebView is flipped, so a top-left `y` grows down from its bounds
    /// origin; the plain container is not, so its children flip against its
    /// height. The first case is the one the monitor actually lives in —
    /// getting it wrong mirrors the picture to the far side of the window.
    #[test]
    fn origin_matches_the_superview_coordinate_origin() {
        let rect = visible(0.0, 0.0, 1000.0, 800.0);
        assert_eq!(top_origin(true, rect, 50.0, 200.0), 50.0);
        assert_eq!(top_origin(false, rect, 50.0, 200.0), 550.0);
    }

    #[test]
    fn css_origin_starts_at_the_safe_content_origin() {
        let rect = visible(12.0, 32.0, 1000.0, 800.0);
        assert_eq!(top_origin(true, rect, 50.0, 200.0), 82.0);
        assert_eq!(top_origin(false, rect, 50.0, 200.0), 582.0);
    }
}

/// The picture view's own size in physical pixels.
///
/// `convertRectToBacking` answers for the display the view is on, which is the
/// whole reason the swapchain size is asked of the view rather than computed
/// from a ratio the page carried across. The view has been in the window since
/// `attach` put it there, because a view with no window answers with whatever
/// the main screen happens to be.
fn backing_size(view: &NSView) -> (u32, u32) {
    let backing = view.convertRectToBacking(view.bounds());
    (
        backing.size.width.max(1.0).round() as u32,
        backing.size.height.max(1.0).round() as u32,
    )
}

/// The same reading without moving anything, for the one caller that has just
/// attached a view and not placed it yet.
pub fn surface_size(inner: &Inner) -> (u32, u32) {
    let view = inner.view;
    on_webview(&inner.window, move |_, _| {
        // SAFETY: messaged on the main thread, and the view is alive until
        // `detach` releases it.
        Ok(backing_size(unsafe { view.ptr().as_ref() }))
    })
    .unwrap_or((1, 1))
}
