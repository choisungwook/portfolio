//! Capture through the native screencapture binary. The system draws the
//! selection, so speed and image quality match the system screenshot.

use crate::freeze;
use crate::settings::SettingsStore;
use crate::windows::{self, Windows};
use screenshot_core::capture::CaptureMode;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

/// Set while a screencapture process is running. A second trigger during a
/// selection is ignored instead of stacking a second selection on top.
#[derive(Default)]
pub struct Capturing(AtomicBool);

pub fn start(app: &AppHandle, mode: CaptureMode) {
    if app.state::<Capturing>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    let file = app.state::<Windows>().temp_png();
    let settings = app.state::<SettingsStore>().get();
    let args = mode.args(settings.capture_sound);
    let freezes = mode.can_freeze() && settings.freeze_screen;
    let app = app.clone();
    std::thread::spawn(move || {
        let frozen = freezes.then(|| freeze::show(&app)).flatten();
        let status = Command::new("/usr/sbin/screencapture")
            .args(args)
            .arg(&file)
            .status();
        if let Some(label) = frozen {
            freeze::hide(&app, &label);
        }
        app.state::<Capturing>().0.store(false, Ordering::SeqCst);
        // Esc during a selection exits without writing a file.
        if status.is_ok() && file.exists() {
            if let Err(error) = windows::open_preview(&app, file) {
                eprintln!("cannot open preview: {error}");
            }
        }
    });
}
