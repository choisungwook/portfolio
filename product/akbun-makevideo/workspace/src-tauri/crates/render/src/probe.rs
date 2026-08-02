//! Reading what an imported file actually is.
//!
//! ffprobe's default output is `key=value` lines, which is less work to parse
//! than json and keeps this crate free of serde_json. As with ffmpeg.rs the
//! process is run by the caller; only the argument list and the parsing live
//! here, so both can be tested without ffprobe on the runner.

use crate::AssetKind;

impl AssetKind {
    /// The extension is the only thing available before ffprobe runs, and it is
    /// also the fallback when ffprobe is not installed at all.
    pub fn from_path(path: &str) -> Option<AssetKind> {
        let extension = path.rsplit_once('.')?.1.to_ascii_lowercase();
        match extension.as_str() {
            "mp4" | "mov" | "m4v" | "mkv" | "webm" | "avi" | "mpg" | "mpeg" | "wmv" | "flv" => {
                Some(AssetKind::Video)
            }
            "mp3" | "wav" | "m4a" | "aac" | "flac" | "ogg" | "opus" | "aiff" | "aif" | "wma" => {
                Some(AssetKind::Audio)
            }
            "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff" | "heic" => {
                Some(AssetKind::Image)
            }
            _ => None,
        }
    }
}

/// One asset's worth of what ffprobe found.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Probed {
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_audio: bool,
}

pub fn args(path: &str) -> Vec<String> {
    vec![
        "-v".into(),
        "error".into(),
        "-show_entries".into(),
        "stream=codec_type,width,height:format=duration".into(),
        "-of".into(),
        "default=noprint_wrappers=1".into(),
        path.into(),
    ]
}

/// ffprobe prints one block per stream and then the format block, so width and
/// height are read from the first video stream and everything after it is
/// ignored. A file with a cover art image would otherwise report the size of
/// its album cover as the size of the song.
pub fn parse(text: &str) -> Probed {
    let mut probed = Probed::default();
    let mut current_type = "";
    let mut pending_width = 0u32;
    let mut pending_height = 0u32;
    let mut have_video = false;

    for line in text.lines() {
        let Some((key, value)) = line.trim().split_once('=') else {
            continue;
        };
        match key {
            "codec_type" => {
                // The previous block is finished, so commit what it carried.
                if current_type == "video" && !have_video && pending_width > 0 {
                    probed.width = pending_width;
                    probed.height = pending_height;
                    have_video = true;
                }
                current_type = match value {
                    "video" => "video",
                    "audio" => {
                        probed.has_audio = true;
                        "audio"
                    }
                    _ => "other",
                };
                pending_width = 0;
                pending_height = 0;
            }
            "width" => pending_width = value.parse().unwrap_or(0),
            "height" => pending_height = value.parse().unwrap_or(0),
            // N/A for a still image, and for a stream with no known length.
            "duration" => {
                if let Ok(seconds) = value.parse::<f64>() {
                    if seconds.is_finite() && seconds > 0.0 {
                        probed.duration_ms = (seconds * 1000.0).round() as u64;
                    }
                }
            }
            _ => {}
        }
    }
    if current_type == "video" && !have_video && pending_width > 0 {
        probed.width = pending_width;
        probed.height = pending_height;
    }
    probed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_normal_video_reports_size_length_and_sound() {
        let probed = parse(
            "codec_type=video\nwidth=1920\nheight=1080\ncodec_type=audio\nduration=12.345000\n",
        );
        assert_eq!(
            probed,
            Probed {
                duration_ms: 12_345,
                width: 1920,
                height: 1080,
                has_audio: true,
            }
        );
    }

    #[test]
    fn a_silent_video_is_not_given_an_audio_stream_it_does_not_have() {
        let probed = parse("codec_type=video\nwidth=640\nheight=360\nduration=2.0\n");
        assert!(!probed.has_audio);
    }

    #[test]
    fn cover_art_does_not_become_the_size_of_the_song() {
        // ffprobe lists the embedded jpeg as a video stream first.
        let probed = parse(
            "codec_type=video\nwidth=600\nheight=600\ncodec_type=audio\nwidth=0\nheight=0\nduration=180.0\n",
        );
        assert_eq!(probed.width, 600);
        assert!(probed.has_audio);
        assert_eq!(probed.duration_ms, 180_000);
    }

    #[test]
    fn a_still_has_no_duration_to_report() {
        let probed = parse("codec_type=video\nwidth=800\nheight=600\nduration=N/A\n");
        assert_eq!(probed.duration_ms, 0);
        assert_eq!(probed.width, 800);
    }

    #[test]
    fn empty_output_is_not_a_panic() {
        assert_eq!(parse(""), Probed::default());
    }

    #[test]
    fn the_extension_decides_the_kind_before_ffprobe_runs() {
        assert_eq!(AssetKind::from_path("/a/b.MP4"), Some(AssetKind::Video));
        assert_eq!(AssetKind::from_path("/a/b.wav"), Some(AssetKind::Audio));
        assert_eq!(AssetKind::from_path("/a/b.png"), Some(AssetKind::Image));
        assert_eq!(AssetKind::from_path("/a/b.txt"), None);
        assert_eq!(AssetKind::from_path("/a/noextension"), None);
    }
}
