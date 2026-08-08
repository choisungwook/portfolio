use makevideo_edit::{Asset, AssetKind};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const FOLDER: &str = "waveforms";
pub const SAMPLE_RATE: usize = 8_000;
pub const BUCKETS_PER_SECOND: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Waveform {
    pub source_path: String,
    pub source_modified_ms: u64,
    pub buckets_per_second: u32,
    pub peaks: Vec<[f32; 2]>,
}

pub fn needs_waveform(asset: &Asset) -> bool {
    asset.kind == AssetKind::Audio || (asset.kind == AssetKind::Video && asset.has_audio)
}

pub fn waveform_dir(project_path: &str) -> Result<PathBuf, String> {
    Path::new(project_path)
        .parent()
        .map(|parent| parent.join(FOLDER))
        .ok_or_else(|| "the project needs a folder before waveforms can be made".into())
}

pub fn waveform_path(project_path: &str, asset_id: &str) -> Result<PathBuf, String> {
    Ok(waveform_dir(project_path)?.join(format!("{asset_id}.json")))
}

pub fn source_modified_ms(path: &str) -> Option<u64> {
    Path::new(path)
        .metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

pub fn read_valid(project_path: &str, asset: &Asset) -> Option<Waveform> {
    let path = waveform_path(project_path, &asset.id).ok()?;
    let waveform: Waveform = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let modified = source_modified_ms(&asset.path)?;
    (waveform.source_path == asset.path && waveform.source_modified_ms == modified)
        .then_some(waveform)
}

pub fn write(project_path: &str, asset: &Asset, peaks: Vec<[f32; 2]>) -> Result<Waveform, String> {
    let source_modified_ms = source_modified_ms(&asset.path)
        .ok_or_else(|| format!("cannot read the modification time of {}", asset.path))?;
    let waveform = Waveform {
        source_path: asset.path.clone(),
        source_modified_ms,
        buckets_per_second: BUCKETS_PER_SECOND as u32,
        peaks,
    };
    let path = waveform_path(project_path, &asset.id)?;
    let text = serde_json::to_string(&waveform).map_err(|error| error.to_string())?;
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path:?}: {error}"))?;
    Ok(waveform)
}

pub fn ffmpeg_args(asset: &Asset) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        asset.path.clone(),
        "-map".into(),
        "0:a:0".into(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        SAMPLE_RATE.to_string(),
        "-f".into(),
        "s16le".into(),
        "pipe:1".into(),
    ]
}

pub struct PeakBuilder {
    samples_per_bucket: usize,
    samples: usize,
    min: i16,
    max: i16,
    peaks: Vec<[f32; 2]>,
}

impl PeakBuilder {
    pub fn new() -> Self {
        Self {
            samples_per_bucket: SAMPLE_RATE / BUCKETS_PER_SECOND,
            samples: 0,
            min: i16::MAX,
            max: i16::MIN,
            peaks: Vec::new(),
        }
    }

    pub fn push(&mut self, sample: i16) {
        self.min = self.min.min(sample);
        self.max = self.max.max(sample);
        self.samples += 1;
        if self.samples == self.samples_per_bucket {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if self.samples == 0 {
            return;
        }
        self.peaks
            .push([self.min as f32 / 32_768.0, self.max as f32 / 32_768.0]);
        self.samples = 0;
        self.min = i16::MAX;
        self.max = i16::MIN;
    }

    pub fn finish(mut self) -> Vec<[f32; 2]> {
        self.flush();
        self.peaks
    }
}

impl Default for PeakBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(kind: AssetKind) -> Asset {
        Asset {
            id: "as1".into(),
            path: "/media/original.mov".into(),
            name: "original.mov".into(),
            kind,
            duration_ms: 1_000,
            width: 1920,
            height: 1080,
            has_audio: true,
        }
    }

    #[test]
    fn audio_and_video_with_audio_need_waveforms() {
        assert!(needs_waveform(&asset(AssetKind::Audio)));
        assert!(needs_waveform(&asset(AssetKind::Video)));
        let mut silent = asset(AssetKind::Video);
        silent.has_audio = false;
        assert!(!needs_waveform(&silent));
        assert!(!needs_waveform(&asset(AssetKind::Image)));
    }

    #[test]
    fn peak_builder_keeps_minimum_and_maximum_for_each_bucket() {
        let mut builder = PeakBuilder::new();
        for sample in 0..80 {
            builder.push(if sample == 20 {
                -16_384
            } else if sample == 40 {
                8_192
            } else {
                0
            });
        }
        let peaks = builder.finish();
        assert_eq!(peaks.len(), 1);
        assert!((peaks[0][0] + 0.5).abs() < 0.001);
        assert!((peaks[0][1] - 0.25).abs() < 0.001);
    }

    #[test]
    fn peak_builder_keeps_full_scale_samples_in_range() {
        let mut builder = PeakBuilder::new();
        builder.push(i16::MIN);
        builder.push(i16::MAX);
        let peaks = builder.finish();
        assert_eq!(peaks, vec![[-1.0, 32_767.0 / 32_768.0]]);
    }

    #[test]
    fn ffmpeg_decodes_first_audio_stream_to_mono_pcm() {
        let args = ffmpeg_args(&asset(AssetKind::Video));
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:a:0"]));
        assert!(args.windows(2).any(|pair| pair == ["-f", "s16le"]));
        assert_eq!(args.last().map(String::as_str), Some("pipe:1"));
    }

    #[test]
    fn cache_is_valid_only_for_the_same_path_and_modification_time() {
        let root = std::env::temp_dir().join(format!("makevideo-waveform-{}", std::process::id()));
        let project = root.join("project.akbunvideo");
        let source = root.join("source.wav");
        std::fs::create_dir_all(root.join(FOLDER)).unwrap();
        std::fs::write(&source, b"source").unwrap();
        let mut media = asset(AssetKind::Audio);
        media.path = source.to_string_lossy().to_string();
        write(project.to_str().unwrap(), &media, vec![[-0.5, 0.5]]).unwrap();
        assert!(read_valid(project.to_str().unwrap(), &media).is_some());
        media.path = root.join("other.wav").to_string_lossy().to_string();
        assert!(read_valid(project.to_str().unwrap(), &media).is_none());
        let _ = std::fs::remove_dir_all(root);
    }
}
