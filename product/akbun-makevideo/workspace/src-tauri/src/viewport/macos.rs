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
//! # Why the coordinates are flipped
//!
//! AppKit's origin is the **bottom** left of the content view and the page's is
//! the top left. Everything else in the app speaks the page's coordinates, so
//! the flip happens here, once, at the boundary — the same place the
//! physical-pixel conversion happens.

use super::Place;
use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSView, NSWindow, NSWindowOrderingMode};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use raw_window_handle::{
    AppKitDisplayHandle, AppKitWindowHandle, DisplayHandle, HandleError, HasDisplayHandle,
    HasWindowHandle, RawDisplayHandle, RawWindowHandle, WindowHandle,
};
use std::ptr::NonNull;
use std::sync::mpsc::channel;

pub struct Inner {
    /// A retained `NSView`. Released in `detach`, on the main thread.
    view: Handle,
    window: tauri::WebviewWindow,
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

/// Run `work` on the main thread and wait for what it returns.
///
/// Waiting is deliberate. Attaching and placing are rare — a project opening, a
/// panel resizing — and a caller that carried on without knowing whether the
/// view exists would go on to make a surface for nothing.
fn on_main<T, F>(window: &tauri::WebviewWindow, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(MainThreadMarker) -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = channel();
    window
        .run_on_main_thread(move || {
            let answer = match MainThreadMarker::new() {
                Some(main) => work(main),
                None => Err("run_on_main_thread did not run on the main thread".into()),
            };
            let _ = sender.send(answer);
        })
        .map_err(|error| format!("cannot reach the main thread: {error}"))?;
    receiver
        .recv()
        .map_err(|error| format!("the main thread never answered: {error}"))?
}

pub fn attach(window: &tauri::WebviewWindow, place: Place) -> Result<Inner, String> {
    let handle = window.clone();
    let view = on_main(window, move |main| {
        let content = content_view(&handle)?;
        let view = NSView::initWithFrame(NSView::alloc(main), rect(&content, place));
        // Metal draws into this view's layer, so it has to have one. wgpu
        // replaces it with a CAMetalLayer when it makes the surface; without
        // this the view is not layer backed and there is nothing to replace.
        view.setWantsLayer(true);
        // Over the webview. A `None` sibling with `Above` means "over all of
        // them", which is the front. The page hides it before drawing anything
        // on top; see the note in mod.rs for why it is not the other way round.
        content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Above, None);
        // Retained past the end of this block on purpose: the `Viewport` owns
        // it now and `detach` is what releases it.
        let pointer =
            NonNull::new(Retained::into_raw(view)).ok_or("the monitor view has no address")?;
        Ok(Handle(pointer))
    })?;
    Ok(Inner {
        view,
        window: window.clone(),
    })
}

pub fn place(inner: &Inner, at: Place) {
    let handle = inner.window.clone();
    let view = inner.view;
    // Placement is best effort: a window that has gone during a resize is a
    // window nobody is looking at.
    let _ = on_main(&inner.window, move |_| {
        let content = content_view(&handle)?;
        // SAFETY: messaged on the main thread, and the view is alive until
        // `detach` releases it.
        let view = unsafe { view.ptr().as_ref() };
        view.setFrame(rect(&content, at));
        Ok(())
    });
}

pub fn set_visible(inner: &Inner, visible: bool) {
    let view = inner.view;
    let _ = on_main(&inner.window, move |_| {
        // SAFETY: messaged on the main thread, and the view is alive until
        // `detach` releases it.
        unsafe { view.ptr().as_ref().setHidden(!visible) };
        Ok(())
    });
}

pub fn detach(inner: &Inner) {
    let view = inner.view;
    let _ = on_main(&inner.window, move |_| {
        // SAFETY: the pointer came from `Retained::into_raw` in `attach` and is
        // released exactly once, here.
        let view: Retained<NSView> = unsafe { Retained::from_raw(view.ptr().as_ptr()) }
            .ok_or("the monitor view was already gone")?;
        view.removeFromSuperview();
        Ok(())
    });
}

pub fn target(inner: &Inner) -> Result<wgpu::SurfaceTarget<'static>, String> {
    Ok(wgpu::SurfaceTarget::Window(Box::new(ViewTarget(
        inner.view.0.cast::<std::ffi::c_void>(),
    ))))
}

fn content_view(window: &tauri::WebviewWindow) -> Result<Retained<NSView>, String> {
    let ns_window = window
        .ns_window()
        .map_err(|error| format!("no native window: {error}"))?;
    if ns_window.is_null() {
        return Err("the window has no native handle yet".into());
    }
    // SAFETY: tauri hands back the window's own `NSWindow`, which it keeps
    // alive for as long as the window exists.
    let ns_window: Retained<NSWindow> = unsafe {
        Retained::retain(ns_window.cast::<NSWindow>()).ok_or("the native window went away")?
    };
    ns_window
        .contentView()
        .ok_or_else(|| "the window has no content view".to_string())
}

/// The page's rectangle as AppKit's.
///
/// Two conversions in one place. The y axis is flipped against the content
/// view's height, and the numbers arriving are physical pixels while AppKit
/// wants points — the content view's own bounds against its backing size is
/// where that ratio comes from, rather than asking the screen, which can be the
/// wrong one when the window straddles two displays.
fn rect(content: &NSView, at: Place) -> NSRect {
    let scale = backing_scale(content);
    let bounds = content.bounds();
    let (x, y, width, height) = (
        at.x / scale,
        at.y / scale,
        at.width.max(1.0) / scale,
        at.height.max(1.0) / scale,
    );
    NSRect::new(
        NSPoint::new(x, bounds.size.height - y - height),
        NSSize::new(width, height),
    )
}

fn backing_scale(content: &NSView) -> f64 {
    let bounds = content.bounds();
    if bounds.size.width <= 0.0 {
        return 1.0;
    }
    let backing = content.convertRectToBacking(bounds);
    let scale = backing.size.width / bounds.size.width;
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}
