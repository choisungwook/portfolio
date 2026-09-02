//! Text is rasterized before it reaches the compositor, just like a decoded
//! video frame. The resulting RGBA image follows the same preview and export
//! path as every other layer.

use crate::Placement;
use fontdb::{Database, Family, Query};
use fontdue::layout::{CoordinateSystem, Layout, LayoutSettings, TextStyle as LayoutTextStyle};
use fontdue::{Font, FontSettings};
use makevideo_render::{
    GradientStop, Paint, Project, ShapeKind, TextAlign, TextStyle, VisualContent, VisualStyle,
};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

const CACHE_LIMIT_BYTES: usize = 64 * 1024 * 1024;

pub struct RasterLayer {
    pub pixels: Arc<[u8]>,
    pub width: u32,
    pub height: u32,
    pub placement: Placement,
}

struct RasterCache {
    entries: HashMap<String, Arc<[u8]>>,
    oldest: VecDeque<String>,
    bytes: usize,
}

static CACHE: OnceLock<Mutex<RasterCache>> = OnceLock::new();
static FONT_DATABASE: OnceLock<Database> = OnceLock::new();
static FONTS: OnceLock<Mutex<HashMap<String, Font>>> = OnceLock::new();
static FFMPEG: OnceLock<RwLock<Option<String>>> = OnceLock::new();
static VIDEO_DECODERS: OnceLock<Mutex<PaintVideoDecoderCache>> = OnceLock::new();

const VIDEO_DECODER_LIMIT: usize = 8;

struct PaintVideoDecoder {
    child: std::process::Child,
    stdout: std::process::ChildStdout,
    next_frame: i64,
    frame_bytes: usize,
}

impl PaintVideoDecoder {
    fn read(&mut self, frame: i64) -> Option<Vec<u8>> {
        use std::io::Read;
        if frame != self.next_frame {
            return None;
        }
        let mut pixels = vec![0; self.frame_bytes];
        self.stdout.read_exact(&mut pixels).ok()?;
        self.next_frame += 1;
        Some(pixels)
    }
}

