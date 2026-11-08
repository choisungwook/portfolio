//! The #[tauri::command] surface the pages call through window.api (src/api.js).
//!
//! Commands that act on a capture take the calling window and look its png up
//! by label, so a page can only touch the file its own window owns. Anything
//! that copies, encodes or decodes a whole image is async, which runs it off
//! the main thread.

use crate::freeze::FREEZE;
use crate::settings::{register_shortcuts, SettingsStore};
use crate::tray;
use crate::update::notify;
use crate::windows::{self, Windows, EDITOR, PREVIEW};
use screenshot_core::{naming, png, settings::Settings};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::image::Image;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

type Result<T> = std::result::Result<T, String>;

fn owned(state: &Windows, window: &WebviewWindow, kind: &str) -> Result<PathBuf> {
    state
        .file(window.label(), kind)
        .ok_or_else(|| "this window has no capture".to_string())
}

/// The window's own capture as a data URL, which keeps the CSP to data: images.
fn image_url(state: &Windows, window: &WebviewWindow, kind: &str) -> Result<String> {
    let bytes = fs::read(owned(state, window, kind)?).map_err(|e| e.to_string())?;
    Ok(png::encode_data_url(&bytes))
}

fn now() -> chrono::NaiveDateTime {
    chrono::Local::now().naive_local()
}

/// A failed write must not look like a save that did nothing. The editor
/// canvas holds the only copy of the annotated image, so someone who reads a
/// dead button as "nothing happened" clicks Close and loses the work.
fn write_png(window: &WebviewWindow, target: &Path, bytes: &[u8]) -> bool {
    let result = target
        .parent()
        .map_or(Ok(()), fs::create_dir_all)
        .and_then(|_| fs::write(target, bytes));
    match result {
        Ok(()) => true,
        Err(error) => {
            let text = format!("{}\n\n{error}", target.display());
            notify(
                window.app_handle(),
                MessageDialogKind::Error,
                "Could not save the image",
                &text,
            );
            false
        }
    }
}

/// Decoding first is also the check: bytes that are not a png never reach the
/// clipboard, so a bad payload leaves whatever the user copied last in place.
fn copy_image(app: &AppHandle, bytes: &[u8]) -> Result<()> {
    let image = Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    app.clipboard()
        .write_image(&image)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_get(store: State<'_, SettingsStore>) -> Settings {
    store.get()
}

#[tauri::command]
pub fn settings_save(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    next: Settings,
) -> Result<()> {
    let previous = store.get();
    // Presets belong to the editor and its own command. The settings page
    // never sends them, so saving General must not wipe them.
    let next = Settings {
        background_presets: previous.background_presets.clone(),
        ..next
    };
    next.validate()?;
    if let Err(error) = register_shortcuts(&app, &next) {
        let _ = register_shortcuts(&app, &previous);
        return Err(error);
    }
    if let Err(error) = store.save(next.clone()) {
        let _ = register_shortcuts(&app, &previous);
        return Err(error);
    }
    tray::refresh(&app, &next);
    Ok(())
}

/// Installed font families. WKWebView has no queryLocalFonts, so the list
/// comes from the system font directories instead. Scanned once per launch:
/// parsing every font file takes hundreds of milliseconds, and a font
/// installed meanwhile shows up after a relaunch.
#[tauri::command]
pub async fn list_fonts() -> Result<Vec<String>> {
    static FAMILIES: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    Ok(FAMILIES.get_or_init(scan_fonts).clone())
}

fn scan_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let families: BTreeSet<String> = database
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.clone()))
        .filter(|name| !name.starts_with('.'))
        .collect();
    families.into_iter().collect()
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

/// Screen Recording permission. During development it belongs to the terminal
/// that launched `npm start`, not to the app.
#[tauri::command]
pub fn permissions_get() -> Value {
    #[cfg(target_os = "macos")]
    // SAFETY: takes no arguments and only reads the TCC state.
    let granted = unsafe { CGPreflightScreenCaptureAccess() };
    #[cfg(not(target_os = "macos"))]
    let granted = false;
    json!({ "screen": if granted { "granted" } else { "missing" } })
}

