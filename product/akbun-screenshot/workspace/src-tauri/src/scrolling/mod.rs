//! Scrolling capture: pick a region, scroll it, and get one tall image.
//!
//! 1. `start` covers the main display with a selection overlay.
//! 2. The overlay posts the dragged region to `scroll_region_select`.
//! 3. `session::run` frames the region and shows a Done/Cancel panel beside
//!    it, then grabs the region repeatedly while the user scrolls and stitches
//!    the frames together.
//! 4. Done hands the stitched image to the usual preview. Cancel or closing
//!    the panel throws it away.

mod session;
mod windows;

use screenshot_core::layout::Rect;
use screenshot_core::region;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, State, WebviewWindow};

/// Set by the panel's Done button and read by the capture loop.
#[derive(Default)]
pub struct Scrolling {
    done: AtomicBool,
}

/// The region as the overlay page measures it: CSS pixels from the overlay's
/// top-left, which are points from the main display's top-left.
#[derive(Deserialize)]
pub struct Region {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// One scrolling capture at a time. A second trigger focuses whichever of its
/// windows is open.
pub fn start(app: &AppHandle) {
    if let Some(window) = windows::existing(app) {
        let _ = window.set_focus();
        return;
    }
    if let Err(error) = windows::open_select(app) {
        eprintln!("cannot open scrolling selection: {error}");
    }
}

#[tauri::command]
pub fn scroll_region_select(
    app: AppHandle,
    window: WebviewWindow,
    region: Region,
) -> Result<(), String> {
    if window.label() != windows::SELECT {
        return Err("only the selection overlay picks a region".into());
    }
    let display = crate::windows::main_display(&app).map_err(|e| e.to_string())?;
    let picked = Rect {
        x: display.x + region.x,
        y: display.y + region.y,
        width: region.width,
        height: region.height,
    };
    let region = region::normalize(picked).ok_or("the region is too small")?;
    let _ = window.close();
    app.state::<Scrolling>().done.store(false, Ordering::SeqCst);
    std::thread::spawn(move || session::run(&app, region));
    Ok(())
}

#[tauri::command]
pub fn scroll_done(window: WebviewWindow, state: State<'_, Scrolling>) -> Result<(), String> {
    if window.label() != windows::PANEL {
        return Err("only the scrolling panel can finish the capture".into());
    }
    state.done.store(true, Ordering::SeqCst);
    Ok(())
}
