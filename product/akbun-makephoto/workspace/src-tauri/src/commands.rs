//! The page's whole surface. Every command that changes the catalog returns
//! the full view, and the page redraws from it.

use image::RgbImage;
use makephoto_core::auto::{self, Kind};
use makephoto_core::catalog::{Catalog, ImportReport, Photo, Store};
use makephoto_core::edit::{Edit, FIELDS};
use makephoto_core::{decode, look, render};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};

/// The long edge previews are decoded at. Big enough for a full-screen
/// retina window, small enough that a slider drag re-renders instantly.
const PREVIEW_EDGE: u32 = 2048;
/// ponytail: a handful of decoded previews kept in memory, newest first; an
/// LRU keyed by size would let this grow if people flip between many photos.
const PREVIEW_CACHE: usize = 6;

/// The catalog file's size and modification time: a cheap stat says whether
/// the parsed copy is still current.
type Stamp = Option<(std::time::SystemTime, u64)>;

pub struct AppState {
    pub store: Store,
    pub thumbs: PathBuf,
    pub settings_path: PathBuf,
    pub settings: Mutex<Settings>,
    previews: Mutex<VecDeque<(u64, PathBuf, Arc<RgbImage>)>>,
    /// One shrunken copy of a preview source, for the look swatches.
    small: Mutex<Option<(u64, PathBuf, u32, Arc<RgbImage>)>>,
    catalog: Mutex<(Stamp, Arc<Catalog>)>,
}

