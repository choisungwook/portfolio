//! Shape masks, shadows, and painting pixels with fills and gradients.

use super::*;

#[allow(clippy::too_many_arguments)]
pub(super) fn rasterize_shape(
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
    let stroke_width = style
        .stroke
        .as_ref()
        .map(|stroke| stroke.width)
        .unwrap_or(0.0)
        * scale;
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

pub(super) fn shape_mask(
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
                ShapeKind::RoundedRectangle => {
                    rounded_rectangle(point, width as f32, height as f32, corner_radius, edge)
                }
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

pub(super) fn rounded_rectangle(
    point: (f32, f32),
    width: f32,
    height: f32,
    radius: f32,
    edge: f32,
) -> (bool, bool) {
    let radius = radius.clamp(0.0, width.min(height) / 2.0);
    let dx = (point.0 - width / 2.0).abs() - (width / 2.0 - radius);
    let dy = (point.1 - height / 2.0).abs() - (height / 2.0 - radius);
    let distance = dx.max(0.0).hypot(dy.max(0.0)) + dx.max(dy).min(0.0) - radius;
    (distance <= 0.0, distance >= -edge)
}

pub(super) fn ellipse(point: (f32, f32), width: f32, height: f32, edge: f32) -> (bool, bool) {
    let nx = (point.0 - width / 2.0) / (width / 2.0).max(1.0);
    let ny = (point.1 - height / 2.0) / (height / 2.0).max(1.0);
    let distance = (nx * nx + ny * ny).sqrt();
    let outline = edge / (width.min(height) / 2.0).max(1.0);
    (distance <= 1.0, distance >= 1.0 - outline)
}

pub(super) fn line(
    point: (f32, f32),
    width: f32,
    height: f32,
    radius: f32,
    start_arrow: bool,
    end_arrow: bool,
) -> (bool, bool) {
    if radius <= 0.0 {
        return (false, false);
    }
    let centre = height / 2.0;
    let body = (point.1 - centre).abs() <= radius && point.0 >= radius && point.0 <= width - radius;
    let arrow_size = (radius * 3.0).max(8.0);
    let arrow = |tip_x: f32, points_left: bool| {
        let dx = if points_left {
            tip_x - point.0
        } else {
            point.0 - tip_x
        };
        dx >= 0.0 && dx <= arrow_size && (point.1 - centre).abs() <= dx * 0.65 + 0.5
    };
    (
        body || (start_arrow && arrow(0.0, false)) || (end_arrow && arrow(width, true)),
        true,
    )
}

pub(super) fn polygon(
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
            (
                center.0 + angle.cos() * radius,
                center.1 + angle.sin() * radius,
            )
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

pub(super) fn segment_distance(point: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let delta = (b.0 - a.0, b.1 - a.1);
    let length = delta.0 * delta.0 + delta.1 * delta.1;
    if length <= f32::EPSILON {
        return (point.0 - a.0).hypot(point.1 - a.1);
    }
    let amount = (((point.0 - a.0) * delta.0 + (point.1 - a.1) * delta.1) / length).clamp(0.0, 1.0);
    (point.0 - (a.0 + delta.0 * amount)).hypot(point.1 - (a.1 + delta.1 * amount))
}

pub(super) fn draw_shadow(
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

pub(super) fn paint_stack(
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

pub(super) fn sample_paint(
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

pub(super) fn gradient(stops: &[GradientStop], position: f32) -> [u8; 4] {
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

pub(super) fn blend_at(pixels: &mut [u8], width: u32, x: u32, y: u32, color: [u8; 4]) {
    let index = ((y * width + x) * 4) as usize;
    blend(&mut pixels[index..index + 4], color);
}

pub(super) fn blend(destination: &mut [u8], source: [u8; 4]) {
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
                + destination[channel] as f32 * destination_alpha * (1.0 - source_alpha))
                / output_alpha)
                .round()
                .clamp(0.0, 255.0) as u8
        };
    }
    destination[3] = (output_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
}
