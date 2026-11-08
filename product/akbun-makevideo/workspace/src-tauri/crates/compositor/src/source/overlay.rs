//! Rounded corners, borders and fills applied to an overlay's pixels.

pub(crate) fn apply_overlay_style(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    style: &makevideo_render::layout::OverlayStyle,
) {
    let radius = style
        .corner_radius
        .clamp(0.0, width.min(height) as f32 / 2.0);
    let border_width = style
        .border
        .as_ref()
        .map(|border| border.width.clamp(0.0, width.min(height) as f32 / 2.0))
        .unwrap_or(0.0);
    let border = style
        .border
        .as_ref()
        .and_then(|stroke| parse_rgba(&stroke.color));
    if radius <= 0.0 && border_width <= 0.0 {
        return;
    }
    for y in 0..height {
        for x in 0..width {
            let index = ((y * width + x) * 4) as usize;
            if !inside_rounded_rect(x as f32 + 0.5, y as f32 + 0.5, width, height, radius, 0.0) {
                pixels[index + 3] = 0;
                continue;
            }
            if border_width > 0.0
                && !inside_rounded_rect(
                    x as f32 + 0.5,
                    y as f32 + 0.5,
                    width,
                    height,
                    (radius - border_width).max(0.0),
                    border_width,
                )
            {
                if let Some(color) = border {
                    pixels[index..index + 4].copy_from_slice(&color);
                }
            }
        }
    }
}

pub(super) fn inside_rounded_rect(
    x: f32,
    y: f32,
    width: u32,
    height: u32,
    radius: f32,
    inset: f32,
) -> bool {
    let left = inset;
    let top = inset;
    let right = width as f32 - inset;
    let bottom = height as f32 - inset;
    if x < left || y < top || x >= right || y >= bottom {
        return false;
    }
    if radius <= 0.0 {
        return true;
    }
    let cx = x.clamp(left + radius, right - radius);
    let cy = y.clamp(top + radius, bottom - radius);
    (x - cx).powi(2) + (y - cy).powi(2) <= radius.powi(2)
}

pub(super) fn parse_rgba(value: &str) -> Option<[u8; 4]> {
    let text = value.strip_prefix('#')?;
    if text.len() != 6 && text.len() != 8 {
        return None;
    }
    let channel = |at| u8::from_str_radix(&text[at..at + 2], 16).ok();
    Some([
        channel(0)?,
        channel(2)?,
        channel(4)?,
        if text.len() == 8 { channel(6)? } else { 255 },
    ])
}
