//! Reading originals. Files are opened read only and never written.
//!
//! JPEG, PNG, TIFF, WebP and friends decode in process. Camera RAW and HEIC go
//! through macOS's own image engine (`sips`), the one Photos and Preview use,
//! so every camera macOS supports works without a RAW library here.

use image::{imageops::FilterType, DynamicImage, ImageDecoder, ImageReader, RgbImage};
use std::path::Path;
use std::process::Command;

const DIRECT: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff", "webp", "bmp", "gif"];
const SYSTEM: &[&str] = &[
    "heic", "heif", "raf", "arw", "cr2", "cr3", "nef", "nrw", "orf", "rw2", "dng", "pef", "srw", "raw",
];

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

pub fn is_supported(path: &Path) -> bool {
    let ext = extension(path);
    DIRECT.contains(&ext.as_str()) || SYSTEM.contains(&ext.as_str())
}

/// Decode `path` upright, shrunk so its long edge is at most `max_edge`.
pub fn decode(path: &Path, max_edge: Option<u32>) -> crate::Result<RgbImage> {
    let image = if SYSTEM.contains(&extension(path).as_str()) {
        decode_with_system(path, max_edge)?
    } else {
        decode_direct(path)?
    };
    Ok(fit(image, max_edge))
}

fn decode_direct(path: &Path) -> crate::Result<RgbImage> {
    let err = |e: image::ImageError| format!("{}: {e}", path.display());
    let reader = ImageReader::open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?
        .with_guessed_format()
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let mut decoder = reader.into_decoder().map_err(err)?;
    let orientation = decoder.orientation().map_err(err)?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(err)?;
    image.apply_orientation(orientation);
    Ok(image.to_rgb8())
}

/// Ask macOS to convert to a temporary TIFF, then read that.
fn decode_with_system(path: &Path, max_edge: Option<u32>) -> crate::Result<RgbImage> {
    if !cfg!(target_os = "macos") {
        return Err(format!("{}: RAW and HEIC need macOS", path.display()));
    }
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let out = dir.path().join("decoded.tiff");
    let mut cmd = Command::new("/usr/bin/sips");
    cmd.arg("-s").arg("format").arg("tiff");
    if let Some(edge) = max_edge {
        cmd.arg("-Z").arg(edge.to_string());
    }
    // sips has no `--`, so an absolute path is what keeps a file name that
    // starts with '-' from being read as a flag.
    let path = std::path::absolute(path).map_err(|e| e.to_string())?;
    let result = cmd
        .arg("--out")
        .arg(&out)
        .arg(&path)
        .output()
        .map_err(|e| format!("cannot run sips: {e}"))?;
    if !result.status.success() || !out.exists() {
        let detail = String::from_utf8_lossy(&result.stderr);
        return Err(format!("{}: macOS could not read this file. {}", path.display(), detail.trim()));
    }
    decode_direct(&out)
}

pub fn fit(image: RgbImage, max_edge: Option<u32>) -> RgbImage {
    match max_edge {
        Some(edge) if image.width().max(image.height()) > edge => {
            let (w, h) = image.dimensions();
            let scale = edge as f32 / w.max(h) as f32;
            let nw = ((w as f32 * scale).round() as u32).max(1);
            let nh = ((h as f32 * scale).round() as u32).max(1);
            image::imageops::resize(&image, nw, nh, FilterType::Triangle)
        }
        _ => image,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extensions_are_case_insensitive() {
        assert!(is_supported(Path::new("/a/B.JPG")));
        assert!(is_supported(Path::new("/a/DSCF0001.RAF")));
        assert!(!is_supported(Path::new("/a/notes.txt")));
        assert!(!is_supported(Path::new("/a/no-extension")));
    }

    #[test]
    fn decodes_and_shrinks_a_png() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.png");
        RgbImage::from_pixel(400, 200, image::Rgb([10, 20, 30])).save(&path).unwrap();
        let image = decode(&path, Some(100)).unwrap();
        assert_eq!(image.dimensions(), (100, 50));
        assert_eq!(image.get_pixel(0, 0).0, [10, 20, 30]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn decodes_heic_through_the_system() {
        let dir = tempfile::tempdir().unwrap();
        let jpg = dir.path().join("p.jpg");
        let heic = dir.path().join("p.heic");
        RgbImage::from_pixel(64, 32, image::Rgb([200, 100, 50])).save(&jpg).unwrap();
        let made = Command::new("/usr/bin/sips")
            .args(["-s", "format", "heic"])
            .arg(&jpg)
            .arg("--out")
            .arg(&heic)
            .output()
            .unwrap();
        if !made.status.success() {
            return; // This macOS cannot write HEIC; reading is still covered by RAW users.
        }
        let image = decode(&heic, None).unwrap();
        assert_eq!(image.dimensions(), (64, 32));
    }
}