impl Drop for PaintVideoDecoder {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct PaintVideoDecoderCache {
    entries: HashMap<String, PaintVideoDecoder>,
    oldest: VecDeque<String>,
}

/// Keep media paints on the same ffmpeg executable as the decoder pipeline.
/// Settings can replace it while the app is running, so this is updateable.
pub fn set_ffmpeg_path(path: &str) {
    *FFMPEG
        .get_or_init(|| RwLock::new(None))
        .write()
        .unwrap() = Some(path.to_string());
}

/// One item's raster at the output size, with where it sits and the frames it
/// covers. The pixels are the same ones `layers_at` composites — an item is
/// static, so callers that composite over time (the filter-graph render) take
/// one of these per item instead of one per frame.
pub struct ItemRaster {
    pub pixels: Arc<[u8]>,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub opacity: f32,
    pub start_frame: i64,
    pub end_frame: i64,
}

pub fn layers_at(project: &Project, frame: i64, width: u32, height: u32) -> Vec<RasterLayer> {
    each_visual_item(project, width, height, Some(frame))
        .into_iter()
        .map(|raster| RasterLayer {
            pixels: raster.pixels,
            width: raster.width,
            height: raster.height,
            placement: Placement {
                dst: makevideo_render::layout::Rect {
                    x: raster.x,
                    y: raster.y,
                    w: raster.width,
                    h: raster.height,
                },
                opacity: raster.opacity,
            },
        })
        .collect()
}

/// Every text and shape item in the project, rasterized once each.
pub fn item_rasters(project: &Project, width: u32, height: u32) -> Vec<ItemRaster> {
    each_visual_item(project, width, height, None)
}

/// Timeline spans and logical RGBA bytes for text and shape layers.
///
/// The source memory meter needs the same dimensions as rasterization without
/// eagerly rasterizing every visual in a project just to calculate a bound.
pub(crate) fn byte_spans(project: &Project, width: u32, height: u32) -> Vec<(i64, i64, usize)> {
    let scale_x = width as f32 / project.settings.width.max(1) as f32;
    let scale_y = height as f32 / project.settings.height.max(1) as f32;
    let mut spans = Vec::new();
    for track in project.tracks.iter().filter(|track| track.contributes()) {
        if !matches!(
            track.kind,
            makevideo_render::TrackKind::Video | makevideo_render::TrackKind::Subtitle
        ) {
            continue;
        }
        for item in &track.visual_items {
            if !matches!(
                &item.content,
                VisualContent::Text { .. } | VisualContent::Shape { .. }
            ) {
                continue;
            }
            let transform = visual_transform(project, track, item);
            let (item_width, item_height) = visual_dimensions(transform, scale_x, scale_y);
            let end = item.end_frame();
            if end > item.start {
                spans.push((
                    item.start,
                    end,
                    (item_width as usize)
                        .saturating_mul(item_height as usize)
                        .saturating_mul(4),
                ));
            }
        }
    }
    spans
}

/// The one walk both entry points share: tracks in project order, items in
/// z order within a track, which is also the paint order. `at` narrows it to
/// the items covering one frame.
fn each_visual_item(
    project: &Project,
    width: u32,
    height: u32,
    at: Option<i64>,
) -> Vec<ItemRaster> {
    let mut layers = Vec::new();
    let scale_x = width as f32 / project.settings.width.max(1) as f32;
    let scale_y = height as f32 / project.settings.height.max(1) as f32;
    let scale = scale_x.min(scale_y);

    for track in project.tracks.iter().filter(|track| track.contributes()) {
        if !matches!(track.kind, makevideo_render::TrackKind::Video | makevideo_render::TrackKind::Subtitle) {
            continue;
        }
        let mut items: Vec<_> = track
            .visual_items
            .iter()
            .filter(|item| at.is_none_or(|frame| item.contains_frame(frame)))
            .collect();
        items.sort_by_key(|item| item.z_index);
        for item in items {
            let transform = visual_transform(project, track, item);
            let (item_width, item_height) = visual_dimensions(transform, scale_x, scale_y);
            let pixels = match &item.content {
                VisualContent::Text { text, style } => {
                    let style = track.subtitle_style.as_ref().unwrap_or(style);
                    let paint_frame = at.unwrap_or(item.start);
                    let relative_frame = paint_frame - item.start;
                    let key = format!(
                        "text\u{0}{text}\u{0}{style:?}\u{0}{item_width}x{item_height}\u{0}{scale:.4}\u{0}{}",
                        media_cache_token(project, &style.visual_style, relative_frame)
                    );
                    cached(&key, || {
                        let media = resolve_media_paints(
                            project,
                            &style.visual_style,
                            &item.id,
                            relative_frame,
                            item_width,
                            item_height,
                        );
                        rasterize(text, style, item_width, item_height, scale, &media)
                    })
                }
                VisualContent::Shape {
                    shape,
                    visual_style,
                    corner_radius,
                    start_arrow,
                    end_arrow,
                } => {
                    let paint_frame = at.unwrap_or(item.start);
                    let relative_frame = paint_frame - item.start;
                    let key = format!(
                        "shape\u{0}{shape:?}\u{0}{visual_style:?}\u{0}{corner_radius}\u{0}{start_arrow}\u{0}{end_arrow}\u{0}{item_width}x{item_height}\u{0}{scale:.4}\u{0}{}",
                        media_cache_token(project, visual_style, relative_frame)
                    );
                    cached(&key, || {
                        let media = resolve_media_paints(
                            project,
                            visual_style,
                            &item.id,
                            relative_frame,
                            item_width,
                            item_height,
                        );
                        rasterize_shape(
                            *shape,
                            visual_style,
                            &media,
                            scale,
                            *corner_radius * scale,
                            *start_arrow,
                            *end_arrow,
                            item_width,
                            item_height,
                        )
                    })
                }
                VisualContent::Image { .. } | VisualContent::VideoOverlay { .. } => continue,
            };
            layers.push(ItemRaster {
                pixels,
                width: item_width,
                height: item_height,
                x: (transform.x * scale_x).round() as i32,
                y: (transform.y * scale_y).round() as i32,
                opacity: transform.opacity.clamp(0.0, 1.0),
                start_frame: item.start,
                end_frame: item.end_frame(),
            });
        }
    }
    layers
}

fn visual_transform(
    project: &Project,
    track: &makevideo_render::Track,
    item: &makevideo_render::VisualItem,
) -> makevideo_render::VisualTransform {
    if track.kind == makevideo_render::TrackKind::Subtitle {
        makevideo_render::VisualTransform {
            x: 96.0,
            y: project.settings.height as f32 * 0.78,
            width: project.settings.width as f32 - 192.0,
            height: project.settings.height as f32 * 0.16,
            rotation: 0.0,
            opacity: 1.0,
        }
    } else {
        item.transform
    }
}

fn visual_dimensions(
    transform: makevideo_render::VisualTransform,
    scale_x: f32,
    scale_y: f32,
) -> (u32, u32) {
    (
        (transform.width * scale_x).round().max(1.0) as u32,
        (transform.height * scale_y).round().max(1.0) as u32,
    )
}

/// Write an RGBA raster as a PAM still, for handing to ffmpeg as an overlay
/// input. PAM because it is the alpha-capable still format that is a text
/// header in front of the raw bytes — no encoder, no dependency.
pub fn write_pam(
    path: &std::path::Path,
    pixels: &[u8],
    width: u32,
    height: u32,
) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = std::io::BufWriter::new(std::fs::File::create(path)?);
    write!(
        file,
        "P7\nWIDTH {width}\nHEIGHT {height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n"
    )?;
    file.write_all(pixels)?;
    file.flush()
}

