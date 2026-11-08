use base64::{engine::general_purpose::STANDARD, Engine};

const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
const DATA_URL_PREFIX: &str = "data:image/png;base64,";

/// Width and height from the IHDR chunk, which the format pins right after the
/// signature. None for anything that is not a png.
pub fn size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    (width > 0 && height > 0).then_some((width, height))
}

/// Decodes the editor's canvas export before anything touches the disk, so a
/// malformed payload leaves no directory and no empty png behind.
pub fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    let bytes = STANDARD
        .decode(data_url.strip_prefix(DATA_URL_PREFIX)?)
        .ok()?;
    size(&bytes).map(|_| bytes)
}

pub fn encode_data_url(bytes: &[u8]) -> String {
    format!("{DATA_URL_PREFIX}{}", STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 2x3 png header: signature, IHDR length, IHDR, width, height.
    fn header() -> Vec<u8> {
        let mut bytes = SIGNATURE.to_vec();
        bytes.extend([0, 0, 0, 13]);
        bytes.extend(b"IHDR");
        bytes.extend(2u32.to_be_bytes());
        bytes.extend(3u32.to_be_bytes());
        bytes
    }

    #[test]
    fn size_reads_ihdr() {
        assert_eq!(size(&header()), Some((2, 3)));
        assert_eq!(size(b"GIF89a not a png at all......"), None);
        assert_eq!(size(&header()[..20]), None);
    }

    #[test]
    fn data_url_round_trips_and_rejects_non_png() {
        let url = encode_data_url(&header());
        assert_eq!(decode_data_url(&url), Some(header()));
        assert_eq!(decode_data_url("data:image/png;base64,"), None);
        assert_eq!(decode_data_url("data:image/jpeg;base64,AAAA"), None);
        assert_eq!(decode_data_url("data:image/png;base64,!!!"), None);
        let text = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(b"hello world, not png")
        );
        assert_eq!(decode_data_url(&text), None);
    }
}
