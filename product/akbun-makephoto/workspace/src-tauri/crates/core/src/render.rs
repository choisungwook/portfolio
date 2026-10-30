//! Original plus edit in, pixels out. The preview, the thumbnails, the CLI and
//! the export all come through `render`, so they cannot drift apart.

use crate::catalog::Photo;
use crate::edit::Edit;
use crate::{decode, develop, geometry};
use image::codecs::jpeg::JpegEncoder;
use image::RgbImage;
use std::fs::{self, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::BufWriter;
use std::path::{Path, PathBuf};

/// Geometry first, so color work only touches pixels that survive the crop.
pub fn render(source: &RgbImage, edit: &Edit) -> RgbImage {
    let mut image = geometry_only(source, edit);
    develop::apply(&mut image, edit);
    image
}

/// Rotate, straighten and crop with no color change.
pub fn geometry_only(source: &RgbImage, edit: &Edit) -> RgbImage {
    let turned = geometry::rotate_quarters(source.clone(), edit.rotate);
    geometry::straighten_and_crop(&turned, edit.straighten, edit.crop)
}

pub fn encode_jpeg(image: &RgbImage, quality: u8) -> crate::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, quality.clamp(1, 100))
        .encode_image(image)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

/// Thumbnails are named after the edit and the original's size and time, so a
/// changed edit or a replaced file gets a new one and old ones are removed.
fn thumbnail_name(photo: &Photo) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(&photo.edit).unwrap_or_default().hash(&mut h);
    if let Ok(meta) = fs::metadata(&photo.path) {
        meta.len().hash(&mut h);
        meta.modified().ok().hash(&mut h);
    }
    format!("{}-{:016x}.jpg", photo.id, h.finish())
}

pub const THUMBNAIL_EDGE: u32 = 480;

pub fn ensure_thumbnail(cache_dir: &Path, photo: &Photo) -> crate::Result<PathBuf> {
    let path = cache_dir.join(thumbnail_name(photo));
    if path.exists() {
        return Ok(path);
    }
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    // Decode a bit larger than the thumbnail: a crop can keep only part of it.
    let source = decode::decode(&photo.path, Some(THUMBNAIL_EDGE * 2))?;
    let image = decode::fit(render(&source, &photo.edit), Some(THUMBNAIL_EDGE));
    // A temp file of its own, since the grid and the filmstrip can ask for the
    // same thumbnail at once; the last rename wins with identical bytes.
    let mut tmp = tempfile::Builder::new().suffix(".tmp").tempfile_in(cache_dir).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut tmp, &encode_jpeg(&image, 80)?).map_err(|e| e.to_string())?;
    tmp.persist(&path).map_err(|e| e.to_string())?;
    remove_stale_thumbnails(cache_dir, photo.id, &path);
    Ok(path)
}

fn remove_stale_thumbnails(cache_dir: &Path, id: u64, keep: &Path) {
    let prefix = format!("{id}-");
    for entry in fs::read_dir(cache_dir).into_iter().flatten().flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(&prefix) && entry.path() != keep {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// `<stem>.jpg` in `dir`, or `<stem>-2.jpg` and up when that exists. The file
/// is created exclusively, so an export never overwrites anything — the
/// original included.
fn create_unique(dir: &Path, stem: &str) -> crate::Result<(PathBuf, fs::File)> {
    for n in 1..10_000 {
        let name = if n == 1 { format!("{stem}.jpg") } else { format!("{stem}-{n}.jpg") };
        let path = dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("cannot write in {}: {e}", dir.display())),
        }
    }
    Err(format!("too many files named {stem} in {}", dir.display()))
}

/// Full resolution, as a new JPEG in `dir`.
pub fn export(photo: &Photo, dir: &Path, quality: u8) -> crate::Result<PathBuf> {
    let source = decode::decode(&photo.path, None)?;
    let image = render(&source, &photo.edit);
    let stem = photo.path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "photo".into());
    let (path, file) = create_unique(dir, &stem)?;
    let written = JpegEncoder::new_with_quality(BufWriter::new(file), quality.clamp(1, 100))
        .encode_image(&image)
        .map_err(|e| e.to_string());
    if let Err(e) = written {
        let _ = fs::remove_file(&path);
        return Err(e);
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn photo(path: PathBuf) -> Photo {
        Photo { id: 7, path, added: 0, rating: 0, tags: vec![], edit: Edit::default() }
    }

    #[test]
    fn export_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("a.jpg");
        image::RgbImage::from_pixel(20, 10, image::Rgb([90, 90, 90])).save(&original).unwrap();
        let before = fs::read(&original).unwrap();
        let p = photo(original.clone());
        let first = export(&p, dir.path(), 90).unwrap();
        let second = export(&p, dir.path(), 90).unwrap();
        assert_eq!(first, dir.path().join("a-2.jpg"));
        assert_eq!(second, dir.path().join("a-3.jpg"));
        assert_eq!(fs::read(&original).unwrap(), before);
    }

    #[test]
    fn thumbnail_follows_the_edit() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("a.png");
        image::RgbImage::from_pixel(40, 20, image::Rgb([90, 90, 90])).save(&original).unwrap();
        let cache = dir.path().join("thumbs");
        let mut p = photo(original);
        let first = ensure_thumbnail(&cache, &p).unwrap();
        p.edit.exposure = 1.0;
        let second = ensure_thumbnail(&cache, &p).unwrap();
        assert_ne!(first, second);
        assert!(!first.exists() && second.exists());
    }
}
