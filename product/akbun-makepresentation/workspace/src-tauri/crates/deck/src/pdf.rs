//! Assemble a PDF from one JPEG per slide.
//!
//! The page renders each slide to a canvas and hands over JPEG bytes, so all
//! this has to do is wrap them: JPEG is a native PDF filter (DCTDecode) and
//! embeds byte-for-byte. Hand-writing the objects keeps the crate free of a
//! PDF dependency for what is ~100 lines of bookkeeping.

use std::io::Write;

pub struct JpegPage {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// A slide is 13.333 x 7.5 inches; in PDF points that is exactly 960 x 540.
const PAGE_W: f64 = 960.0;
const PAGE_H: f64 = 540.0;

pub fn write<W: Write>(pages: &[JpegPage], mut out: W) -> Result<(), String> {
    if pages.is_empty() {
        return Err("nothing to export".into());
    }

    // Objects: 1 catalog, 2 page tree, then per page i: 3+3i page,
    // 4+3i contents, 5+3i image.
    let mut body: Vec<Vec<u8>> = Vec::new();
    let page_ids: Vec<usize> = (0..pages.len()).map(|i| 3 + 3 * i).collect();

    let kids = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");
    body.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());
    body.push(
        format!(
            "<< /Type /Pages /Kids [{kids}] /Count {} >>",
            pages.len()
        )
        .into_bytes(),
    );

    for (i, page) in pages.iter().enumerate() {
        let contents_id = 4 + 3 * i;
        let image_id = 5 + 3 * i;
        body.push(
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] \
/Resources << /XObject << /Im0 {image_id} 0 R >> >> /Contents {contents_id} 0 R >>"
            )
            .into_bytes(),
        );

        let stream = format!("q {PAGE_W} 0 0 {PAGE_H} 0 0 cm /Im0 Do Q");
        body.push(
            format!(
                "<< /Length {} >>\nstream\n{stream}\nendstream",
                stream.len()
            )
            .into_bytes(),
        );

        let mut image = format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} \
/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            page.width,
            page.height,
            page.data.len()
        )
        .into_bytes();
        image.extend_from_slice(&page.data);
        image.extend_from_slice(b"\nendstream");
        body.push(image);
    }

    let mut offsets = Vec::new();
    let mut written = Vec::new();
    written.extend_from_slice(b"%PDF-1.4\n");
    for (i, object) in body.iter().enumerate() {
        offsets.push(written.len());
        written.extend_from_slice(format!("{} 0 obj\n", i + 1).as_bytes());
        written.extend_from_slice(object);
        written.extend_from_slice(b"\nendobj\n");
    }

    let xref_at = written.len();
    written.extend_from_slice(format!("xref\n0 {}\n", body.len() + 1).as_bytes());
    written.extend_from_slice(b"0000000000 65535 f \n");
    for offset in &offsets {
        written.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    written.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n",
            body.len() + 1
        )
        .as_bytes(),
    );

    out.write_all(&written).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // The smallest JPEG-shaped bytes; PDF viewers only need the dimensions in
    // the XObject dictionary, and the test only checks structure.
    fn fake_jpeg() -> Vec<u8> {
        vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9]
    }

    #[test]
    fn writes_a_page_per_slide() {
        let pages = vec![
            JpegPage { data: fake_jpeg(), width: 1920, height: 1080 },
            JpegPage { data: fake_jpeg(), width: 1920, height: 1080 },
        ];
        let mut out = Vec::new();
        write(&pages, &mut out).unwrap();
        let text = String::from_utf8_lossy(&out);
        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.contains("/Count 2"));
        assert!(text.contains("/DCTDecode"));
        assert!(text.ends_with("%%EOF\n"));
    }

    #[test]
    fn refuses_empty_export() {
        assert!(write(&[], &mut Vec::new()).is_err());
    }
}
