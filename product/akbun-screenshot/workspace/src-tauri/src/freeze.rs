//! Freeze screen: a still of the main display shown over it while the area
//! selection runs, so a tooltip, a menu or a video frame holds still long
//! enough to be selected.

use crate::windows::{self, Windows};
use std::process::Command;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager, WebviewUrl, WebviewWindowBuilder};

pub const FREEZE: &str = "freeze-";
/// Emitted by freeze.html once the still is decoded and on screen.
const READY_EVENT: &str = "freeze-ready";
/// A selection that never starts is worse than one over a live screen, so the
/// wait for the page is bounded.
const READY_TIMEOUT: Duration = Duration::from_secs(2);

/// Takes the still, covers the main display with it and returns the window
/// label to hand back to `hide`. None means capture over the live screen: the
/// still could not be taken or the window did not open.
pub fn show(app: &AppHandle) -> Option<String> {
    let state = app.state::<Windows>();
    let still = state.temp_png();
    // -m main display, -x silent: the shutter belongs to the real capture.
    let taken = Command::new("/usr/sbin/screencapture")
        .args(["-m", "-x"])
        .arg(&still)
        .status()
        .is_ok_and(|status| status.success());
    if !taken || !still.exists() {
        let _ = std::fs::remove_file(&still);
        return None;
    }
    let label = state.adopt(FREEZE, still);

    let (ready_tx, ready_rx) = mpsc::channel();
    let listener = app.once(READY_EVENT, move |_| {
        let _ = ready_tx.send(());
    });
    if let Err(error) = open_window(app, &label) {
        eprintln!("cannot open freeze window: {error}");
        app.unlisten(listener);
        state.release(&label);
        return None;
    }
    if ready_rx.recv_timeout(READY_TIMEOUT).is_err() {
        app.unlisten(listener);
    }
    Some(label)
}

/// Closing the window deletes the still through the Destroyed handler.
pub fn hide(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

fn open_window(app: &AppHandle, label: &str) -> tauri::Result<()> {
    let display = windows::main_display(app)?;
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("freeze.html".into()))
        .title("akbun-screenshot Freeze")
        .position(display.x, display.y)
        .inner_size(display.width, display.height)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()?;
    // Simple fullscreen covers the menu bar without moving to a new Space,
    // which a native fullscreen would animate into.
    window.set_simple_fullscreen(true)
}
