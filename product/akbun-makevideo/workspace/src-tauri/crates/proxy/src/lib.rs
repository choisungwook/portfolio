use makevideo_edit::{Asset, AssetKind, Project};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const FOLDER: &str = "proxies";
pub const LONG_EDGE: u32 = 1920;
pub const SOURCE_LONG_EDGE: u32 = 1920;
pub const DECODE_THREADS: u32 = 2;
pub const KEYFRAME_SAMPLE_SECONDS: u32 = 30;
pub const MAX_KEYFRAME_INTERVAL_MS: u64 = 2_000;
pub const FORCED_KEYFRAME_INTERVAL_SECONDS: f32 = 0.5;
pub const MANIFEST_VERSION: u32 = 2;
pub const DIRECT_PLAY_CODECS: &[&str] = &["h264"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    #[serde(default)]
    pub version: u32,
    pub source_path: String,
    pub source_modified_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SourceProbe {
    pub codec: String,
    pub keyframe_interval_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Assessment {
    pub needs_proxy: bool,
    pub reason: String,
}

pub fn probe_args(path: &str) -> Vec<String> {
    vec![
        "-v".into(),
        "error".into(),
        "-select_streams".into(),
        "v:0".into(),
        "-read_intervals".into(),
        format!("0%+{KEYFRAME_SAMPLE_SECONDS}"),
        "-show_entries".into(),
        "stream=codec_name:packet=pts_time,flags".into(),
        "-of".into(),
        "default=noprint_wrappers=1".into(),
        path.into(),
    ]
}

pub fn parse_probe(text: &str) -> SourceProbe {
    let mut codec = String::new();
    let mut packet_time_ms = None;
    let mut first_packet_ms = None;
    let mut last_packet_ms = None;
    let mut keyframes = Vec::new();

    for line in text.lines() {
        let Some((key, value)) = line.trim().split_once('=') else {
            continue;
        };
        match key {
            "codec_name" if codec.is_empty() => codec = value.trim().to_ascii_lowercase(),
            "pts_time" => {
                packet_time_ms = seconds_to_millis(value);
                if let Some(time) = packet_time_ms {
                    first_packet_ms = Some(first_packet_ms.map_or(time, |first: u64| first.min(time)));
                    last_packet_ms = Some(last_packet_ms.map_or(time, |last: u64| last.max(time)));
                }
            }
            "flags" if value.contains('K') => {
                if let Some(time) = packet_time_ms {
                    keyframes.push(time);
                }
            }
            _ => {}
        }
    }

    keyframes.sort_unstable();
    keyframes.dedup();
    let mut keyframe_interval_ms = keyframes
        .windows(2)
        .map(|pair| pair[1].saturating_sub(pair[0]))
        .max();
    if let (Some(last_keyframe), Some(last_packet)) = (keyframes.last(), last_packet_ms) {
        let trailing = last_packet.saturating_sub(*last_keyframe);
        keyframe_interval_ms = Some(keyframe_interval_ms.unwrap_or(0).max(trailing));
    } else if let (Some(first), Some(last)) = (first_packet_ms, last_packet_ms) {
        keyframe_interval_ms = Some(last.saturating_sub(first));
    }

    SourceProbe {
        codec,
        keyframe_interval_ms,
    }
}

fn seconds_to_millis(value: &str) -> Option<u64> {
    let seconds = value.parse::<f64>().ok()?;
    (seconds.is_finite() && seconds >= 0.0).then(|| (seconds * 1000.0).round() as u64)
}

pub fn assess(asset: &Asset, probe: &SourceProbe) -> Assessment {
    if asset.kind != AssetKind::Video {
        return Assessment {
            needs_proxy: false,
            reason: "not video media".into(),
        };
    }

    let long_edge = asset.width.max(asset.height);
    let codec = if probe.codec.is_empty() {
        "unknown"
    } else {
        probe.codec.as_str()
    };
    let keyframe_text = probe
        .keyframe_interval_ms
        .map(|interval| format!("{:.1}s keyframes", interval as f64 / 1000.0))
        .unwrap_or_else(|| "unknown keyframes".into());
    let facts = format!("{long_edge}px · {codec} · {keyframe_text}");
    let mut causes = Vec::new();
    if long_edge > SOURCE_LONG_EDGE {
        causes.push(format!("{long_edge}px long edge"));
    }
    if !DIRECT_PLAY_CODECS.contains(&codec) {
        causes.push(format!("{codec} codec"));
    }
    if probe
        .keyframe_interval_ms
        .is_some_and(|interval| interval > MAX_KEYFRAME_INTERVAL_MS)
    {
        causes.push(keyframe_text);
    }
    let needs_proxy = !causes.is_empty();
    Assessment {
        needs_proxy,
        reason: if needs_proxy {
            format!("proxy for {}", causes.join(", "))
        } else {
            format!("original playback: {facts}")
        },
    }
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

pub fn proxy_dir(project_path: &str) -> Result<PathBuf, String> {
    Path::new(project_path)
        .parent()
        .map(|parent| parent.join(FOLDER))
        .ok_or_else(|| "the project needs a folder before proxies can be made".into())
}

pub fn media_path(project_path: &str, asset_id: &str) -> Result<PathBuf, String> {
    Ok(proxy_dir(project_path)?.join(format!("{asset_id}.mp4")))
}

pub fn manifest_path(project_path: &str, asset_id: &str) -> Result<PathBuf, String> {
    Ok(proxy_dir(project_path)?.join(format!("{asset_id}.json")))
}

pub fn valid_proxy(project_path: &str, asset: &Asset) -> Option<String> {
    let media = media_path(project_path, &asset.id).ok()?;
    let manifest_path = manifest_path(project_path, &asset.id).ok()?;
    if !media.is_file() {
        return None;
    }
    let manifest: Manifest =
        serde_json::from_str(&std::fs::read_to_string(manifest_path).ok()?).ok()?;
    let current = source_modified_ms(&asset.path)?;
    (manifest.version == MANIFEST_VERSION
        && manifest.source_path == asset.path
        && manifest.source_modified_ms == current)
        .then(|| media.to_string_lossy().to_string())
}

pub fn write_manifest(project_path: &str, asset: &Asset) -> Result<(), String> {
    let source_modified_ms = source_modified_ms(&asset.path)
        .ok_or_else(|| format!("cannot read the modification time of {}", asset.path))?;
    let manifest = Manifest {
        version: MANIFEST_VERSION,
        source_path: asset.path.clone(),
        source_modified_ms,
    };
    let path = manifest_path(project_path, &asset.id)?;
    let text = serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    std::fs::write(&path, text).map_err(|error| format!("cannot write {path:?}: {error}"))
}

pub fn progress_percent_changed(previous: &mut u8, current: u8) -> bool {
    if *previous == current {
        return false;
    }
    *previous = current;
    true
}

/// The encoder and decoder a proxy is made with. Both come from the
/// acceleration probe, so a name here is one this machine already ran.
#[derive(Debug, Clone, Copy, Default)]
pub struct Codecs<'a> {
    pub encoder: Option<&'a str>,
    pub hwaccel: Option<&'a str>,
}

/// How many proxies are made at once. A media engine runs several sessions
/// side by side, so two jobs roughly halve the wait. The CPU path stays at one
/// so making proxies does not starve the editor.
pub fn concurrent_jobs(codecs: Codecs) -> usize {
    if codecs.encoder.is_some() { 2 } else { 1 }
}

/// The first frame each asset is used at on the timeline.
pub fn first_use(project: &Project) -> HashMap<String, i64> {
    let mut first: HashMap<String, i64> = HashMap::new();
    for clip in project.tracks.iter().flat_map(|track| &track.clips) {
        let start = first.entry(clip.asset_id.clone()).or_insert(clip.start);
        *start = (*start).min(clip.start);
    }
    first
}

/// Proxies for media on the timeline first, earliest use first, then the rest
/// of the bin. What is about to be played is what needs one soonest.
pub fn order_by_first_use<T>(first_use: &HashMap<String, i64>, jobs: &mut [(Asset, T)]) {
    jobs.sort_by_key(|(asset, _)| first_use.get(&asset.id).copied().unwrap_or(i64::MAX));
}

pub fn ffmpeg_args(asset: &Asset, output: &Path, codecs: Codecs) -> Vec<String> {
    let mut args: Vec<String> = vec!["-hide_banner".into(), "-y".into()];
    match codecs.hwaccel {
        // The media engine decodes HEVC, ProRes and 4K H.264, which is most of
        // why a proxy is needed in the first place. Frames come back to system
        // memory, so the scale filter below is unchanged.
        Some(hwaccel) => args.extend(["-hwaccel".into(), hwaccel.into()]),
        None => args.extend(["-threads".into(), DECODE_THREADS.to_string()]),
    }
    args.extend([
        "-i".into(),
        asset.path.clone(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a?".into(),
        "-vf".into(),
        format!(
            "scale='if(gte(iw,ih),min(iw,{}),-2)':'if(gte(iw,ih),-2,min(ih,{}))'",
            LONG_EDGE, LONG_EDGE
        ),
    ]);
    if let Some(encoder) = codecs.encoder {
        args.extend([
            "-c:v".into(),
            encoder.into(),
            "-b:v".into(),
            "4M".into(),
        ]);
    } else {
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "23".into(),
        ]);
    }
    args.extend([
        "-force_key_frames".into(),
        format!("expr:gte(t,n_forced*{FORCED_KEYFRAME_INTERVAL_SECONDS})"),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string_lossy().to_string(),
    ]);
    args
}

pub fn playback_project(project: &Project, ready: &HashMap<String, String>) -> Project {
    let mut playback = project.clone();
    for asset in &mut playback.assets {
        if let Some(path) = ready.get(&asset.id) {
            asset.path = path.clone();
        }
    }
    playback
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_edit::{ProjectSettings, Rate};

    fn asset(kind: AssetKind, width: u32, height: u32) -> Asset {
        Asset {
            id: "as1".into(),
            path: "/media/original.mov".into(),
            name: "original.mov".into(),
            kind,
            duration_ms: 1_000,
            width,
            height,
            has_audio: true,
        }
    }

    #[test]
    fn proxy_decision_uses_resolution_codec_and_keyframe_interval() {
        let direct = SourceProbe {
            codec: "h264".into(),
            keyframe_interval_ms: Some(2_000),
        };
        let long_gop = SourceProbe {
            keyframe_interval_ms: Some(2_001),
            ..direct.clone()
        };
        let hevc = SourceProbe {
            codec: "hevc".into(),
            ..direct.clone()
        };

        assert!(assess(&asset(AssetKind::Video, 3840, 2160), &direct).needs_proxy);
        assert!(assess(&asset(AssetKind::Video, 1920, 1080), &hevc).needs_proxy);
        assert!(assess(&asset(AssetKind::Video, 1920, 1080), &long_gop).needs_proxy);
        assert!(!assess(&asset(AssetKind::Video, 1920, 1080), &direct).needs_proxy);
        assert!(!assess(&asset(AssetKind::Image, 4000, 3000), &hevc).needs_proxy);
    }

    #[test]
    fn packet_probe_reports_codec_and_largest_observed_keyframe_gap() {
        let probe = parse_probe(
            "pts_time=0.000000\nflags=K__\npts_time=1.000000\nflags=___\npts_time=0.900000\nflags=___\npts_time=2.500000\nflags=K__\npts_time=4.000000\nflags=___\ncodec_name=hevc\n",
        );
        assert_eq!(probe.codec, "hevc");
        assert_eq!(probe.keyframe_interval_ms, Some(2_500));
    }

    #[test]
    fn playback_path_changes_without_changing_the_export_project() {
        let original = asset(AssetKind::Video, 3840, 2160);
        let project = Project {
            version: makevideo_edit::FORMAT_VERSION,
            settings: ProjectSettings {
                width: 1920,
                height: 1080,
                rate: Rate::fps(30),
            },
            assets: vec![original.clone()],
            tracks: Vec::new(),
            transitions: Vec::new(),
            markers: Vec::new(),
        };
        let ready = HashMap::from([(original.id.clone(), "/project/proxies/as1.mp4".into())]);
        let playback = playback_project(&project, &ready);
        assert_eq!(playback.assets[0].path, "/project/proxies/as1.mp4");
        assert_eq!(project.assets[0].path, "/media/original.mov");
    }

    #[test]
    fn ffmpeg_scales_the_long_edge_and_keeps_optional_audio() {
        let args = ffmpeg_args(
            &asset(AssetKind::Video, 3840, 2160),
            Path::new("proxy.mp4"),
            Codecs::default(),
        );
        assert!(args.iter().any(|arg| arg.contains("1920")));
        assert!(args.windows(2).any(|pair| {
            pair[0] == "-force_key_frames" && pair[1] == "expr:gte(t,n_forced*0.5)"
        }));
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:a?"]));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-threads" && pair[1] == DECODE_THREADS.to_string()));
        assert!(args.windows(2).any(|pair| pair == ["-threads", "2"]));
        assert!(args.windows(2).any(|pair| pair == ["-i", "/media/original.mov"]));
        assert_eq!(args.last().map(String::as_str), Some("proxy.mp4"));
    }

    #[test]
    fn ffmpeg_uses_a_confirmed_hardware_encoder() {
        let args = ffmpeg_args(
            &asset(AssetKind::Video, 3840, 2160),
            Path::new("proxy.mp4"),
            Codecs { encoder: Some("h264_videotoolbox"), hwaccel: Some("videotoolbox") },
        );
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-c:v", "h264_videotoolbox"]));
        assert!(args.windows(2).any(|pair| pair == ["-b:v", "4M"]));
        assert!(!args.iter().any(|arg| arg == "libx264"));
        // Hardware decode goes before the input and replaces the thread cap.
        let hw = args.iter().position(|arg| arg == "-hwaccel").unwrap();
        let input = args.iter().position(|arg| arg == "-i").unwrap();
        assert!(hw < input && args[hw + 1] == "videotoolbox");
        assert!(!args.iter().any(|arg| arg == "-threads"));
        assert_eq!(concurrent_jobs(Codecs { encoder: Some("h264_videotoolbox"), hwaccel: None }), 2);
        assert_eq!(concurrent_jobs(Codecs::default()), 1);
    }

    #[test]
    fn proxies_for_timeline_media_come_first() {
        let named = |id: &str| Asset { id: id.into(), ..asset(AssetKind::Video, 3840, 2160) };
        let first = HashMap::from([("late".to_string(), 300), ("early".to_string(), 10)]);
        let mut jobs = vec![(named("unused"), ()), (named("late"), ()), (named("early"), ())];
        order_by_first_use(&first, &mut jobs);
        let order: Vec<&str> = jobs.iter().map(|(asset, _)| asset.id.as_str()).collect();
        assert_eq!(order, ["early", "late", "unused"]);
    }

    #[test]
    fn proxy_progress_reports_only_changed_percentages() {
        let mut previous = 0;
        let reported = [0, 0, 1, 1, 2, 2, 100]
            .into_iter()
            .filter(|percent| progress_percent_changed(&mut previous, *percent))
            .collect::<Vec<_>>();
        assert_eq!(reported, vec![1, 2, 100]);
    }

    #[test]
    fn a_proxy_is_valid_only_for_the_same_path_and_modification_time() {
        let root = std::env::temp_dir().join(format!("makevideo-proxy-{}", std::process::id()));
        let project_path = root.join("project.akbunvideo");
        let source = root.join("source.mov");
        std::fs::create_dir_all(root.join(FOLDER)).unwrap();
        std::fs::write(&source, b"source").unwrap();
        let mut asset = asset(AssetKind::Video, 3840, 2160);
        asset.path = source.to_string_lossy().to_string();
        std::fs::write(
            media_path(project_path.to_str().unwrap(), &asset.id).unwrap(),
            b"proxy",
        )
        .unwrap();
        write_manifest(project_path.to_str().unwrap(), &asset).unwrap();

        assert!(valid_proxy(project_path.to_str().unwrap(), &asset).is_some());
        let old_manifest = format!(
            "{{\"sourcePath\":{:?},\"sourceModifiedMs\":{}}}",
            asset.path,
            source_modified_ms(&asset.path).unwrap()
        );
        std::fs::write(
            manifest_path(project_path.to_str().unwrap(), &asset.id).unwrap(),
            old_manifest,
        )
        .unwrap();
        assert!(valid_proxy(project_path.to_str().unwrap(), &asset).is_none());
        write_manifest(project_path.to_str().unwrap(), &asset).unwrap();
        asset.path = root.join("other.mov").to_string_lossy().to_string();
        assert!(valid_proxy(project_path.to_str().unwrap(), &asset).is_none());
        let _ = std::fs::remove_dir_all(root);
    }
}
