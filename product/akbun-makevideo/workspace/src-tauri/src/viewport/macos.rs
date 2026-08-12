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
//! # Why the coordinates are (sometimes) flipped
//!
//! AppKit's default origin is the **bottom** left of a view and the page's is
//! the top left — but `WKWebView` overrides `isFlipped` to `YES`, so frames of
//! its subviews are already measured from the top. Everything else in the app
//! speaks the page's coordinates, so the conversion happens here, once, at the
//! boundary — the same place the physical-pixel conversion happens — and it
//! asks the superview which origin it uses rather than assuming one. Assuming
//! bottom-left is exactly what put the monitor at the vertically mirrored
//! position when the container moved from the content view into the WebView.

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
use std::sync::mpsc::channel;

pub struct Inner {
    /// Clips the enlarged Metal view to the monitor rectangle and lets pointer
    /// events continue through to the WebView, which owns zoom gestures.
    container: Handle,
    /// A retained `NSView`. Released in `detach`, on the main thread.
    view: Handle,
    window: tauri::WebviewWindow,
}

struct PassThroughIvars;

define_class!(
    #[unsafe(super(NSView))]
    #[ivars = PassThroughIvars]
    struct PassThroughView;

    impl PassThroughView {
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
/// The page measures the stage from the WebView's top-left corner. Its
/// `getBoundingClientRect()` values therefore only describe this view, not the
/// window content view: title bars, future toolbars and an inset WebView would
/// otherwise shift the native monitor outside the Program Monitor. Keeping the
/// native container in the same `WKWebView` makes the two coordinate systems
/// identical.
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

pub fn attach(window: &tauri::WebviewWindow, place: MonitorPlace) -> Result<Inner, String> {
    let handles = on_webview(window, move |main, host| {
        let container = PassThroughView::new(main, rect(host, place.stage));
        container.setWantsLayer(true);
        container.setClipsToBounds(true);
        // Over the page, but *inside* its WebView. A `None` sibling with
        // `Above` means "over all of them", which is the front. The page hides
        // it before drawing anything on top; see the note in mod.rs for why it
        // is not the other way round.
        //
        // Into the window *before* the child is measured: a view with no
        // window answers `convertRectToBacking` with whatever the main screen
        // happens to be, which is the wrong scale whenever this window is on
        // another display.
        host.addSubview_positioned_relativeTo(&container, NSWindowOrderingMode::Above, None);
        let view = NSView::initWithFrame(NSView::alloc(main), child_rect(&container, place));
        // Metal draws into this view's layer, so it has to have one. wgpu
        // replaces it with a CAMetalLayer when it makes the surface; without
        // this the view is not layer backed and there is nothing to replace.
        view.setWantsLayer(true);
        container.addSubview(&view);
        // Retained past the end of this block on purpose: the `Viewport` owns
        // it now and `detach` is what releases it.
        let pointer =
            NonNull::new(Retained::into_raw(view)).ok_or("the monitor view has no address")?;
        let container = NonNull::new(Retained::into_raw(container))
            .ok_or("the monitor container has no address")?;
        Ok((Handle(container.cast()), Handle(pointer)))
    })?;
    Ok(Inner {
        container: handles.0,
        view: handles.1,
        window: window.clone(),
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
    on_webview(&inner.window, move |_, host| {
        // SAFETY: both views are alive until `detach` releases the container.
        let container = unsafe { container.ptr().as_ref() };
        container.setFrame(rect(host, at.stage));
        let view = unsafe { view.ptr().as_ref() };
        view.setFrame(child_rect(container, at));
        Ok(backing_size(view))
    })
    // Placement is best effort: a window that has gone during a resize is a
    // window nobody is looking at. A surface still may not be sized at zero.
    .unwrap_or((1, 1))
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

/// The page's rectangle as AppKit's inside the WebView.
///
/// One conversion, and it is the coordinate origin: the page starts at the
/// visible top-left of the WebView, which is `bounds.origin` rather than zero.
/// The superview is also asked which corner it measures from — `WKWebView` is
/// flipped, so a top-left `y` grows down from that bounds origin. The numbers
/// arriving are points, which is what `setFrame` takes, because a CSS pixel in
/// the page and an AppKit point in a view inside that page's WebView are the
/// same length.
///
/// There used to be a second conversion here, dividing by the view's backing
/// scale to undo a multiplication the page had done by `devicePixelRatio`.
/// Two conversions that cancel are not a conversion; they are an agreement
/// between two numbers measured in different places, and the frames where they
/// disagreed put the monitor at twice its offset and twice its size.
fn rect(host: &NSView, at: Place) -> NSRect {
    let bounds = host.bounds();
    let width = at.width.max(1.0);
    let height = at.height.max(1.0);
    NSRect::new(
        NSPoint::new(
            bounds.origin.x + at.x,
            origin_y(
                host.isFlipped(),
                bounds.origin.y,
                bounds.size.height,
                at.y,
                height,
            ),
        ),
        NSSize::new(width, height),
    )
}

/// The picture inside the container that clips it, so its origin is relative to
/// the stage rather than to the WebView.
fn child_rect(container: &NSView, at: MonitorPlace) -> NSRect {
    let bounds = container.bounds();
    let width = at.content.width.max(1.0);
    let height = at.content.height.max(1.0);
    NSRect::new(
        NSPoint::new(
            bounds.origin.x + at.content.x - at.stage.x,
            origin_y(
                container.isFlipped(),
                bounds.origin.y,
                bounds.size.height,
                at.content.y - at.stage.y,
                height,
            ),
        ),
        NSSize::new(width, height),
    )
}

/// A frame origin for a box whose top edge is `top` points below the visible
/// bounds, in whichever coordinate origin that superview uses.
fn origin_y(
    flipped: bool,
    bounds_origin: f64,
    superview_height: f64,
    top: f64,
    height: f64,
) -> f64 {
    if flipped {
        bounds_origin + top
    } else {
        bounds_origin + superview_height - top - height
    }
}

#[cfg(test)]
mod tests {
    use super::origin_y;

    /// WKWebView is flipped, so a top-left `y` grows down from its bounds
    /// origin; the plain container is not, so its children flip against its
    /// height. The first case is the one the monitor actually lives in —
    /// getting it wrong mirrors the picture to the far side of the window.
    #[test]
    fn origin_matches_the_superview_coordinate_origin() {
        assert_eq!(origin_y(true, 0.0, 800.0, 50.0, 200.0), 50.0);
        assert_eq!(origin_y(false, 0.0, 800.0, 50.0, 200.0), 550.0);
    }

    #[test]
    fn origin_starts_at_the_visible_bounds() {
        assert_eq!(origin_y(true, 32.0, 800.0, 50.0, 200.0), 82.0);
        assert_eq!(origin_y(false, 32.0, 800.0, 50.0, 200.0), 582.0);
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
