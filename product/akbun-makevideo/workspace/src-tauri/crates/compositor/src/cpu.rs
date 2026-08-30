//! The software half of the compositor. Always compiled, needs nothing
//! installed, and is what runs when there is no graphics device or when the
//! `gpu` feature is off entirely.
//!
//! This mirrors `composite.wgsl` deliberately and line for line:
//!
//! ```text
//! shader:  out = vec4(texel.rgb, texel.a * opacity)
//! blend:   colour  SrcAlpha, OneMinusSrcAlpha
//!          alpha   One,      OneMinusSrcAlpha
//! ```
//!
//! so `blend_pixel` below is that, in f32, rounded the way a unorm8 target
//! rounds. `both_backends_draw_the_same_frame` in lib.rs is what keeps the two
//! honest; if the shader changes and this does not, that test fails.

use crate::{Placement, Source};

#[derive(Default)]
pub struct CpuCompositor;

impl CpuCompositor {
    pub fn new() -> CpuCompositor {
        CpuCompositor
    }

    pub fn adapter(&self) -> &str {
        "software (CPU)"
    }

    pub fn compose(
        &self,
        width: u32,
        height: u32,
        layers: &[(Source<'_>, Placement)],
    ) -> Result<Vec<u8>, String> {
        if width == 0 || height == 0 {
            return Err("the output frame has no size".into());
        }
        // Opaque black, the same base the shader clears to and the same one the
        // filter graph starts from.
        let mut frame = vec![0u8; (width as usize) * (height as usize) * 4];
        for pixel in frame.chunks_exact_mut(4) {
            pixel[3] = 255;
        }

        for (source, placement) in layers {
            let expected = (source.width as usize) * (source.height as usize) * 4;
            if source.rgba.len() < expected {
                return Err(format!(
                    "a {}x{} source frame needs {expected} bytes, got {}",
                    source.width,
                    source.height,
                    source.rgba.len()
                ));
            }
            if source.width == 0 || source.height == 0 {
                continue;
            }
            draw(&mut frame, width, height, source, placement);
        }
        Ok(frame)
    }
}

fn draw(frame: &mut [u8], width: u32, height: u32, source: &Source<'_>, placement: &Placement) {
    let rect = placement.dst;
    if rect.w == 0 || rect.h == 0 {
        return;
    }
    let opacity = placement.opacity.clamp(0.0, 1.0);
    // Whole rows and columns that fall outside the frame are skipped rather
    // than clamped, so a layer placed half off screen draws its visible half.
    let x0 = rect.x.max(0);
    let y0 = rect.y.max(0);
    let x1 = (rect.x + rect.w as i32).min(width as i32);
    let y1 = (rect.y + rect.h as i32).min(height as i32);
    if x1 <= x0 || y1 <= y0 {
        return;
    }

    // The pipeline scales every clip to its destination size with ffmpeg before
    // it gets here, so this is normally a straight copy. The nearest-neighbour
    // branch only runs for a caller that did not, and is the one place the two
    // backends can disagree: the shader samples linearly.
    let one_to_one = source.width == rect.w && source.height == rect.h;

    for y in y0..y1 {
        let local_y = (y - rect.y) as u32;
        let source_y = if one_to_one {
            local_y
        } else {
            (local_y as u64 * source.height as u64 / rect.h as u64) as u32
        };
        let source_row = (source_y.min(source.height - 1) as usize) * (source.width as usize) * 4;
        let frame_row = (y as usize) * (width as usize) * 4;

        for x in x0..x1 {
            let local_x = (x - rect.x) as u32;
            let source_x = if one_to_one {
                local_x
            } else {
                (local_x as u64 * source.width as u64 / rect.w as u64) as u32
            };
            let source_index = source_row + (source_x.min(source.width - 1) as usize) * 4;
            let frame_index = frame_row + (x as usize) * 4;
            let mut texel = [
                source.rgba[source_index],
                source.rgba[source_index + 1],
                source.rgba[source_index + 2],
                source.rgba[source_index + 3],
            ];
            if let Some(lut) = source.lut {
                let corrected = lut.sample([
                    texel[0] as f32 / 255.0,
                    texel[1] as f32 / 255.0,
                    texel[2] as f32 / 255.0,
                ]);
                for channel in 0..3 {
                    texel[channel] = round_unorm(corrected[channel] * 255.0);
                }
            }
            blend_pixel(&mut frame[frame_index..frame_index + 4], texel, opacity);
        }
    }
}

/// One source-over blend, matching `composite.wgsl` and the blend state set on
/// the render pipeline.
#[inline]
fn blend_pixel(destination: &mut [u8], texel: [u8; 4], opacity: f32) {
    // Decoded video is normally opaque. Avoid four floating-point blend
    // operations per pixel for the overwhelmingly common full-opacity path;
    // four FHD tracks otherwise spend most of their frame budget multiplying
    // values whose result is simply the source byte.
    if texel[3] == 255 && opacity >= 1.0 {
        destination.copy_from_slice(&texel);
        return;
    }
    let source_alpha = (texel[3] as f32 / 255.0) * opacity;
    if source_alpha <= 0.0 {
        return;
    }
    let keep = 1.0 - source_alpha;
    for channel in 0..3 {
        let mixed = texel[channel] as f32 * source_alpha + destination[channel] as f32 * keep;
        destination[channel] = round_unorm(mixed);
    }
    let existing = destination[3] as f32 / 255.0;
    destination[3] = round_unorm((source_alpha + existing * keep) * 255.0);
}

/// How a unorm8 render target rounds, so the two backends land on the same
/// byte rather than one apart.
#[inline]
fn round_unorm(value: f32) -> u8 {
    value.clamp(0.0, 255.0).round() as u8
}