#[tauri::command]
pub fn open_screen_settings() -> Result<()> {
    std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// The capture as a data URL rather than a file path: a file:// image drawn into
/// a canvas taints it, and toDataURL on a tainted canvas throws.
#[tauri::command]
pub async fn preview_image(window: WebviewWindow, state: State<'_, Windows>) -> Result<String> {
    image_url(&state, &window, PREVIEW)
}

#[tauri::command]
pub async fn editor_image(window: WebviewWindow, state: State<'_, Windows>) -> Result<String> {
    image_url(&state, &window, EDITOR)
}

#[tauri::command]
pub async fn freeze_image(window: WebviewWindow, state: State<'_, Windows>) -> Result<String> {
    image_url(&state, &window, FREEZE)
}

#[tauri::command]
pub async fn preview_save(
    window: WebviewWindow,
    state: State<'_, Windows>,
    store: State<'_, SettingsStore>,
) -> Result<Option<String>> {
    let bytes = fs::read(owned(&state, &window, PREVIEW)?).map_err(|e| e.to_string())?;
    let target = store
        .get()
        .save_dir()
        .join(naming::screenshot_filename(now()));
    if !write_png(&window, &target, &bytes) {
        return Ok(None);
    }
    let _ = window.close();
    Ok(Some(target.display().to_string()))
}

/// The clipboard holds the bitmap itself, so the temp file going away with the
/// preview afterwards is fine.
#[tauri::command]
pub async fn preview_copy(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Windows>,
) -> Result<()> {
    let bytes = fs::read(owned(&state, &window, PREVIEW)?).map_err(|e| e.to_string())?;
    copy_image(&app, &bytes)?;
    let _ = window.close();
    Ok(())
}

#[tauri::command]
pub async fn preview_edit(app: AppHandle, window: WebviewWindow) -> Result<()> {
    windows::open_editor(&app, &window)
}

/// Closing is the whole job. The window's Destroyed event deletes the temp png.
#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<()> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn editor_save(
    window: WebviewWindow,
    state: State<'_, Windows>,
    store: State<'_, SettingsStore>,
    data_url: String,
) -> Result<Option<String>> {
    owned(&state, &window, EDITOR)?;
    let bytes = png::decode_data_url(&data_url).ok_or("the canvas export is not a png")?;
    let target = store
        .get()
        .save_dir()
        .join(naming::screenshot_filename(now()));
    // The editor stays open on a failure, so the annotations are still there to
    // save somewhere else.
    if !write_png(&window, &target, &bytes) {
        return Ok(None);
    }
    let _ = window.close();
    Ok(Some(target.display().to_string()))
}

/// The dialog belongs here rather than in the page, so a cancel writes nothing
/// and leaves the editor open, and the page never chooses a path to write. It
/// opens on the save directory with the name Save would have used plus an
/// edited stamp, so accepting it straight through needs no typing.
#[tauri::command]
pub async fn editor_save_as(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Windows>,
    store: State<'_, SettingsStore>,
    data_url: String,
) -> Result<()> {
    owned(&state, &window, EDITOR)?;
    let bytes = png::decode_data_url(&data_url).ok_or("the canvas export is not a png")?;
    let now = now();
    let suggested = naming::edited_filename(&naming::screenshot_filename(now), now);
    let target_window = window.clone();
    app.dialog()
        .file()
        .set_parent(&window)
        .set_directory(store.get().save_dir())
        .set_file_name(suggested)
        // Without the filter a typed name is taken verbatim and comes out as an
        // extensionless file full of png bytes.
        .add_filter("PNG", &["png"])
        .save_file(move |path| {
            let Some(path) = path.and_then(|p| p.into_path().ok()) else {
                return;
            };
            if write_png(&target_window, &path, &bytes) {
                let _ = target_window.close();
            }
        });
    Ok(())
}

/// The annotated canvas onto the clipboard, then the window closes the way Save
/// does, so a screenshot that only had to be pasted never becomes a file.
#[tauri::command]
pub async fn editor_copy(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Windows>,
    data_url: String,
) -> Result<()> {
    owned(&state, &window, EDITOR)?;
    let bytes = png::decode_data_url(&data_url).ok_or("the canvas export is not a png")?;
    copy_image(&app, &bytes)?;
    let _ = window.close();
    Ok(())
}