impl AppState {
    pub fn new(store: Store, thumbs: PathBuf, settings_path: PathBuf) -> AppState {
        let settings = std::fs::read(&settings_path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        AppState {
            store,
            thumbs,
            settings_path,
            settings: Mutex::new(settings),
            previews: Mutex::new(VecDeque::new()),
            small: Mutex::new(None),
            catalog: Mutex::new((None, Arc::new(Catalog::default()))),
        }
    }

    /// The catalog, parsed again only when the file changed. The page polls
    /// and every preview looks a photo up, so parsing each time adds up.
    /// ponytail: a write that keeps the same size within the same mtime tick
    /// would be missed until the next one; every write bumps the revision, so
    /// the size nearly always moves too.
    pub fn catalog(&self) -> Result<Arc<Catalog>, String> {
        let stamp = std::fs::metadata(self.store.path()).ok().and_then(|m| Some((m.modified().ok()?, m.len())));
        let mut cached = self.catalog.lock().unwrap();
        if stamp.is_none() || cached.0 != stamp {
            *cached = (stamp, Arc::new(self.store.read()?));
        }
        Ok(cached.1.clone())
    }

    fn small_source(&self, photo: &Photo, edge: u32) -> Result<Arc<RgbImage>, String> {
        if let Some((id, path, size, image)) = self.small.lock().unwrap().as_ref() {
            if *id == photo.id && *path == photo.path && *size == edge {
                return Ok(image.clone());
            }
        }
        let image = Arc::new(decode::fit((*self.preview_source(photo)?).clone(), Some(edge)));
        *self.small.lock().unwrap() = Some((photo.id, photo.path.clone(), edge, image.clone()));
        Ok(image)
    }

    fn preview_source(&self, photo: &Photo) -> Result<Arc<RgbImage>, String> {
        if let Some((_, _, image)) =
            self.previews.lock().unwrap().iter().find(|(id, path, _)| *id == photo.id && *path == photo.path)
        {
            return Ok(image.clone());
        }
        // Decode outside the lock: a RAW can take a second.
        let image = Arc::new(decode::decode(&photo.path, Some(PREVIEW_EDGE))?);
        let mut cache = self.previews.lock().unwrap();
        cache.retain(|(id, _, _)| *id != photo.id);
        cache.push_front((photo.id, photo.path.clone(), image.clone()));
        cache.truncate(PREVIEW_CACHE);
        Ok(image)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// "system", "light" or "dark".
    pub theme: String,
    pub export_quality: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { theme: "dark".into(), export_quality: 92 }
    }
}

#[derive(Serialize)]
pub struct PhotoView {
    id: u64,
    path: PathBuf,
    name: String,
    folder: PathBuf,
    rating: u8,
    tags: Vec<String>,
    edit: Edit,
    missing: bool,
}

#[derive(Serialize)]
pub struct FolderView {
    path: PathBuf,
    count: usize,
    missing: bool,
}

#[derive(Serialize)]
pub struct View {
    revision: u64,
    photos: Vec<PhotoView>,
    tags: Vec<(String, usize)>,
    folders: Vec<FolderView>,
}

fn view(catalog: &Catalog) -> View {
    // A stat per photo; parallel because an external drive answers slowly.
    let photos = catalog
        .photos
        .par_iter()
        .map(|p| PhotoView {
            id: p.id,
            path: p.path.clone(),
            name: p.name(),
            folder: p.folder(),
            rating: p.rating,
            tags: p.tags.clone(),
            edit: p.edit.clone(),
            missing: !p.path.exists(),
        })
        .collect();
    let folders = catalog
        .folders()
        .into_iter()
        .map(|(path, count)| FolderView { missing: !path.is_dir(), path, count })
        .collect();
    View { revision: catalog.revision, photos, tags: catalog.tags().into_iter().collect(), folders }
}

fn change(state: &AppState, f: impl FnOnce(&mut Catalog) -> makephoto_core::Result<()>) -> Result<View, String> {
    state.store.update(f).map(|(c, _)| view(&c))
}

#[derive(Serialize)]
pub struct Bootstrap {
    view: View,
    settings: Settings,
    looks: &'static [look::Look],
    fields: Vec<serde_json::Value>,
    catalog_path: PathBuf,
    cli_path: Option<PathBuf>,
    version: String,
}

#[tauri::command]
pub async fn bootstrap(app: AppHandle, state: State<'_, AppState>) -> Result<Bootstrap, String> {
    Ok(Bootstrap {
        view: view(&*state.catalog()?),
        settings: state.settings.lock().unwrap().clone(),
        looks: look::LOOKS,
        fields: FIELDS
            .iter()
            .map(|(name, min, max, _)| serde_json::json!({ "name": name, "min": min, "max": max }))
            .collect(),
        catalog_path: state.store.path().to_path_buf(),
        cli_path: std::env::current_exe().ok(),
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub async fn catalog_state(state: State<'_, AppState>) -> Result<View, String> {
    Ok(view(&*state.catalog()?))
}

/// Cheap enough to poll: the page asks every couple of seconds and reloads
/// when the CLI (or anything else) has written the catalog.
#[tauri::command]
pub async fn catalog_revision(state: State<'_, AppState>) -> Result<u64, String> {
    Ok(state.catalog()?.revision)
}

#[derive(Serialize)]
pub struct Imported {
    view: View,
    report: ImportReport,
}

#[tauri::command]
pub async fn import_paths(paths: Vec<PathBuf>, state: State<'_, AppState>) -> Result<Imported, String> {
    let (catalog, report) = state.store.update(|c| Ok(c.import(&paths)))?;
    Ok(Imported { view: view(&catalog), report })
}

#[tauri::command]
pub async fn remove_photos(ids: Vec<u64>, state: State<'_, AppState>) -> Result<View, String> {
    change(&state, |c| {
        c.remove(&ids);
        Ok(())
    })
}

#[tauri::command]
pub async fn tag_photos(
    ids: Vec<u64>,
    add: Vec<String>,
    remove: Vec<String>,
    state: State<'_, AppState>,
) -> Result<View, String> {
    change(&state, |c| c.tag(&ids, &add, &remove))
}

#[tauri::command]
pub async fn rename_tag(from: String, to: String, state: State<'_, AppState>) -> Result<View, String> {
    change(&state, |c| c.rename_tag(&from, &to).map(|_| ()))
}

#[tauri::command]
pub async fn rate_photos(ids: Vec<u64>, rating: u8, state: State<'_, AppState>) -> Result<View, String> {
    change(&state, |c| c.rate(&ids, rating))
}

#[tauri::command]
pub async fn relink_folder(from: PathBuf, to: PathBuf, state: State<'_, AppState>) -> Result<View, String> {
    change(&state, |c| {
        c.relink(&from, &to);
        Ok(())
    })
}

#[tauri::command]
pub async fn save_edit(id: u64, edit: Edit, state: State<'_, AppState>) -> Result<View, String> {
    change(&state, |c| c.set_edit(id, &edit).map(|_| ()))
}

fn photo(state: &AppState, id: u64) -> Result<Photo, String> {
    state.catalog()?.get(id).cloned()
}

/// The edited photo as JPEG bytes. `edit` is what the page is showing, which
/// may not be saved yet while a slider is moving.
#[tauri::command]
pub async fn render_preview(
    id: u64,
    edit: Edit,
    max_edge: u32,
    state: State<'_, AppState>,
) -> Result<Response, String> {
    let photo = photo(&state, id)?;
    let edge = max_edge.clamp(64, PREVIEW_EDGE);
    let image = if edge < PREVIEW_EDGE {
        render::render(&*state.small_source(&photo, edge)?, &edit.sanitized())
    } else {
        render::render(&*state.preview_source(&photo)?, &edit.sanitized())
    };
    Ok(Response::new(render::encode_jpeg(&image, 85)?))
}

/// Suggested values; the page saves them as one undoable step.
#[tauri::command]
pub async fn auto_adjust(
    id: u64,
    edit: Edit,
    kinds: Vec<String>,
    state: State<'_, AppState>,
) -> Result<auto::Outcome, String> {
    let kinds: Vec<Kind> = kinds.iter().map(|k| Kind::parse(k)).collect::<Result<_, _>>()?;
    let photo = photo(&state, id)?;
    let source = state.preview_source(&photo)?;
    Ok(auto::run(&source, &edit, &kinds))
}

#[derive(Serialize)]
pub struct Thumbnail {
    id: u64,
    path: Option<PathBuf>,
    error: Option<String>,
}

#[tauri::command]
pub async fn thumbnails(ids: Vec<u64>, state: State<'_, AppState>) -> Result<Vec<Thumbnail>, String> {
    let catalog = state.catalog()?;
    let photos: Vec<&Photo> = ids.iter().filter_map(|id| catalog.get(*id).ok()).collect();
    Ok(photos
        .par_iter()
        .map(|p| match render::ensure_thumbnail(&state.thumbs, p) {
            Ok(path) => Thumbnail { id: p.id, path: Some(path), error: None },
            Err(e) => Thumbnail { id: p.id, path: None, error: Some(e) },
        })
        .collect())
}

#[derive(Serialize)]
pub struct Exported {
    written: Vec<PathBuf>,
    failed: Vec<String>,
}

#[tauri::command]
pub async fn export_photos(ids: Vec<u64>, dir: PathBuf, state: State<'_, AppState>) -> Result<Exported, String> {
    let catalog = state.catalog()?;
    let quality = state.settings.lock().unwrap().export_quality;
    let photos: Vec<&Photo> = ids.iter().filter_map(|id| catalog.get(*id).ok()).collect();
    let results: Vec<_> = photos.par_iter().map(|p| render::export(p, &dir, quality)).collect();
    let mut out = Exported { written: Vec::new(), failed: Vec::new() };
    for r in results {
        match r {
            Ok(path) => out.written.push(path),
            Err(e) => out.failed.push(e),
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn save_settings(settings: Settings, app: AppHandle, state: State<'_, AppState>) -> Result<Settings, String> {
    let settings = Settings { export_quality: settings.export_quality.clamp(50, 100), ..settings };
    if let Some(dir) = state.settings_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&state.settings_path, bytes).map_err(|e| e.to_string())?;
    apply_theme(&app, &settings.theme);
    *state.settings.lock().unwrap() = settings.clone();
    Ok(settings)
}

/// Leave the window theme unset to follow the system; pinning one stops the
/// page's prefers-color-scheme from tracking the OS.
pub fn apply_theme(app: &AppHandle, theme: &str) {
    let wanted = match theme {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(wanted);
    }
}

pub fn thumbs_dir() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    home.join("Library/Caches/io.akbun.makephoto/thumbs")
}

pub fn settings_file(store: &Store) -> PathBuf {
    store.path().parent().unwrap_or(Path::new(".")).join("settings.json")
}
