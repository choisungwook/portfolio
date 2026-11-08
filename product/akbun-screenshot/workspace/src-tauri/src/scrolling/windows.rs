//! The three windows of a scrolling capture: the selection overlay, the dashed
//! frame around the region, and the Done/Cancel panel.

use crate::windows::main_display;
use screenshot_core::layout::Rect;
use screenshot_core::region::{self, PANEL_HEIGHT, PANEL_WIDTH};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const SELECT: &str = "scroll-select";
pub const FRAME: &str = "scroll-frame";
pub const PANEL: &str = "scroll-panel";

/// Whichever scrolling capture window is open, if one is.
pub fn existing(app: &AppHandle) -> Option<WebviewWindow> {
    [SELECT, PANEL, FRAME]
        .into_iter()
        .find_map(|label| app.get_webview_window(label))
}

fn overlay<'a>(
    app: &'a AppHandle,
    label: &str,
    page: &str,
    rect: Rect,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title("akbun-screenshot Scrolling Capture")
        .position(rect.x, rect.y)
        .inner_size(rect.width, rect.height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
}

/// A transparent overlay over the whole main display, in simple fullscreen so
/// it covers the menu bar too.
pub fn open_select(app: &AppHandle) -> tauri::Result<()> {
    let display = main_display(app)?;
    let window = overlay(app, SELECT, "scroll-select.html", display)
        .accept_first_mouse(true)
        .build()?;
    window.set_simple_fullscreen(true)?;
    window.set_focus()
}

/// The frame passes every click and scroll through, so the page underneath
/// scrolls as if the frame were not there.
pub fn open_frame(app: &AppHandle, region: Rect) -> tauri::Result<()> {
    let window = overlay(app, FRAME, "scroll-frame.html", region::frame_rect(region))
        .focused(false)
        .build()?;
    window.set_ignore_cursor_events(true)
}

pub fn open_panel(app: &AppHandle, region: Rect) -> tauri::Result<()> {
    let (x, y) = region::panel_position(region, main_display(app)?);
    let rect = Rect {
        x,
        y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    };
    overlay(app, PANEL, "scroll-panel.html", rect)
        .focused(false)
        .accept_first_mouse(true)
        .build()
        .map(|_| ())
}

pub fn close(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}
