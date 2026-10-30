//! `makephoto`: the catalog from a terminal, for scripts and AI agents.
//!
//! It works on the same catalog file as the desktop app, through the same
//! core calls, so the app does not have to be running and an edit made here
//! shows up in the open app within a couple of seconds. Every command prints
//! JSON on stdout; errors go to stderr with exit code 1.

use clap::{Parser, Subcommand};
use makephoto_core::catalog::{self, Filter, Store};
use makephoto_core::edit::{Crop, Edit, FIELDS};
use makephoto_core::{auto, decode, look, render};
use serde_json::{json, Value};
use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "makephoto", version, about = "Catalog and edit photos without opening the app")]
struct Cli {
    /// Catalog file. Defaults to MAKEPHOTO_CATALOG, then the app's own catalog.
    #[arg(long, global = true)]
    catalog: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Catalog location and counts.
    Info,
    /// Add photos or folders (searched recursively). Files stay where they are.
    Import { #[arg(required = true)] paths: Vec<PathBuf> },
    /// Photos, optionally filtered.
    List {
        #[arg(long)] folder: Option<PathBuf>,
        #[arg(long)] tag: Option<String>,
        #[arg(long)] search: Option<String>,
        #[arg(long, default_value_t = 0)] min_rating: u8,
    },
    /// One photo with its full edit.
    Show { id: u64 },
    /// Add and remove tags on photos.
    Tag {
        #[arg(required = true)] ids: Vec<u64>,
        #[arg(long = "add")] add: Vec<String>,
        #[arg(long = "remove")] remove: Vec<String>,
    },
    /// Rename a tag everywhere.
    RenameTag { from: String, to: String },
    /// Every tag with its photo count.
    Tags,
    /// Every folder with its photo count.
    Folders,
    /// Set the star rating (0 to 5).
    Rate { rating: u8, #[arg(required = true)] ids: Vec<u64> },
    /// Take photos out of the catalog. The files are not touched.
    Remove { #[arg(required = true)] ids: Vec<u64> },
    /// Point photos under one folder at another, for a moved or renamed drive.
    Relink { from: PathBuf, to: PathBuf },
    /// Change the edit. Unnamed values are kept.
    Edit {
        id: u64,
        /// name=value, see `makephoto fields`. Repeatable.
        #[arg(long = "set")] set: Vec<String>,
        /// Film look id, or "none". See `makephoto looks`.
        #[arg(long)] look: Option<String>,
        /// x,y,w,h as fractions of the straightened frame, or "none".
        #[arg(long)] crop: Option<String>,
        /// Start from another photo's edit.
        #[arg(long)] from: Option<u64>,
        /// Start from no edit at all.
        #[arg(long)] reset: bool,
    },
    /// Measure photos and set easy-on-the-eye values.
    Auto {
        #[arg(required = true)] ids: Vec<u64>,
        /// straighten, color, brightness, light, contrast, vivid. Default: all.
        #[arg(long = "kind")] kinds: Vec<String>,
        /// Print the result without saving it.
        #[arg(long)] dry_run: bool,
    },
    /// Write a preview JPEG of the edited photo.
    Render {
        id: u64,
        #[arg(long)] out: PathBuf,
        /// Long edge in pixels. Full size when omitted.
        #[arg(long)] size: Option<u32>,
        /// Replace `out` if it exists.
        #[arg(long)] force: bool,
    },
    /// Write full-size edited JPEGs into a folder, never replacing a file.
    Export {
        #[arg(required = true)] ids: Vec<u64>,
        #[arg(long)] dir: PathBuf,
        #[arg(long, default_value_t = 92)] quality: u8,
    },
    /// The film looks.
    Looks,
    /// The edit values `edit --set` accepts, with their ranges.
    Fields,
}

const NAMES: &[&str] = &[
    "info", "import", "list", "show", "tag", "rename-tag", "tags", "folders", "rate", "remove", "relink",
    "edit", "auto", "render", "export", "looks", "fields", "help", "--help", "-h", "--version", "-V",
];

/// Whether the app binary was started as the CLI. Only a known first word
/// counts, so anything macOS passes to a GUI launch still opens the window.
pub fn is_cli_invocation(first: Option<&str>) -> bool {
    first.is_some_and(|f| NAMES.contains(&f))
}

/// Run with the full argv (program name first) and return the exit code.
pub fn run(args: impl IntoIterator<Item = OsString>) -> i32 {
    let cli = match Cli::try_parse_from(args) {
        Ok(cli) => cli,
        Err(e) => {
            let _ = e.print();
            return if e.use_stderr() { 2 } else { 0 };
        }
    };
    match execute(cli) {
        Ok(value) => {
            println!("{}", serde_json::to_string_pretty(&value).unwrap_or_default());
            0
        }
        Err(e) => {
            eprintln!("makephoto: {e}");
            1
        }
    }
}

fn summary(p: &catalog::Photo) -> Value {
    json!({
        "id": p.id,
        "path": p.path,
        "rating": p.rating,
        "tags": p.tags,
        "edited": !p.edit.is_default(),
        "missing": !p.path.exists(),
    })
}

fn parse_crop(text: &str) -> Result<Option<Crop>, String> {
    if text == "none" {
        return Ok(None);
    }
    let v: Vec<f32> = text.split(',').map(|s| s.trim().parse::<f32>()).collect::<Result<_, _>>()
        .map_err(|_| format!("crop '{text}' is not x,y,w,h"))?;
    match v[..] {
        [x, y, w, h] if v.iter().all(|n| n.is_finite()) => Ok(Some(Crop { x, y, w, h }.clamped())),
        _ => Err(format!("crop '{text}' is not x,y,w,h")),
    }
}

fn apply_sets(edit: &mut Edit, sets: &[String]) -> Result<(), String> {
    for item in sets {
        let (name, value) = item.split_once('=').ok_or_else(|| format!("'{item}' is not name=value"))?;
        let value: f32 = value.trim().parse().map_err(|_| format!("'{value}' is not a number"))?;
        edit.set(name.trim(), value)?;
    }
    Ok(())
}

fn execute(cli: Cli) -> Result<Value, String> {
    let store = Store::new(cli.catalog.unwrap_or_else(catalog::default_path));
    match cli.command {
        Command::Info => {
            let c = store.read()?;
            Ok(json!({
                "catalog": store.path(),
                "revision": c.revision,
                "photos": c.photos.len(),
                "folders": c.folders().len(),
                "tags": c.tags().len(),
            }))
        }
        Command::Import { paths } => {
            let paths: Vec<PathBuf> = paths.iter().map(|p| std::path::absolute(p).unwrap_or(p.clone())).collect();
            let (_, report) = store.update(|c| Ok(c.import(&paths)))?;
            Ok(json!(report))
        }
        Command::List { folder, tag, search, min_rating } => {
            let c = store.read()?;
            let folder = folder.map(|f| std::fs::canonicalize(&f).unwrap_or(f));
            let filter = Filter { folder, tag, search, min_rating };
            Ok(Value::Array(c.list(&filter).into_iter().map(summary).collect()))
        }
        Command::Show { id } => {
            let c = store.read()?;
            let p = c.get(id)?;
            let mut v = json!(p);
            v["missing"] = json!(!p.path.exists());
            Ok(v)
        }
        Command::Tag { ids, add, remove } => {
            if add.is_empty() && remove.is_empty() {
                return Err("give --add or --remove".into());
            }
            let (c, _) = store.update(|c| c.tag(&ids, &add, &remove))?;
            ids.iter().map(|id| c.get(*id).map(summary)).collect::<Result<Vec<_>, _>>().map(Value::Array)
        }
        Command::RenameTag { from, to } => {
            let (_, n) = store.update(|c| c.rename_tag(&from, &to))?;
            Ok(json!({ "photos": n }))
        }
        Command::Tags => Ok(json!(store.read()?.tags())),
        Command::Folders => Ok(json!(store.read()?.folders())),
        Command::Rate { rating, ids } => {
            store.update(|c| c.rate(&ids, rating))?;
            Ok(json!({ "rated": ids.len(), "rating": rating }))
        }
        Command::Remove { ids } => {
            let (_, n) = store.update(|c| Ok(c.remove(&ids)))?;
            Ok(json!({ "removed": n }))
        }
        Command::Relink { from, to } => {
            // The catalog holds absolute paths, so a relative argument would
            // match nothing or store a path that depends on the working folder.
            let from = std::path::absolute(&from).map_err(|e| e.to_string())?;
            let to = std::path::absolute(&to).map_err(|e| e.to_string())?;
            let (_, n) = store.update(|c| Ok(c.relink(&from, &to)))?;
            Ok(json!({ "relinked": n }))
        }
        Command::Edit { id, set, look, crop, from, reset } => {
            let crop = crop.as_deref().map(parse_crop).transpose()?;
            if let Some(name) = look.as_deref().filter(|l| *l != "none") {
                look::find(name).ok_or_else(|| format!("unknown look '{name}', see `makephoto looks`"))?;
            }
            let (_, edit) = store.update(|c| {
                let mut edit = match (reset, from) {
                    (true, _) => Edit::default(),
                    (false, Some(other)) => c.get(other)?.edit.clone(),
                    (false, None) => c.get(id)?.edit.clone(),
                };
                apply_sets(&mut edit, &set)?;
                if let Some(name) = look {
                    edit.look = (name != "none").then_some(name);
                }
                if let Some(crop) = crop {
                    edit.crop = crop;
                }
                c.set_edit(id, &edit)
            })?;
            Ok(json!(edit))
        }
        Command::Auto { ids, kinds, dry_run } => {
            let kinds: Vec<auto::Kind> = if kinds.is_empty() {
                auto::ALL.to_vec()
            } else {
                kinds.iter().map(|k| auto::Kind::parse(k)).collect::<Result<_, _>>()?
            };
            let snapshot = store.read()?;
            let mut results = Vec::new();
            for id in ids {
                let photo = snapshot.get(id)?;
                let source = decode::decode(&photo.path, Some(1600))?;
                let outcome = auto::run(&source, &photo.edit, &kinds);
                if !dry_run {
                    store.update(|c| c.set_edit(id, &outcome.edit))?;
                }
                results.push(json!({ "id": id, "edit": outcome.edit, "notes": outcome.notes, "saved": !dry_run }));
            }
            Ok(Value::Array(results))
        }
        Command::Render { id, out, size, force } => {
            let c = store.read()?;
            let photo = c.get(id)?;
            refuse_original(&out, &photo.path)?;
            if out.exists() && !force {
                return Err(format!("{} exists; pass --force to replace it", out.display()));
            }
            let source = decode::decode(&photo.path, size.map(|s| s.saturating_mul(2)))?;
            let image = decode::fit(render::render(&source, &photo.edit), size);
            std::fs::write(&out, render::encode_jpeg(&image, 90)?).map_err(|e| e.to_string())?;
            Ok(json!({ "path": out, "width": image.width(), "height": image.height() }))
        }
        Command::Export { ids, dir, quality } => {
            let c = store.read()?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let mut written = Vec::new();
            for id in ids {
                written.push(render::export(c.get(id)?, &dir, quality)?);
            }
            Ok(json!(written))
        }
        Command::Looks => Ok(json!(look::LOOKS)),
        Command::Fields => Ok(Value::Array(
            FIELDS
                .iter()
                .map(|(name, min, max, about)| json!({ "name": name, "min": min, "max": max, "about": about }))
                .collect(),
        )),
    }
}

/// `--force` must not be a way to overwrite the photo itself.
fn refuse_original(out: &Path, original: &Path) -> Result<(), String> {
    let same = match (std::fs::canonicalize(out), std::fs::canonicalize(original)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if same {
        return Err("refusing to write over the original photo".into());
    }
    Ok(())
}
