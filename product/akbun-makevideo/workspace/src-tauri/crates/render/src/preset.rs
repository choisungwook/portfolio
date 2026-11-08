//! Render presets: the long edge of the output and how hard the encoder works.

/// How hard the encoder works for the picture. The CPU route turns this into
/// an x264 `-crf`, a hardware encoder into a bitrate, because a media engine
/// has no quality target that is available everywhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    High,
    Medium,
    Low,
}

impl Quality {
    pub fn parse(name: &str) -> Result<Quality, String> {
        match name {
            "high" => Ok(Quality::High),
            "medium" | "" => Ok(Quality::Medium),
            "low" => Ok(Quality::Low),
            other => Err(format!("unknown render quality: {other}")),
        }
    }

    pub(crate) fn crf(self) -> u32 {
        match self {
            Quality::High => 17,
            Quality::Medium => 20,
            Quality::Low => 24,
        }
    }

    /// Bits per pixel per frame handed to a hardware encoder. Medium is the
    /// figure the app always used, so existing renders do not change.
    pub(crate) fn bits_per_pixel(self) -> f64 {
        match self {
            Quality::High => 0.18,
            Quality::Medium => 0.12,
            Quality::Low => 0.07,
        }
    }
}

/// What a render is asked for. The number is the long edge, not the width, so
/// a vertical project renders 1080x1920 rather than a letterboxed landscape
/// frame with the video in a stripe down the middle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Preset {
    long_edge: u32,
    pub quality: Quality,
}

impl Preset {
    pub const HD: Preset = Preset { long_edge: 1280, quality: Quality::Medium };
    pub const FHD: Preset = Preset { long_edge: 1920, quality: Quality::Medium };
    pub const UHD_4K: Preset = Preset { long_edge: 3840, quality: Quality::Medium };

    pub fn long_edge(self) -> u32 {
        self.long_edge
    }

    pub fn with_quality(self, quality: Quality) -> Preset {
        Preset { quality, ..self }
    }

    pub fn label(self) -> &'static str {
        match self.long_edge {
            1280 => "HD",
            1920 => "FHD",
            _ => "4K",
        }
    }

    pub fn parse(name: &str) -> Result<Preset, String> {
        match name {
            "hd" | "720" => Ok(Preset::HD),
            "fhd" | "1080" => Ok(Preset::FHD),
            "4k" | "uhd" => Ok(Preset::UHD_4K),
            other => Err(format!("unknown render preset: {other}")),
        }
    }
}

