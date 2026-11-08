//! Image and video paints

use super::*;

pub(super) fn media_cache_token(project: &Project, style: &VisualStyle, frame: i64) -> String {
    style
        .fills
        .iter()
        .filter_map(|paint| {
            let asset = project.asset(paint.asset_id()?)?;
            let frame = if matches!(paint, Paint::Video { .. }) {
                frame.max(0) % asset.duration_frames(project.rate()).max(1)
            } else {
                0
            };
            Some(format!("{}:{frame}", asset.path))
        })
        .collect::<Vec<_>>()
        .join("\u{0}")
}

pub(super) fn resolve_media_paints(
    project: &Project,
    style: &VisualStyle,
    item_id: &str,
    relative_frame: i64,
    width: u32,
    height: u32,
) -> Vec<Option<Arc<[u8]>>> {
    style
        .fills
        .iter()
        .enumerate()
        .map(|(paint_index, paint)| {
            let asset_id = paint.asset_id()?;
            let asset = project.asset(asset_id)?;
            let frame = match paint {
                Paint::Image { .. } => 0,
                Paint::Video { .. } => {
                    let duration = asset.duration_frames(project.rate()).max(1);
                    relative_frame.max(0) % duration
                }
                _ => return None,
            };
            let key = format!(
                "paint-media\u{0}{}\u{0}{frame}\u{0}{width}x{height}",
                asset.path
            );
            let pixels = cached(&key, || {
                decode_paint_frame(
                    &asset.path,
                    asset.kind,
                    item_id,
                    paint_index,
                    frame,
                    project,
                    width,
                    height,
                )
                .unwrap_or_default()
            });
            (!pixels.is_empty()).then_some(pixels)
        })
        .collect()
}

pub(super) fn decode_paint_frame(
    path: &str,
    kind: makevideo_render::AssetKind,
    item_id: &str,
    paint_index: usize,
    frame: i64,
    project: &Project,
    width: u32,
    height: u32,
) -> Option<Vec<u8>> {
    let ffmpeg = ffmpeg_path()?;
    if kind == makevideo_render::AssetKind::Video {
        return decode_video_paint_frame(
            &ffmpeg,
            path,
            item_id,
            paint_index,
            frame,
            project,
            width,
            height,
        );
    }
    let mut args = vec![
        "-hide_banner".to_string(),
        "-loglevel".into(),
        "error".into(),
    ];
    args.extend([
        "-i".into(),
        path.into(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        format!(
            "scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
        ),
        "-pix_fmt".into(),
        "rgba".into(),
        "-f".into(),
        "rawvideo".into(),
        "pipe:1".into(),
    ]);
    let output = std::process::Command::new(&ffmpeg)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    let expected = width as usize * height as usize * 4;
    (output.status.success() && output.stdout.len() >= expected)
        .then(|| output.stdout[..expected].to_vec())
}

#[allow(clippy::too_many_arguments)]
pub(super) fn decode_video_paint_frame(
    ffmpeg: &str,
    path: &str,
    item_id: &str,
    paint_index: usize,
    frame: i64,
    project: &Project,
    width: u32,
    height: u32,
) -> Option<Vec<u8>> {
    let rate = project.rate();
    let key = format!(
        "{ffmpeg}\u{0}{path}\u{0}{item_id}\u{0}{paint_index}\u{0}{width}x{height}\u{0}{}/{}",
        rate.num(),
        rate.den()
    );
    let cache = VIDEO_DECODERS.get_or_init(|| {
        Mutex::new(PaintVideoDecoderCache {
            entries: HashMap::new(),
            oldest: VecDeque::new(),
        })
    });
    let mut cache = cache.lock().unwrap();
    if let Some(decoder) = cache.entries.get_mut(&key) {
        if let Some(pixels) = decoder.read(frame) {
            return Some(pixels);
        }
    }
    cache.entries.remove(&key);
    cache.oldest.retain(|entry| entry != &key);
    while cache.entries.len() >= VIDEO_DECODER_LIMIT {
        let oldest = cache.oldest.pop_front()?;
        cache.entries.remove(&oldest);
    }
    let mut decoder = spawn_video_paint_decoder(ffmpeg, path, frame, project, width, height)?;
    let pixels = decoder.read(frame)?;
    cache.oldest.push_back(key.clone());
    cache.entries.insert(key, decoder);
    Some(pixels)
}

pub(super) fn spawn_video_paint_decoder(
    ffmpeg: &str,
    path: &str,
    frame: i64,
    project: &Project,
    width: u32,
    height: u32,
) -> Option<PaintVideoDecoder> {
    let rate = project.rate();
    let mut args = vec![
        "-hide_banner".to_string(),
        "-loglevel".into(),
        "error".into(),
    ];
    if frame > 0 {
        args.extend(["-ss".into(), format!("{:.9}", frame as f64 / rate.as_f64())]);
    }
    args.extend([
        "-i".into(),
        path.into(),
        "-vf".into(),
        format!(
            "fps={}/{},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
            rate.num(),
            rate.den()
        ),
        "-pix_fmt".into(),
        "rgba".into(),
        "-f".into(),
        "rawvideo".into(),
        "pipe:1".into(),
    ]);
    let mut child = std::process::Command::new(ffmpeg)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    Some(PaintVideoDecoder {
        child,
        stdout,
        next_frame: frame,
        frame_bytes: width as usize * height as usize * 4,
    })
}

pub(super) fn ffmpeg_path() -> Option<String> {
    let configured = FFMPEG.get_or_init(|| RwLock::new(None));
    if let Some(path) = configured.read().unwrap().clone() {
        return Some(path);
    }
    let path = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    makevideo_render::tools::candidate_paths("ffmpeg", "", &path, &home)
        .into_iter()
        .find(|candidate| std::path::Path::new(candidate).is_file())
}
