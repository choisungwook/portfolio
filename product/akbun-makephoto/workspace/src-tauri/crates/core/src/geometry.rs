//! Rotate, straighten and crop. Straightening zooms in just enough that no
//! empty corner shows, so a beginner never has to crop after leveling.

use crate::edit::Crop;
use image::{imageops, RgbImage};
use rayon::prelude::*;

pub fn rotate_quarters(image: RgbImage, quarters: u8) -> RgbImage {
    match quarters % 4 {
        1 => imageops::rotate90(&image),
        2 => imageops::rotate180(&image),
        3 => imageops::rotate270(&image),
        _ => image,
    }
}

/// The largest scale at which a w x h rectangle, rotated by `degrees`, still
/// covers a centered w*s x h*s rectangle.
pub fn inscribed_scale(w: f32, h: f32, degrees: f32) -> f32 {
    let t = degrees.to_radians().abs();
    let (s, c) = t.sin_cos();
    (w / (w * c + h * s)).min(h / (w * s + h * c))
}

/// The size, in source pixels, of the straightened frame that crops refer to.
pub fn frame_size(w: u32, h: u32, degrees: f32) -> (f32, f32) {
    let s = inscribed_scale(w as f32, h as f32, degrees);
    (w as f32 * s, h as f32 * s)
}

fn sample(src: &RgbImage, x: f32, y: f32) -> [u8; 3] {
    let (w, h) = src.dimensions();
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);
    let (x0, y0) = (x.floor() as u32, y.floor() as u32);
    let (x1, y1) = ((x0 + 1).min(w - 1), (y0 + 1).min(h - 1));
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let p = |x, y| src.get_pixel(x, y).0;
    let (a, b, c, d) = (p(x0, y0), p(x1, y0), p(x0, y1), p(x1, y1));
    let mut out = [0u8; 3];
    for i in 0..3 {
        let top = a[i] as f32 + (b[i] as f32 - a[i] as f32) * fx;
        let bottom = c[i] as f32 + (d[i] as f32 - c[i] as f32) * fx;
        out[i] = (top + (bottom - top) * fy + 0.5) as u8;
    }
    out
}

/// Straighten by `degrees` (clockwise), then cut `crop` out of the frame.
pub fn straighten_and_crop(src: &RgbImage, degrees: f32, crop: Option<Crop>) -> RgbImage {
    let crop = crop.map(Crop::clamped).unwrap_or(Crop { x: 0.0, y: 0.0, w: 1.0, h: 1.0 });
    let (w, h) = src.dimensions();
    if degrees.abs() < 0.01 {
        if crop.is_full() {
            return src.clone();
        }
        let x = (crop.x * w as f32).round() as u32;
        let y = (crop.y * h as f32).round() as u32;
        let cw = ((crop.w * w as f32).round() as u32).clamp(1, w - x.min(w - 1));
        let ch = ((crop.h * h as f32).round() as u32).clamp(1, h - y.min(h - 1));
        return imageops::crop_imm(src, x.min(w - 1), y.min(h - 1), cw, ch).to_image();
    }

    let (fw, fh) = frame_size(w, h, degrees);
    let out_w = ((crop.w * fw).round() as u32).max(1);
    let out_h = ((crop.h * fh).round() as u32).max(1);
    let (sin, cos) = degrees.to_radians().sin_cos();
    let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
    let mut out = RgbImage::new(out_w, out_h);
    out.as_mut()
        .par_chunks_mut(out_w as usize * 3)
        .enumerate()
        .for_each(|(v, row)| {
            let dy = crop.y * fh + v as f32 + 0.5 - fh / 2.0;
            for (u, px) in row.chunks_exact_mut(3).enumerate() {
                let dx = crop.x * fw + u as f32 + 0.5 - fw / 2.0;
                // The picture turned clockwise means each output pixel reads
                // the source turned back the other way.
                let sx = cx + dx * cos + dy * sin - 0.5;
                let sy = cy - dx * sin + dy * cos - 0.5;
                px.copy_from_slice(&sample(src, sx, sy));
            }
        });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inscribed_scale_is_one_when_level() {
        assert!((inscribed_scale(400.0, 300.0, 0.0) - 1.0).abs() < 1e-6);
        let s = inscribed_scale(400.0, 300.0, 10.0);
        assert!(s < 1.0 && s > 0.7);
    }

    #[test]
    fn crop_without_straighten_cuts_exact_pixels() {
        let src = RgbImage::from_fn(100, 50, |x, _| image::Rgb([x as u8, 0, 0]));
        let out = straighten_and_crop(&src, 0.0, Some(Crop { x: 0.5, y: 0.0, w: 0.5, h: 1.0 }));
        assert_eq!(out.dimensions(), (50, 50));
        assert_eq!(out.get_pixel(0, 0)[0], 50);
    }

    #[test]
    fn straighten_keeps_aspect_and_fills_corners() {
        let src = RgbImage::from_pixel(400, 300, image::Rgb([200, 200, 200]));
        let out = straighten_and_crop(&src, 8.0, None);
        let (w, h) = out.dimensions();
        assert!(((w as f32 / h as f32) - 4.0 / 3.0).abs() < 0.02);
        // No black corner: every pixel comes from inside the source.
        for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] {
            assert_eq!(out.get_pixel(x, y)[0], 200);
        }
    }

    #[test]
    fn quarter_turns_swap_dimensions() {
        let src = RgbImage::new(30, 20);
        assert_eq!(rotate_quarters(src.clone(), 1).dimensions(), (20, 30));
        assert_eq!(rotate_quarters(src, 2).dimensions(), (30, 20));
    }
}
