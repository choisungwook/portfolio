mod adsense;
mod auth;
mod commands;
mod error;
mod settings;

use adsense_cache::Store;
use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      #[cfg(debug_assertions)]
      if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
      }

      let dir = settings::config_dir(app.handle()).map_err(std::io::Error::other)?;
      let store = Store::open(&dir.join("cache.sqlite")).map_err(std::io::Error::other)?;
      app.manage(AppState {
        settings: Mutex::new(settings::load(&dir)),
        dir,
        http: reqwest::Client::new(),
        store: Mutex::new(store),
        account: Mutex::new(None),
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::get_status,
      commands::sign_in,
      commands::sign_out,
      commands::load_report,
      commands::clear_cache,
      commands::save_settle_days,
      commands::open_config_dir,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
