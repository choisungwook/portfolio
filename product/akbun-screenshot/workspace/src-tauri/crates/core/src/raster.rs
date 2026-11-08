//! RGBA frames in and out of png bytes, for the scrolling capture.

use std::io::Cursor;

/// An image as tightly packed 8-bit RGBA rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub width: usize,
    pub height: usize,
    pub rgba: Vec<u8>,
}

impl Frame {
    pub fn row(&self, y: usize) -> &[u8] {
        let stride = self.width * 4;
        &self.rgba[y * stride..(y + 1) * stride]
    }
}

/// Decodes a png to RGBA. Palette, grey and 16-bit images are expanded, so
/// two screenshots of the same pixels always compare equal byte for byte.
pub fn decode(bytes: &[u8]) -> Result<Frame, String> {
    let mut decoder = ::png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(::png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let mut buffer = vec![0; reader.output_buffer_size().ok_or("png is too large")?];
    let info = reader.next_frame(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(info.buffer_size());
    let (width, height) = (info.width as usize, info.height as usize);
    let rgba = match info.color_type {
        ::png::ColorType::Rgba => buffer,
        ::png::ColorType::Rgb => buffer
            .as_chunks::<3>()
            .0
            .iter()
            .flat_map(|&[r, g, b]| [r, g, b, 255])
            .collect(),
        ::png::ColorType::GrayscaleAlpha => buffer
            .as_chunks::<2>()
            .0
            .iter()
            .flat_map(|&[g, a]| [g, g, g, a])
            .collect(),
        ::png::ColorType::Grayscale => buffer.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        other => return Err(format!("unsupported png colour type {other:?}")),
    };
    Ok(Frame {
        width,
        height,
        rgba,
    })
}

pub fn encode(frame: &Frame) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut encoder = ::png::Encoder::new(&mut bytes, frame.width as u32, frame.height as u32);
    encoder.set_color(::png::ColorType::Rgba);
    encoder.set_depth(::png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer
        .write_image_data(&frame.rgba)
        .map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_round_trips() {
        let frame = Frame {
            width: 2,
            height: 2,
            rgba: vec![
                1, 2, 3, 255, 4, 5, 6, 255, //
                7, 8, 9, 128, 10, 11, 12, 0,
            ],
        };
        let decoded = decode(&encode(&frame).unwrap()).unwrap();
        assert_eq!(decoded, frame);
        assert_eq!(decoded.row(1), &frame.rgba[8..16]);
    }

    #[test]
    fn garbage_is_an_error() {
        assert!(decode(b"not a png").is_err());
    }
}
