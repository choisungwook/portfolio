//! Text is rasterized before it reaches the compositor, just like a decoded
//! video frame. The resulting RGBA image follows the same preview and export
//! path as every other layer.

use crate::Placement;
use fontdb::{Database, Family, Query};
use fontdue::layout::{CoordinateSystem, Layout, LayoutSettings, TextStyle as LayoutTextStyle};
use fontdue::{Font, FontSettings};
use makevideo_render::{Project, ShapeKind, TextAlign, TextStyle, VisualContent};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};

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
                    let key = format!(
                        "text\u{0}{text}\u{0}{style:?}\u{0}{item_width}x{item_height}\u{0}{scale:.4}"
                    );
                    cached(&key, || rasterize(text, style, item_width, item_height, scale))
                }
                VisualContent::Shape {
                    shape,
                    fill,
                    stroke,
                    stroke_width,
                    corner_radius,
                    start_arrow,
                    end_arrow,
                } => {
                    let key = format!(
                        "shape\u{0}{shape:?}\u{0}{fill}\u{0}{stroke}\u{0}{stroke_width}\u{0}{corner_radius}\u{0}{start_arrow}\u{0}{end_arrow}\u{0}{item_width}x{item_height}\u{0}{scale:.4}"
                    );
                    cached(&key, || rasterize_shape(
                        *shape,
                        fill,
                        stroke,
                        *stroke_width * scale,
                        *corner_radius * scale,
                        *start_arrow,
                        *end_arrow,
                        item_width,
                        item_height,
                    ))
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

#[allow(clippy::too_many_arguments)]
fn rasterize_shape(
    shape: ShapeKind,
    fill: &str,
    stroke: &str,
    stroke_width: f32,
    corner_radius: f32,
    start_arrow: bool,
    end_arrow: bool,
    width: u32,
    height: u32,
) -> Vec<u8> {
    let mut pixels = vec![0; width as usize * height as usize * 4];
    let fill = colour(fill, [79, 140, 255, 204]);
    let stroke = colour(stroke, [255, 255, 255, 255]);
    let edge = stroke_width.max(0.0) / 2.0;
    for y in 0..height {
        for x in 0..width {
            let point = (x as f32 + 0.5, y as f32 + 0.5);
            let (inside, outlined) = match shape {
                ShapeKind::Rectangle => rounded_rectangle(point, width as f32, height as f32, corner_radius, edge),
                ShapeKind::Ellipse => ellipse(point, width as f32, height as f32, edge),
                ShapeKind::Line => line(point, width as f32, height as f32, edge, start_arrow, end_arrow),
            };
            if inside {
                put_pixel(&mut pixels, width, x, y, if outlined { stroke } else { fill });
            }
        }
    }
    pixels
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

fn put_pixel(pixels: &mut [u8], width: u32, x: u32, y: u32, color: [u8; 4]) {
    let index = ((y * width + x) * 4) as usize;
    pixels[index..index + 4].copy_from_slice(&color);
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

fn rasterize(text: &str, style: &TextStyle, width: u32, height: u32, scale: f32) -> Vec<u8> {
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
    let color = colour(&style.color, [255, 255, 255, 255]);
    let shadow = colour(&style.shadow_color, [0, 0, 0, 0]);
    let stroke = colour(&style.stroke_color, [0, 0, 0, 0]);
    let stroke_radius = (style.stroke_width * scale).round().max(0.0) as i32;
    let shadow_x = (style.shadow_x * scale).round() as i32;
    let shadow_y = (style.shadow_y * scale).round() as i32;

    for glyph in layout.glyphs() {
        let (metrics, bitmap) = font.rasterize_config(glyph.key);
        let x = glyph.x.round() as i32;
        let y = glyph.y.round() as i32;
        if shadow[3] > 0 {
            draw_bitmap(&mut pixels, width, height, x + shadow_x, y + shadow_y, &metrics, &bitmap, shadow);
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
        draw_bitmap(&mut pixels, width, height, x, y, &metrics, &bitmap, color);
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

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_render::{
        Project, ProjectSettings, Rate, ShapeKind as Shape, Track, TrackKind, VisualContent as Content,
        VisualItem, VisualTransform, FORMAT_VERSION,
    };

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
                        fill: "#ff0000".into(),
                        stroke: "#ffffff".into(),
                        stroke_width: 1.0,
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
            "#00000000",
            "#ff0000",
            8.0,
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
            "#112233",
            "#ffffff",
            2.0,
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
            "#00000000",
            "#ff0000",
            3.0,
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
            "#00000000",
            "#ff0000",
            0.0,
            0.0,
            true,
            true,
            30,
            12,
        );
        assert!(no_stroke.chunks_exact(4).all(|pixel| pixel[3] == 0));
    }
}