fn media_cache_token(project: &Project, style: &VisualStyle, frame: i64) -> String {
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

fn resolve_media_paints(
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

fn decode_paint_frame(
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
    let mut args = vec!["-hide_banner".to_string(), "-loglevel".into(), "error".into()];
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
fn decode_video_paint_frame(
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

fn spawn_video_paint_decoder(
    ffmpeg: &str,
    path: &str,
    frame: i64,
    project: &Project,
    width: u32,
    height: u32,
) -> Option<PaintVideoDecoder> {
    let rate = project.rate();
    let mut args = vec!["-hide_banner".to_string(), "-loglevel".into(), "error".into()];
    if frame > 0 {
        args.extend([
            "-ss".into(),
            format!("{:.9}", frame as f64 / rate.as_f64()),
        ]);
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

fn ffmpeg_path() -> Option<String> {
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

#[allow(clippy::too_many_arguments)]
fn rasterize_shape(
    shape: ShapeKind,
    style: &VisualStyle,
    media: &[Option<Arc<[u8]>>],
    scale: f32,
    corner_radius: f32,
    start_arrow: bool,
    end_arrow: bool,
    width: u32,
    height: u32,
) -> Vec<u8> {
    let mut pixels = vec![0; width as usize * height as usize * 4];
    let stroke_width = style.stroke.as_ref().map(|stroke| stroke.width).unwrap_or(0.0) * scale;
    let edge = stroke_width.max(0.0) / 2.0;
    let mask = shape_mask(
        shape,
        corner_radius,
        edge,
        start_arrow,
        end_arrow,
        width,
        height,
    );
    if let Some(shadow) = &style.shadow {
        draw_shadow(&mut pixels, &mask, width, height, shadow, scale);
    }
    for y in 0..height {
        for x in 0..width {
            let (inside, outlined) = mask[(y * width + x) as usize];
            if inside {
                let color = if shape == ShapeKind::Line || outlined {
                    style
                        .stroke
                        .as_ref()
                        .map(|stroke| colour(&stroke.color, [0, 0, 0, 0]))
                        .unwrap_or([0, 0, 0, 0])
                } else {
                    paint_stack(
                        &style.fills,
                        media,
                        x as f32 + 0.5,
                        y as f32 + 0.5,
                        width,
                        height,
                    )
                };
                blend_at(&mut pixels, width, x, y, color);
            }
        }
    }
    pixels
}

fn shape_mask(
    shape: ShapeKind,
    corner_radius: f32,
    edge: f32,
    start_arrow: bool,
    end_arrow: bool,
    width: u32,
    height: u32,
) -> Vec<(bool, bool)> {
    let mut mask = Vec::with_capacity(width as usize * height as usize);
    for y in 0..height {
        for x in 0..width {
            let point = (x as f32 + 0.5, y as f32 + 0.5);
            mask.push(match shape {
                ShapeKind::Rectangle => {
                    rounded_rectangle(point, width as f32, height as f32, 0.0, edge)
                }
                ShapeKind::RoundedRectangle => rounded_rectangle(
                    point,
                    width as f32,
                    height as f32,
                    corner_radius,
                    edge,
                ),
                ShapeKind::Ellipse => ellipse(point, width as f32, height as f32, edge),
                ShapeKind::Line => line(
                    point,
                    width as f32,
                    height as f32,
                    edge,
                    start_arrow,
                    end_arrow,
                ),
                ShapeKind::Polygon => polygon(point, width as f32, height as f32, 6, 1.0, edge),
                ShapeKind::Star => polygon(point, width as f32, height as f32, 10, 0.45, edge),
            });
        }
    }
    mask
}

fn rounded_rectangle(point: (f32, f32), width: f32, height: f32, radius: f32, edge: f32) -> (bool, bool) {
    let radius = radius.clamp(0.0, width.min(height) / 2.0);
    let dx = (point.0 - width / 2.0).abs() - (width / 2.0 - radius);
    let dy = (point.1 - height / 2.0).abs() - (height / 2.0 - radius);
    let distance = dx.max(0.0).hypot(dy.max(0.0)) + dx.max(dy).min(0.0) - radius;
    (distance <= 0.0, distance >= -edge)
}

fn ellipse(point: (f32, f32), width: f32, height: f32, edge: f32) -> (bool, bool) {
    let nx = (point.0 - width / 2.0) / (width / 2.0).max(1.0);
    let ny = (point.1 - height / 2.0) / (height / 2.0).max(1.0);
    let distance = (nx * nx + ny * ny).sqrt();
    let outline = edge / (width.min(height) / 2.0).max(1.0);
    (distance <= 1.0, distance >= 1.0 - outline)
}

fn line(point: (f32, f32), width: f32, height: f32, radius: f32, start_arrow: bool, end_arrow: bool) -> (bool, bool) {
    if radius <= 0.0 {
        return (false, false);
    }
    let centre = height / 2.0;
    let body = (point.1 - centre).abs() <= radius && point.0 >= radius && point.0 <= width - radius;
    let arrow_size = (radius * 3.0).max(8.0);
    let arrow = |tip_x: f32, points_left: bool| {
        let dx = if points_left { tip_x - point.0 } else { point.0 - tip_x };
        dx >= 0.0 && dx <= arrow_size && (point.1 - centre).abs() <= dx * 0.65 + 0.5
    };
    (body || (start_arrow && arrow(0.0, false)) || (end_arrow && arrow(width, true)), true)
}

fn polygon(
    point: (f32, f32),
    width: f32,
    height: f32,
    vertices: usize,
    inner_ratio: f32,
    edge: f32,
) -> (bool, bool) {
    let outer = width.min(height) / 2.0;
    let center = (width / 2.0, height / 2.0);
    let points: Vec<(f32, f32)> = (0..vertices)
        .map(|index| {
            let angle = -std::f32::consts::FRAC_PI_2
                + index as f32 * std::f32::consts::TAU / vertices as f32;
            let radius = if vertices > 6 && index % 2 == 1 {
                outer * inner_ratio
            } else {
                outer
            };
            (center.0 + angle.cos() * radius, center.1 + angle.sin() * radius)
        })
        .collect();
    let mut inside = false;
    let mut distance = f32::MAX;
    for index in 0..points.len() {
        let a = points[index];
        let b = points[(index + 1) % points.len()];
        if (a.1 > point.1) != (b.1 > point.1)
            && point.0 < (b.0 - a.0) * (point.1 - a.1) / (b.1 - a.1) + a.0
        {
            inside = !inside;
        }
        distance = distance.min(segment_distance(point, a, b));
    }
    (inside, inside && distance <= edge)
}

fn segment_distance(point: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let delta = (b.0 - a.0, b.1 - a.1);
    let length = delta.0 * delta.0 + delta.1 * delta.1;
    if length <= f32::EPSILON {
        return (point.0 - a.0).hypot(point.1 - a.1);
    }
    let amount = (((point.0 - a.0) * delta.0 + (point.1 - a.1) * delta.1) / length)
        .clamp(0.0, 1.0);
    (point.0 - (a.0 + delta.0 * amount)).hypot(point.1 - (a.1 + delta.1 * amount))
}

fn draw_shadow(
    pixels: &mut [u8],
    mask: &[(bool, bool)],
    width: u32,
    height: u32,
    shadow: &makevideo_render::Shadow,
    scale: f32,
) {
    let color = colour(&shadow.color, [0, 0, 0, 0]);
    if color[3] == 0 {
        return;
    }
    let offset_x = (shadow.x * scale).round() as i32;
    let offset_y = (shadow.y * scale).round() as i32;
    let blur = (shadow.blur * scale).round().clamp(0.0, 32.0) as i32;
    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let source_x = x - offset_x;
            let source_y = y - offset_y;
            let mut covered = 0u32;
            let mut samples = 0u32;
            for dy in -blur..=blur {
                for dx in -blur..=blur {
                    samples += 1;
                    let sx = source_x + dx;
                    let sy = source_y + dy;
                    if sx >= 0
                        && sy >= 0
                        && sx < width as i32
                        && sy < height as i32
                        && mask[(sy as u32 * width + sx as u32) as usize].0
                    {
                        covered += 1;
                    }
                }
            }
            if covered == 0 {
                continue;
            }
            let mut sampled = color;
            sampled[3] = ((color[3] as u32 * covered + samples / 2) / samples) as u8;
            blend_at(pixels, width, x as u32, y as u32, sampled);
        }
    }
}

fn paint_stack(
    paints: &[Paint],
    media: &[Option<Arc<[u8]>>],
    x: f32,
    y: f32,
    width: u32,
    height: u32,
) -> [u8; 4] {
    let mut result = [0, 0, 0, 0];
    for (index, paint) in paints.iter().enumerate() {
        blend(
            &mut result,
            sample_paint(
                paint,
                media.get(index).and_then(Option::as_deref),
                x,
                y,
                width,
                height,
            ),
        );
    }
    result
}

fn sample_paint(
    paint: &Paint,
    media: Option<&[u8]>,
    x: f32,
    y: f32,
    width: u32,
    height: u32,
) -> [u8; 4] {
    match paint {
        Paint::Solid { color } => colour(color, [0, 0, 0, 0]),
        Paint::LinearGradient { start, end, stops } => {
            let start = (start.x * width as f32, start.y * height as f32);
            let end = (end.x * width as f32, end.y * height as f32);
            let delta = (end.0 - start.0, end.1 - start.1);
            let length = delta.0 * delta.0 + delta.1 * delta.1;
            let position = if length <= f32::EPSILON {
                0.0
            } else {
                ((x - start.0) * delta.0 + (y - start.1) * delta.1) / length
            };
            gradient(stops, position)
        }
        Paint::RadialGradient {
            center,
            radius,
            stops,
        } => {
            let center = (center.x * width as f32, center.y * height as f32);
            let radius = radius.max(0.001) * width.max(height) as f32;
            gradient(stops, (x - center.0).hypot(y - center.1) / radius)
        }
        Paint::Image { .. } | Paint::Video { .. } => media
            .and_then(|pixels| {
                let x = x.floor().clamp(0.0, width.saturating_sub(1) as f32) as u32;
                let y = y.floor().clamp(0.0, height.saturating_sub(1) as f32) as u32;
                let index = ((y * width + x) * 4) as usize;
                pixels
                    .get(index..index + 4)
                    .map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3]])
            })
            .unwrap_or([0, 0, 0, 0]),
    }
}

fn gradient(stops: &[GradientStop], position: f32) -> [u8; 4] {
    if stops.is_empty() {
        return [0, 0, 0, 0];
    }
    let mut stops: Vec<_> = stops.iter().collect();
    stops.sort_by(|left, right| left.position.total_cmp(&right.position));
    let position = position.clamp(0.0, 1.0);
    let first = stops[0];
    if position <= first.position {
        return colour(&first.color, [0, 0, 0, 0]);
    }
    for pair in stops.windows(2) {
        if position <= pair[1].position {
            let span = (pair[1].position - pair[0].position).max(f32::EPSILON);
            let amount = ((position - pair[0].position) / span).clamp(0.0, 1.0);
            let from = colour(&pair[0].color, [0, 0, 0, 0]);
            let to = colour(&pair[1].color, [0, 0, 0, 0]);
            let mut result = [0; 4];
            for channel in 0..4 {
                result[channel] = (from[channel] as f32
                    + (to[channel] as f32 - from[channel] as f32) * amount)
                    .round() as u8;
            }
            return result;
        }
    }
    colour(&stops.last().unwrap().color, [0, 0, 0, 0])
}

fn blend_at(pixels: &mut [u8], width: u32, x: u32, y: u32, color: [u8; 4]) {
    let index = ((y * width + x) * 4) as usize;
    blend(&mut pixels[index..index + 4], color);
}

fn blend(destination: &mut [u8], source: [u8; 4]) {
    let source_alpha = source[3] as f32 / 255.0;
    if source_alpha <= 0.0 {
        return;
    }
    let destination_alpha = destination[3] as f32 / 255.0;
    let output_alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
    for channel in 0..3 {
        destination[channel] = if output_alpha <= f32::EPSILON {
            0
        } else {
            ((source[channel] as f32 * source_alpha
                + destination[channel] as f32
                    * destination_alpha
                    * (1.0 - source_alpha))
                / output_alpha)
                .round()
                .clamp(0.0, 255.0) as u8
        };
    }
    destination[3] = (output_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
}

fn cached(key: &str, build: impl FnOnce() -> Vec<u8>) -> Arc<[u8]> {
    let cache = CACHE.get_or_init(|| {
        Mutex::new(RasterCache {
            entries: HashMap::new(),
            oldest: VecDeque::new(),
            bytes: 0,
        })
    });
    if let Some(pixels) = cache.lock().unwrap().entries.get(key).cloned() {
        return pixels;
    }
    let pixels: Arc<[u8]> = build().into();
    if pixels.len() > CACHE_LIMIT_BYTES {
        return pixels;
    }
    let mut cache = cache.lock().unwrap();
    // Checked again under the lock it inserts with. Playback and an export
    // can miss the same key together, and inserting both would put the key in
    // the eviction queue twice and count its bytes twice forever.
    if let Some(existing) = cache.entries.get(key).cloned() {
        return existing;
    }
    while cache.bytes + pixels.len() > CACHE_LIMIT_BYTES {
        let Some(oldest) = cache.oldest.pop_front() else {
            break;
        };
        if let Some(removed) = cache.entries.remove(&oldest) {
            cache.bytes -= removed.len();
        }
    }
    cache.bytes += pixels.len();
    cache.oldest.push_back(key.to_string());
    cache.entries.insert(key.to_string(), Arc::clone(&pixels));
    pixels
}

fn rasterize(
    text: &str,
    style: &TextStyle,
    width: u32,
    height: u32,
    scale: f32,
    media: &[Option<Arc<[u8]>>],
) -> Vec<u8> {
    let mut pixels = vec![0; width as usize * height as usize * 4];
    let Some(font) = load_font(&style.font_family) else {
        return pixels;
    };
    let mut layout = Layout::new(CoordinateSystem::PositiveYDown);
    layout.reset(&LayoutSettings {
        x: 0.0,
        y: 0.0,
        max_width: Some(width as f32),
        max_height: Some(height as f32),
        horizontal_align: match style.align {
            TextAlign::Left => fontdue::layout::HorizontalAlign::Left,
            TextAlign::Center => fontdue::layout::HorizontalAlign::Center,
            TextAlign::Right => fontdue::layout::HorizontalAlign::Right,
        },
        ..LayoutSettings::default()
    });
    layout.append(
        &[font.clone()],
        &LayoutTextStyle::new(text, (style.font_size * scale).max(1.0), 0),
    );
    let visual_style = &style.visual_style;
    let shadow = visual_style
        .shadow
        .as_ref()
        .map(|shadow| colour(&shadow.color, [0, 0, 0, 0]))
        .unwrap_or([0, 0, 0, 0]);
    let stroke = visual_style
        .stroke
        .as_ref()
        .map(|stroke| colour(&stroke.color, [0, 0, 0, 0]))
        .unwrap_or([0, 0, 0, 0]);
    let stroke_radius = visual_style
        .stroke
        .as_ref()
        .map(|stroke| (stroke.width * scale).round().max(0.0) as i32)
        .unwrap_or(0);
    let shadow_x = visual_style
        .shadow
        .as_ref()
        .map(|shadow| (shadow.x * scale).round() as i32)
        .unwrap_or(0);
    let shadow_y = visual_style
        .shadow
        .as_ref()
        .map(|shadow| (shadow.y * scale).round() as i32)
        .unwrap_or(0);
    let shadow_blur = visual_style
        .shadow
        .as_ref()
        .map(|shadow| (shadow.blur * scale).round().clamp(0.0, 32.0) as i32)
        .unwrap_or(0);

    for glyph in layout.glyphs() {
        let (metrics, bitmap) = font.rasterize_config(glyph.key);
        let x = glyph.x.round() as i32;
        let y = glyph.y.round() as i32;
        if shadow[3] > 0 {
            draw_bitmap_shadow(
                &mut pixels,
                width,
                height,
                x + shadow_x,
                y + shadow_y,
                &metrics,
                &bitmap,
                shadow,
                shadow_blur,
            );
        }
        if stroke_radius > 0 && stroke[3] > 0 {
            for offset_y in -stroke_radius..=stroke_radius {
                for offset_x in -stroke_radius..=stroke_radius {
                    if offset_x * offset_x + offset_y * offset_y <= stroke_radius * stroke_radius {
                        draw_bitmap(&mut pixels, width, height, x + offset_x, y + offset_y, &metrics, &bitmap, stroke);
                    }
                }
            }
        }
        for (paint_index, paint) in visual_style.fills.iter().enumerate() {
            draw_bitmap_paint(
                &mut pixels,
                width,
                height,
                x,
                y,
                &metrics,
                &bitmap,
                paint,
                media.get(paint_index).and_then(Option::as_deref),
            );
        }
    }
    pixels
}

pub fn font_available(family: &str) -> bool {
    let database = FONT_DATABASE.get_or_init(load_font_database);
    requested_font_id(database, family).is_some()
}

/// Every family the system offers, sorted and deduplicated, for the text
/// inspector's font picker. Faces carry one entry per name variant; the first
/// is the family name a CSS font stack and `requested_font_id` both accept.
pub fn font_families() -> Vec<String> {
    let database = FONT_DATABASE.get_or_init(load_font_database);
    let mut families: Vec<String> = database
        .faces()
        .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
        .collect();
    families.sort();
    families.dedup();
    families
}

fn load_font(family: &str) -> Option<Font> {
    let cache = FONTS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(font) = cache.lock().unwrap().get(family).cloned() {
        return Some(font);
    }
    let database = FONT_DATABASE.get_or_init(load_font_database);
    let id = requested_font_id(database, family)
        .or_else(|| database.query(&Query { families: &[Family::SansSerif], ..Query::default() }))?;
    let font = database
        .with_face_data(id, |data, _index| Font::from_bytes(data, FontSettings::default()).ok())
        .flatten()?;
    cache.lock().unwrap().insert(family.into(), font.clone());
    Some(font)
}

fn load_font_database() -> Database {
    let mut database = Database::new();
    database.load_system_fonts();
    database
}

fn requested_font_id(database: &Database, family: &str) -> Option<fontdb::ID> {
    let generic = match family {
        "serif" => Family::Serif,
        "sans-serif" => Family::SansSerif,
        "cursive" => Family::Cursive,
        "fantasy" => Family::Fantasy,
        "monospace" => Family::Monospace,
        _ => return database.query(&Query { families: &[Family::Name(family)], ..Query::default() }),
    };
    database.query(&Query { families: &[generic], ..Query::default() })
}

fn colour(value: &str, fallback: [u8; 4]) -> [u8; 4] {
    let value = value.trim().strip_prefix('#').unwrap_or(value.trim());
    let rgb = match value.len() {
        6 => u32::from_str_radix(value, 16).ok().map(|value| [
            ((value >> 16) & 0xff) as u8,
            ((value >> 8) & 0xff) as u8,
            (value & 0xff) as u8,
            255,
        ]),
        8 => u32::from_str_radix(value, 16).ok().map(|value| [
            ((value >> 24) & 0xff) as u8,
            ((value >> 16) & 0xff) as u8,
            ((value >> 8) & 0xff) as u8,
            (value & 0xff) as u8,
        ]),
        _ => None,
    };
    rgb.unwrap_or(fallback)
}

fn draw_bitmap(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    metrics: &fontdue::Metrics,
    bitmap: &[u8],
    color: [u8; 4],
) {
    for row in 0..metrics.height as i32 {
        for column in 0..metrics.width as i32 {
            let target_x = x + column;
            let target_y = y + row;
            if target_x < 0 || target_y < 0 || target_x >= width as i32 || target_y >= height as i32 {
                continue;
            }
            let coverage = bitmap[(row as usize) * metrics.width + column as usize] as u16;
            let alpha = (coverage * color[3] as u16 / 255) as u8;
            if alpha == 0 {
                continue;
            }
            let index = ((target_y as u32 * width + target_x as u32) * 4) as usize;
            let keep = 255 - alpha as u16;
            for channel in 0..3 {
                pixels[index + channel] = ((color[channel] as u16 * alpha as u16
                    + pixels[index + channel] as u16 * keep)
                    / 255) as u8;
            }
            pixels[index + 3] = (alpha as u16 + pixels[index + 3] as u16 * keep / 255).min(255) as u8;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_bitmap_shadow(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    metrics: &fontdue::Metrics,
    bitmap: &[u8],
    color: [u8; 4],
    blur: i32,
) {
    if blur == 0 {
        draw_bitmap(pixels, width, height, x, y, metrics, bitmap, color);
        return;
    }
    let diameter = (blur * 2 + 1) as u32;
    let samples = diameter * diameter;
    let mut sample = color;
    sample[3] = ((color[3] as u32 + samples / 2) / samples).max(1) as u8;
    for offset_y in -blur..=blur {
        for offset_x in -blur..=blur {
            draw_bitmap(
                pixels,
                width,
                height,
                x + offset_x,
                y + offset_y,
                metrics,
                bitmap,
                sample,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_bitmap_paint(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    metrics: &fontdue::Metrics,
    bitmap: &[u8],
    paint: &Paint,
    media: Option<&[u8]>,
) {
    for row in 0..metrics.height as i32 {
        for column in 0..metrics.width as i32 {
            let target_x = x + column;
            let target_y = y + row;
            if target_x < 0 || target_y < 0 || target_x >= width as i32 || target_y >= height as i32 {
                continue;
            }
            let coverage = bitmap[(row as usize) * metrics.width + column as usize] as u16;
            if coverage == 0 {
                continue;
            }
            let mut color = sample_paint(
                paint,
                media,
                target_x as f32 + 0.5,
                target_y as f32 + 0.5,
                width,
                height,
            );
            color[3] = (color[3] as u16 * coverage / 255) as u8;
            blend_at(
                pixels,
                width,
                target_x as u32,
                target_y as u32,
                color,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_render::{
        Paint, Project, ProjectSettings, Rate, ShapeKind as Shape, Stroke, Track, TrackKind,
        VisualContent as Content, VisualItem, VisualStyle, VisualTransform, FORMAT_VERSION,
    };

    fn shape_style(fill: &str, stroke: &str, width: f32) -> VisualStyle {
        VisualStyle {
            fills: vec![Paint::solid(fill)],
            stroke: (width > 0.0).then(|| Stroke {
                color: stroke.into(),
                width,
            }),
            shadow: None,
        }
    }

    fn project_with_shape() -> Project {
        Project {
            version: FORMAT_VERSION,
            settings: ProjectSettings {
                width: 100,
                height: 50,
                rate: Rate::fps(30),
            },
            assets: Vec::new(),
            markers: Vec::new(),
            tracks: vec![Track {
                id: "V1".into(),
                kind: TrackKind::Video,
                name: "V1".into(),
                clips: Vec::new(),
                visual_items: vec![VisualItem {
                    id: "s1".into(),
                    start: 30,
                    duration: 60,
                    z_index: 0,
                    transform: VisualTransform {
                        x: 10.0,
                        y: 5.0,
                        width: 40.0,
                        height: 20.0,
                        rotation: 0.0,
                        opacity: 0.8,
                    },
                    content: Content::Shape {
                        shape: Shape::Rectangle,
                        visual_style: shape_style("#ff0000", "#ffffff", 1.0),
                        corner_radius: 0.0,
                        start_arrow: false,
                        end_arrow: false,
                    },
                }],
                subtitle_style: None,
                muted: false,
                hidden: false,
            }],
        }
    }

    /// One raster per item, scaled to the output, carrying its frame range —
    /// what the filter-graph render overlays. The same walk answers
    /// `layers_at`, so the per-frame and per-item views cannot disagree.
    #[test]
    fn an_item_rasterizes_once_with_its_place_and_frames() {
        let project = project_with_shape();
        let rasters = item_rasters(&project, 200, 100);
        assert_eq!(rasters.len(), 1);
        let raster = &rasters[0];
        assert_eq!((raster.x, raster.y), (20, 10));
        assert_eq!((raster.width, raster.height), (80, 40));
        assert_eq!((raster.start_frame, raster.end_frame), (30, 90));
        assert!((raster.opacity - 0.8).abs() < 1e-6);
        assert_eq!(layers_at(&project, 30, 200, 100).len(), 1);
        assert_eq!(layers_at(&project, 90, 200, 100).len(), 0);
    }

    #[test]
    fn a_pam_still_is_the_header_and_the_raw_bytes() {
        let dir = std::env::temp_dir().join(format!("makevideo-pam-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("still.pam");
        write_pam(&path, &[1, 2, 3, 4, 5, 6, 7, 8], 2, 1).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let header = b"P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n";
        assert_eq!(&bytes[..header.len()], header);
        assert_eq!(&bytes[header.len()..], &[1, 2, 3, 4, 5, 6, 7, 8]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The outline is a band **inside** the edge, half the stroke width wide.
    /// The page's playback overlay draws the same rim by clipping a stroke of
    /// the full width to the shape, and the two only match while this holds.
    #[test]
    fn a_shape_outline_is_a_band_half_the_stroke_width_inside_the_edge() {
        let width = 40;
        let pixels = rasterize_shape(
            ShapeKind::Rectangle,
            &shape_style("#00000000", "#ff0000", 8.0),
            &[],
            1.0,
            0.0,
            false,
            false,
            width,
            20,
        );
        let opaque_at = |x: u32| pixels[((10 * width + x) * 4 + 3) as usize] > 0;
        assert!(opaque_at(0), "the edge itself is outlined");
        assert!(opaque_at(3), "3px in is still inside a 4px rim");
        assert!(!opaque_at(5), "5px in is past it, and the fill is transparent");
    }

    #[test]
    fn colour_accepts_css_hex_with_alpha() {
        assert_eq!(colour("#11223344", [0; 4]), [0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn shapes_rasterize_fill_outline_and_line_arrows() {
        let rectangle = rasterize_shape(
            ShapeKind::Rectangle,
            &shape_style("#112233", "#ffffff", 2.0),
            &[],
            1.0,
            4.0,
            false,
            false,
            20,
            12,
        );
        assert_eq!(&rectangle[(6 * 20 + 10) * 4..(6 * 20 + 10) * 4 + 4], &[0x11, 0x22, 0x33, 255]);
        assert_eq!(&rectangle[(10) * 4..(10) * 4 + 4], &[255, 255, 255, 255]);

        let line = rasterize_shape(
            ShapeKind::Line,
            &shape_style("#00000000", "#ff0000", 3.0),
            &[],
            1.0,
            0.0,
            true,
            true,
            30,
            12,
        );
        assert_eq!(&line[(6 * 30) * 4..(6 * 30) * 4 + 4], &[255, 0, 0, 255]);
        assert_eq!(&line[(6 * 30 + 29) * 4..(6 * 30 + 29) * 4 + 4], &[255, 0, 0, 255]);

        let no_stroke = rasterize_shape(
            ShapeKind::Line,
            &shape_style("#00000000", "#ff0000", 0.0),
            &[],
            1.0,
            0.0,
            true,
            true,
            30,
            12,
        );
        assert!(no_stroke.chunks_exact(4).all(|pixel| pixel[3] == 0));
    }

    #[test]
    fn gradients_interpolate_and_multiple_fills_stack_bottom_to_top() {
        let gradient = Paint::LinearGradient {
            start: makevideo_render::PaintPoint { x: 0.0, y: 0.5 },
            end: makevideo_render::PaintPoint { x: 1.0, y: 0.5 },
            stops: vec![
                GradientStop {
                    position: 0.0,
                    color: "#ff0000".into(),
                },
                GradientStop {
                    position: 1.0,
                    color: "#0000ff".into(),
                },
            ],
        };
        assert_eq!(sample_paint(&gradient, None, 0.0, 5.0, 10, 10), [255, 0, 0, 255]);
        let middle = sample_paint(&gradient, None, 5.0, 5.0, 10, 10);
        assert!((middle[0] as i16 - middle[2] as i16).abs() <= 1, "{middle:?}");

        let paints = [Paint::solid("#ff0000"), Paint::solid("#0000ff80")];
        let stacked = paint_stack(&paints, &[], 5.0, 5.0, 10, 10);
        assert!(stacked[0] >= 126 && stacked[0] <= 128, "{stacked:?}");
        assert!(stacked[2] >= 127 && stacked[2] <= 129, "{stacked:?}");
        assert_eq!(stacked[3], 255);
    }

    #[test]
    fn polygon_star_and_rounded_rectangle_have_distinct_geometry() {
        let style = shape_style("#ffffff", "#000000", 0.0);
        for shape in [ShapeKind::Polygon, ShapeKind::Star, ShapeKind::RoundedRectangle] {
            let pixels = rasterize_shape(shape, &style, &[], 1.0, 5.0, false, false, 30, 30);
            assert_eq!(&pixels[(15 * 30 + 15) * 4..(15 * 30 + 15) * 4 + 4], &[255; 4]);
            assert_eq!(pixels[3], 0, "{shape:?} keeps its corner transparent");
        }
    }

    #[test]
    fn a_media_paint_samples_the_decoded_rgba_frame() {
        let paint = Paint::Image {
            asset_id: "image".into(),
        };
        let pixels = [
            255, 0, 0, 255, 0, 255, 0, 255,
            0, 0, 255, 255, 255, 255, 255, 255,
        ];
        assert_eq!(sample_paint(&paint, Some(&pixels), 1.5, 0.5, 2, 2), [0, 255, 0, 255]);
        assert_eq!(sample_paint(&paint, Some(&pixels), 0.5, 1.5, 2, 2), [0, 0, 255, 255]);
    }
}
