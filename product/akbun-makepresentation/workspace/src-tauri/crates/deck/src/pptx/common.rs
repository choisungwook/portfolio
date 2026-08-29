//! Values and conversions shared by the PPTX reader and writer.

use crate::EMU_PER_PX;

pub(super) const NS: &str = concat!(
    " xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"",
    " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"",
    " xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\""
);

pub(super) fn emu(px: f64) -> i64 {
    (px * EMU_PER_PX).round() as i64
}

pub(super) fn px(emu: i64) -> f64 {
    (emu as f64 / EMU_PER_PX * 100.0).round() / 100.0
}

/// "#rrggbb" -> "RRGGBB". Anything unparseable becomes gray instead of
/// invalid XML.
pub(super) fn hex(color: &str) -> String {
    let c = color.trim_start_matches('#');
    if c.len() == 6 && c.chars().all(|ch| ch.is_ascii_hexdigit()) {
        c.to_ascii_uppercase()
    } else {
        "808080".into()
    }
}

pub(super) fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub(super) const IMAGE_FORMATS: [(&str, &str); 6] = [
    ("png", "image/png"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("svg", "image/svg+xml"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
];

pub(super) fn ext_for_mime(mime: &str) -> Option<&'static str> {
    IMAGE_FORMATS
        .iter()
        .find(|(_, candidate)| *candidate == mime)
        .map(|(ext, _)| *ext)
}

pub(super) fn mime_for_ext(ext: &str) -> Option<&'static str> {
    let ext = ext.to_ascii_lowercase();
    let ext = if ext == "jpg" { "jpeg" } else { &ext };
    IMAGE_FORMATS
        .iter()
        .find(|(candidate, _)| *candidate == ext)
        .map(|(_, mime)| *mime)
}

pub(super) const ARROW_ENDS: [&str; 4] = ["triangle", "arrow", "oval", "diamond"];

pub(super) fn read_arrow_end(end: &Option<String>) -> String {
    match end.as_deref() {
        Some("stealth") => "triangle".into(),
        Some(name) if ARROW_ENDS.contains(&name) => name.into(),
        _ => "none".into(),
    }
}
