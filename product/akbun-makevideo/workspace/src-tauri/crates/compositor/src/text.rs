//! Text is rasterized before it reaches the compositor, just like a decoded
//! video frame. The resulting RGBA image follows the same preview and export
//! path as every other layer.

use crate::Placement;
use fontdb::{Database, Family, Query};
use fontdue::layout::{CoordinateSystem, Layout, LayoutSettings, TextStyle as LayoutTextStyle};
use fontdue::{Font, FontSettings};
use makevideo_render::{Project, TextAlign, TextStyle, VisualContent};
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

pub fn layers_at(project: &Project, frame: i64, width: u32, height: u32) -> Vec<RasterLayer> {
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
            .filter(|item| item.contains_frame(frame))
            .collect();
        items.sort_by_key(|item| item.z_index);
        for item in items {
            let VisualContent::Text { text, style } = &item.content else {
                continue;
            };
            let style = track.subtitle_style.as_ref().unwrap_or(style);
            let transform = if track.kind == makevideo_render::TrackKind::Subtitle {
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
            };
            let item_width = (transform.width * scale_x).round().max(1.0) as u32;
            let item_height = (transform.height * scale_y).round().max(1.0) as u32;
            let key = format!(
                "{text}\u{0}{style:?}\u{0}{item_width}x{item_height}\u{0}{scale:.4}"
            );
            let pixels = cached(&key, || rasterize(text, style, item_width, item_height, scale));
            layers.push(RasterLayer {
                pixels,
                width: item_width,
                height: item_height,
                placement: Placement {
                    dst: makevideo_render::layout::Rect {
                        x: (transform.x * scale_x).round() as i32,
                        y: (transform.y * scale_y).round() as i32,
                        w: item_width,
                        h: item_height,
                    },
                    opacity: transform.opacity.clamp(0.0, 1.0),
                },
            });
        }
    }
    layers
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

    #[test]
    fn colour_accepts_css_hex_with_alpha() {
        assert_eq!(colour("#11223344", [0; 4]), [0x11, 0x22, 0x33, 0x44]);
    }
}
