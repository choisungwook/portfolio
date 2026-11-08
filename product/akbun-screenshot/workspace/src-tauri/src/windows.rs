//! The three kinds of window: preview, editor and settings.

use screenshot_core::layout::{self, Rect, PREVIEW_HEIGHT, PREVIEW_WIDTH};
use screenshot_core::png;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const PREVIEW: &str = "preview-";
pub const EDITOR: &str = "editor-";
const SETTINGS: &str = "settings";

/// Which temp png each open preview or editor owns, keyed by window label. A
/// window's file is deleted when the window is destroyed, which is the one place
/// every ending reaches: the buttons, Cmd+W, and quitting the app.
#[derive(Default)]
pub struct Windows {
    owned: Mutex<HashMap<String, PathBuf>>,
    // Two captures inside the same millisecond must not share a temp file, or
    // dismissing either would delete the other's image.
    counter: AtomicU64,
}

impl Windows {
    fn next_id(&self) -> u64 {
        self.counter.fetch_add(1, Ordering::Relaxed)
    }

    pub fn temp_png(&self) -> PathBuf {
        let millis = chrono::Utc::now().timestamp_millis();
        // $TMPDIR on macOS is per user and mode 700, so the name being
        // guessable does not let another account plant a file there.
        std::env::temp_dir().join(format!("akbun-screenshot-{millis}-{}.png", self.next_id()))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, PathBuf>> {
        // A panic while holding the lock cannot leave the map half written, so
        // a poisoned lock is still safe to use.
        self.owned
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The temp png behind a window, only if it is the expected kind. A preview
    /// asking for an editor command gets nothing.
    pub fn file(&self, label: &str, kind: &str) -> Option<PathBuf> {
        if !label.starts_with(kind) {
            return None;
        }
        self.lock().get(label).cloned()
    }

    fn count(&self, kind: &str) -> usize {
        self.lock()
            .keys()
            .filter(|label| label.starts_with(kind))
            .count()
    }

    pub fn release(&self, label: &str) {
        if let Some(file) = self.lock().remove(label) {
            let _ = fs::remove_file(file);
        }
    }

    pub fn release_all(&self) {
        for (_, file) in self.lock().drain() {
            let _ = fs::remove_file(file);
        }
    }
}

pub fn open_preview(app: &AppHandle, file: PathBuf) -> tauri::Result<()> {
    let state = app.state::<Windows>();
    let label = format!("{PREVIEW}{}", state.next_id());
    let (area, _) = work_area(app);
    let (x, y) = layout::preview_position(area, state.count(PREVIEW));
    // Owned before the build, so a window that fails half way still has its
    // file cleaned up below rather than leaking it.
    state.lock().insert(label.clone(), file);

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("preview.html".into()))
        .title("akbun-screenshot Preview")
        .inner_size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .accept_first_mouse(true)
        .build();
    if built.is_err() {
        state.release(&label);
    }
    built.map(|_| ())
}

/// Hands the preview's png to a new editor window and closes the preview. The
/// file changes owner instead of being copied, so closing the preview cannot
/// delete it from under the editor.
pub fn open_editor(app: &AppHandle, preview: &WebviewWindow) -> Result<(), String> {
    let state = app.state::<Windows>();
    let label = format!("{EDITOR}{}", state.next_id());
    // Checked before the preview closes, so a capture the editor cannot open
    // stays on screen instead of vanishing with nothing in its place.
    let file = state
        .file(preview.label(), PREVIEW)
        .ok_or("this preview has no capture")?;
    let size = read_png_size(&file).ok_or("the capture is not a png")?;
    {
        let mut owned = state.lock();
        let file = owned
            .remove(preview.label())
            .ok_or("this preview has no capture")?;
        owned.insert(label.clone(), file);
    }
    let _ = preview.close();

    let (area, scale) = work_area(app);
    let (width, height) = layout::editor_window_size(size, area, scale);
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("editor.html".into()))
        .title("Edit screenshot")
        .inner_size(width, height)
        .center()
        .build();
    match built {
        Ok(window) => {
            prepare(&window);
            Ok(())
        }
        Err(error) => {
            state.release(&label);
            Err(error.to_string())
        }
    }
}

pub fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("akbun-screenshot Settings")
        .inner_size(440.0, 700.0)
        .resizable(false)
        .center()
        .build();
    match built {
        Ok(window) => prepare(&window),
        Err(error) => eprintln!("cannot open settings: {error}"),
    }
}

/// Paints the window in the system theme's colour before the page loads, so it
/// does not flash white in dark mode, and brings it forward: a menu bar app is
/// never the active app when its window opens.
fn prepare(window: &WebviewWindow) {
    let color = match window.theme() {
        Ok(Theme::Dark) => Color(0x1e, 0x1e, 0x1e, 0xff),
        _ => Color(0xff, 0xff, 0xff, 0xff),
    };
    let _ = window.set_background_color(Some(color));
    let _ = window.set_focus();
    #[cfg(debug_assertions)]
    window.open_devtools();
}

fn read_png_size(file: &PathBuf) -> Option<(u32, u32)> {
    let mut head = [0u8; 24];
    File::open(file).ok()?.read_exact(&mut head).ok()?;
    png::size(&head)
}

/// The primary display's work area in points, and its scale factor.
fn work_area(app: &AppHandle) -> (Rect, f64) {
    match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let rect = Rect {
                x: area.position.x as f64 / scale,
                y: area.position.y as f64 / scale,
                width: area.size.width as f64 / scale,
                height: area.size.height as f64 / scale,
            };
            (rect, scale)
        }
        _ => (
            Rect {
                x: 0.0,
                y: 0.0,
                width: 1440.0,
                height: 900.0,
            },
            1.0,
        ),
    }
}
