//! The capture loop: grab the region, stitch, report, until Done or Cancel.

use super::windows::{self as scroll_windows, FRAME, PANEL};
use super::Scrolling;
use crate::windows::{self, Windows};
use screenshot_core::gather::{self, Gather};
use screenshot_core::layout::Rect;
use screenshot_core::raster::{self, Frame};
use screenshot_core::region;
use screenshot_core::stitch::Step;
use serde::Serialize;
use std::fs;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Pause between frames. screencapture itself takes about a tenth of a second,
/// so this keeps the loop near five frames a second without spinning.
const INTERVAL: Duration = Duration::from_millis(80);
const PROGRESS_EVENT: &str = "scroll-progress";
#[derive(Clone, Serialize)]
struct Progress {
    /// Waiting for the screen to stand still, nothing gathered yet.
    settling: bool,
    height: usize,
    /// The last frame had no overlap, so the user scrolled too fast.
    lost: bool,
    full: bool,
}

enum Ending {
    Done,
    Cancelled,
}

pub fn run(app: &AppHandle, region: Rect) {
    if let Err(error) = scroll_windows::open_frame(app, region)
        .and_then(|_| scroll_windows::open_panel(app, region))
    {
        eprintln!("cannot open scrolling capture windows: {error}");
        close_windows(app);
        return;
    }
    let (ending, gather) = capture_until_finished(app, region);
    close_windows(app);
    let image = match ending {
        Ending::Done => gather.finish(),
        Ending::Cancelled => None,
    };
    if let Some(image) = image {
        if let Err(error) = open_result(app, image) {
            eprintln!("cannot open scrolling capture: {error}");
        }
    }
}

fn capture_until_finished(app: &AppHandle, region: Rect) -> (Ending, Gather) {
    let mut gather = Gather::default();
    loop {
        // Cancel closes the panel, and so does Cmd+W.
        if app.get_webview_window(PANEL).is_none() {
            return (Ending::Cancelled, gather);
        }
        if app.state::<Scrolling>().done.swap(false, Ordering::SeqCst) {
            return (Ending::Done, gather);
        }
        match grab(app, region) {
            Ok(frame) => {
                let progress = gather.push(frame).unwrap_or_else(|error| {
                    eprintln!("{error}");
                    gather::Progress::Stitched(Step::Lost)
                });
                report(app, gather.height(), progress);
            }
            Err(error) => eprintln!("scrolling frame failed: {error}"),
        }
        std::thread::sleep(INTERVAL);
    }
}

fn report(app: &AppHandle, height: usize, progress: gather::Progress) {
    let step = match progress {
        gather::Progress::Settling => None,
        gather::Progress::Stitched(step) => Some(step),
    };
    let progress = Progress {
        settling: step.is_none(),
        height,
        lost: step == Some(Step::Lost),
        full: step == Some(Step::Full),
    };
    let _ = app.emit_to(PANEL, PROGRESS_EVENT, progress);
}

fn grab(app: &AppHandle, region: Rect) -> Result<Frame, String> {
    let file = app.state::<Windows>().temp_png();
    let status = Command::new("/usr/sbin/screencapture")
        .args(region::capture_args(region))
        .arg(&file)
        .status()
        .map_err(|e| e.to_string())?;
    let bytes = fs::read(&file);
    let _ = fs::remove_file(&file);
    if !status.success() {
        return Err(format!("screencapture exited with {status}"));
    }
    raster::decode(&bytes.map_err(|e| e.to_string())?)
}

/// The tall image becomes an ordinary capture: a temp png and a preview with
/// Save, Copy, Edit and Close.
fn open_result(app: &AppHandle, image: Frame) -> Result<(), String> {
    let bytes = raster::encode(&image)?;
    let file = app.state::<Windows>().temp_png();
    fs::write(&file, bytes).map_err(|e| e.to_string())?;
    windows::open_preview(app, file).map_err(|e| e.to_string())
}

fn close_windows(app: &AppHandle) {
    scroll_windows::close(app, FRAME);
    scroll_windows::close(app, PANEL);
}
