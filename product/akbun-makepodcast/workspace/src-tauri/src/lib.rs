mod audio;
mod commands;
mod store;

use commands::{AppState, Session};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// How often the page is told what the audio callbacks have seen.
///
/// A callback fires several hundred times a second and an event per callback
/// would spend the whole main thread in the IPC bridge. Thirty a second is
/// smooth to the eye, and the meter and the waveform lose nothing because both
/// accumulate between polls rather than sampling.
const POLL_INTERVAL: Duration = Duration::from_millis(33);

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = store::load_settings(&handle);
            app.manage(AppState {
                settings: Mutex::new(settings),
                session: Mutex::new(Session {
                    devices: audio::list_devices(),
                    ..Session::default()
                }),
                engine: Mutex::new(audio::AudioEngine::default()),
            });
            spawn_poller(handle);

            // The window is the whole app, so the webview console is where
            // almost every bug shows up first. Debug builds only.
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::refresh_devices,
            commands::new_project,
            commands::start_recording,
            commands::stop_recording,
            commands::start_playback,
            commands::stop_playback,
            commands::save_wav,
            commands::save_settings,
            commands::open_project_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// The one place that turns audio state into window events.
///
/// It runs on its own thread rather than inside the audio callbacks, because
/// emitting to a webview takes locks and allocates, and a realtime thread that
/// does either produces a click in the recording.
fn spawn_poller(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        let Some(state) = app.try_state::<AppState>() else {
            continue;
        };
        let (capture, playback) = {
            let Ok(mut engine) = state.engine.lock() else {
                continue;
            };
            (engine.poll_capture(), engine.poll_playback())
        };
        if let Some(update) = capture {
            let _ = app.emit("capture", update);
        }
        if let Some(update) = playback {
            let _ = app.emit("playback", update);
        }
    });
}
