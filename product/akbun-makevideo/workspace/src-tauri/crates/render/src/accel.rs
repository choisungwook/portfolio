//! Finding a hardware encoder that actually works on this machine.
//!
//! "GPU rendering" here means the **encode** runs on the GPU's dedicated media
//! engine instead of the CPU, and the decode with it. The filter graph — scale,
//! pad, overlay — still runs on the CPU. Encoding is the slow half of a render,
//! so this is where the time is, but it is worth being precise about the claim.
//!
//! `ffmpeg -encoders` lists what ffmpeg was **compiled with**, not what this
//! machine can run: an ffmpeg built with nvenc lists `h264_nvenc` on a laptop
//! with no NVIDIA card at all, and only fails when a render is already under
//! way. So the listing narrows the candidates and a one frame trial encode
//! decides. That costs about 50 ms per candidate and is the difference between
//! knowing and guessing.

use serde::{Deserialize, Serialize};

/// A hardware path that has been confirmed to work.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Acceleration {
    pub encoder: String,
    /// The matching decoder acceleration, when ffmpeg also lists it. Without
    /// `-hwaccel_output_format` the frames come back to system memory, so the
    /// CPU filter graph still works unchanged.
    pub hwaccel: Option<String>,
    /// What the settings sheet shows the user.
    pub label: String,
}

struct Candidate {
    encoder: &'static str,
    hwaccel: &'static str,
    label: &'static str,
}

/// In preference order. Both of these take frames from system memory, which is
/// what a CPU filter graph produces.
///
/// qsv and vaapi are deliberately absent. They want their frames uploaded into
/// device memory with `hwupload`, so they cannot be dropped into this graph by
/// swapping the encoder alone.
const CANDIDATES: &[Candidate] = &[
    Candidate {
        encoder: "h264_videotoolbox",
        hwaccel: "videotoolbox",
        label: "Apple VideoToolbox",
    },
    Candidate {
        encoder: "h264_nvenc",
        hwaccel: "cuda",
        label: "NVIDIA NVENC",
    },
];

pub fn encoders_args() -> Vec<String> {
    vec!["-hide_banner".into(), "-encoders".into()]
}

pub fn hwaccels_args() -> Vec<String> {
    vec!["-hide_banner".into(), "-hwaccels".into()]
}

/// One frame of black through the candidate encoder, thrown away. Exit code
/// zero means the machine really has it.
pub fn trial_args(encoder: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "color=c=black:s=256x256:r=25".into(),
        "-frames:v".into(),
        "1".into(),
        "-c:v".into(),
        encoder.into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]
}

/// Encoder names out of `ffmpeg -encoders`. Rows look like
/// ` V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)`,
/// where the first column is six flag characters and V means video.
///
/// The legend printed above the table has a row of exactly that shape —
/// ` V..... = Video` — so the name is checked as well as the flags. A stray "="
/// in the list would match no candidate and do no harm, but a parser that
/// returns nonsense is a parser nobody can debug later.
pub fn parse_encoders(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let flags = parts.next()?;
            let name = parts.next()?;
            let plausible = name.len() > 1
                && name.starts_with(|c: char| c.is_ascii_alphanumeric())
                && name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
            if flags.len() == 6 && flags.starts_with('V') && plausible {
                Some(name.to_string())
            } else {
                None
            }
        })
        .collect()
}

/// `ffmpeg -hwaccels` prints a header line and then one bare name per line.
pub fn parse_hwaccels(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.contains(' ') && !line.ends_with(':'))
        .map(str::to_string)
        .collect()
}

/// What is worth trial encoding, most preferred first. A candidate whose
/// hwaccel is not listed keeps its encoder and loses only the decode half.
pub fn candidates(encoders: &[String], hwaccels: &[String]) -> Vec<Acceleration> {
    CANDIDATES
        .iter()
        .filter(|candidate| encoders.iter().any(|name| name == candidate.encoder))
        .map(|candidate| Acceleration {
            encoder: candidate.encoder.to_string(),
            hwaccel: hwaccels
                .iter()
                .find(|name| *name == candidate.hwaccel)
                .cloned(),
            label: candidate.label.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ENCODERS: &str = "\
Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 / AVC (codec h264)
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V....D h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V..... h264_qsv             H.264 (Intel Quick Sync Video acceleration) (codec h264)
 A....D aac                  AAC (Advanced Audio Coding)
";

    const HWACCELS: &str = "Hardware acceleration methods:\nvideotoolbox\ncuda\nvaapi\n";

    #[test]
    fn only_video_encoders_come_out_of_the_listing() {
        let names = parse_encoders(ENCODERS);
        assert!(names.contains(&"libx264".to_string()));
        assert!(names.contains(&"h264_videotoolbox".to_string()));
        assert!(!names.contains(&"aac".to_string()), "aac is an audio row");
        assert!(
            !names.contains(&"Encoders:".to_string()),
            "header is not a codec"
        );
        assert!(!names.contains(&"=".to_string()), "legend is not a codec");
    }

    #[test]
    fn the_hwaccel_header_is_not_a_method() {
        assert_eq!(
            parse_hwaccels(HWACCELS),
            vec!["videotoolbox", "cuda", "vaapi"]
        );
    }

    #[test]
    fn videotoolbox_is_preferred_over_nvenc() {
        let found = candidates(&parse_encoders(ENCODERS), &parse_hwaccels(HWACCELS));
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].encoder, "h264_videotoolbox");
        assert_eq!(found[0].hwaccel.as_deref(), Some("videotoolbox"));
        assert_eq!(found[1].encoder, "h264_nvenc");
    }

    #[test]
    fn quick_sync_is_not_offered_even_when_it_is_listed() {
        // It needs hwupload, so swapping the encoder alone would not work.
        let found = candidates(&parse_encoders(ENCODERS), &parse_hwaccels(HWACCELS));
        assert!(found.iter().all(|item| item.encoder != "h264_qsv"));
    }

    #[test]
    fn an_encoder_without_its_decoder_still_counts() {
        let found = candidates(&parse_encoders(ENCODERS), &["cuda".to_string()]);
        assert_eq!(found[0].encoder, "h264_videotoolbox");
        assert_eq!(found[0].hwaccel, None, "decode falls back, encode does not");
    }

    #[test]
    fn nothing_listed_means_nothing_to_try() {
        assert!(candidates(&[], &[]).is_empty());
        assert!(candidates(&["libx264".to_string()], &[]).is_empty());
    }

    #[test]
    fn the_trial_encodes_one_frame_and_writes_nothing() {
        let args = trial_args("h264_videotoolbox").join(" ");
        assert!(args.contains("-frames:v 1"), "{args}");
        assert!(args.contains("-c:v h264_videotoolbox"), "{args}");
        assert!(args.ends_with("-f null -"), "{args}");
    }
}
