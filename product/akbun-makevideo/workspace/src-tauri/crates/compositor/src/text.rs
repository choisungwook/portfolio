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
    pub lut: Option<Arc<crate::lut::Lut>>,
    pub placement: Placement,
    pub track_order: usize,
    pub z_index: i32,
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
    *FFMPEG.get_or_init(|| RwLock::new(None)).write().unwrap() = Some(path.to_string());
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
    pub blend_mode: makevideo_render::BlendMode,
    pub adjustment_lut: Option<Arc<crate::lut::Lut>>,
    pub track_order: usize,
    pub z_index: i32,
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
            lut: raster.adjustment_lut,
            placement: Placement {
                dst: makevideo_render::layout::Rect {
                    x: raster.x,
                    y: raster.y,
                    w: raster.width,
                    h: raster.height,
                },
                opacity: raster.opacity,
                blend_mode: raster.blend_mode,
                adjustment: raster.width == 0 || raster.height == 0,
            },
            track_order: raster.track_order,
            z_index: raster.z_index,
        })
        .collect()
}

/// Every text and shape item in the project, rasterized once each.
pub fn item_rasters(project: &Project, width: u32, height: u32) -> Vec<ItemRaster> {
    each_visual_item(project, width, height, None)
        .into_iter()
        .filter(|item| item.adjustment_lut.is_none())
        .collect()
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
            let transform = visual_transform(project, track, item, item.start);
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

    for (track_order, track) in project
        .tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| track.contributes())
    {
        if !matches!(
            track.kind,
            makevideo_render::TrackKind::Video | makevideo_render::TrackKind::Subtitle
        ) {
            continue;
        }
        let mut items: Vec<_> = track
            .visual_items
            .iter()
            .filter(|item| at.is_none_or(|frame| item.contains_frame(frame)))
            .collect();
        items.sort_by_key(|item| item.z_index);
        for item in items {
            let paint_frame = at.unwrap_or(item.start);
            let transform = visual_transform(project, track, item, paint_frame);
            let (item_width, item_height) = visual_dimensions(transform, scale_x, scale_y);
            let pixels = match &item.content {
                VisualContent::Text { text, style } => {
                    let style = track.subtitle_style.as_ref().unwrap_or(style);
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
                VisualContent::Adjustment { lut_path } => {
                    layers.push(ItemRaster {
                        pixels: Arc::from([]),
                        width: 0,
                        height: 0,
                        x: 0,
                        y: 0,
                        opacity: 1.0,
                        blend_mode: makevideo_render::BlendMode::Normal,
                        adjustment_lut: crate::lut::Lut::from_cube_file(lut_path)
                            .ok()
                            .map(Arc::new),
                        track_order,
                        z_index: item.z_index,
                        start_frame: item.start,
                        end_frame: item.end_frame(),
                    });
                    continue;
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
                blend_mode: item.blend_mode,
                adjustment_lut: None,
                track_order,
                z_index: item.z_index,
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
    frame: i64,
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
        item.transform_at(frame)
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
                        draw_bitmap(
                            &mut pixels,
                            width,
                            height,
                            x + offset_x,
                            y + offset_y,
                            &metrics,
                            &bitmap,
                            stroke,
                        );
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
    let id = requested_font_id(database, family).or_else(|| {
        database.query(&Query {
            families: &[Family::SansSerif],
            ..Query::default()
        })
    })?;
    let font = database
        .with_face_data(id, |data, _index| {
            Font::from_bytes(data, FontSettings::default()).ok()
        })
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
        _ => {
            return database.query(&Query {
                families: &[Family::Name(family)],
                ..Query::default()
            })
        }
    };
    database.query(&Query {
        families: &[generic],
        ..Query::default()
    })
}

fn colour(value: &str, fallback: [u8; 4]) -> [u8; 4] {
    let value = value.trim().strip_prefix('#').unwrap_or(value.trim());
    let rgb = match value.len() {
        6 => u32::from_str_radix(value, 16).ok().map(|value| {
            [
                ((value >> 16) & 0xff) as u8,
                ((value >> 8) & 0xff) as u8,
                (value & 0xff) as u8,
                255,
            ]
        }),
        8 => u32::from_str_radix(value, 16).ok().map(|value| {
            [
                ((value >> 24) & 0xff) as u8,
                ((value >> 16) & 0xff) as u8,
                ((value >> 8) & 0xff) as u8,
                (value & 0xff) as u8,
            ]
        }),
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
            if target_x < 0 || target_y < 0 || target_x >= width as i32 || target_y >= height as i32
            {
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
            pixels[index + 3] =
                (alpha as u16 + pixels[index + 3] as u16 * keep / 255).min(255) as u8;
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
            if target_x < 0 || target_y < 0 || target_x >= width as i32 || target_y >= height as i32
            {
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
            blend_at(pixels, width, target_x as u32, target_y as u32, color);
        }
    }
}

mod media;
use media::*;
mod shape;
use shape::*;

#[cfg(test)]
mod tests;
