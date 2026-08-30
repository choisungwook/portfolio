//! The swapchain the monitor draws on.
//!
//! The composited frame never becomes a `Vec<u8>` here. `draw_onto` writes into
//! the texture the window is about to show, with the same pipeline and the same
//! shader the render uses, and `present` hands it over. That is the whole of
//! what "native viewport" buys: at 1080p30 the readback-and-upload route the
//! webview needs is about 250 MB a second of pure copying, and none of it
//! happens on this path.
//!
//! Nothing here is platform specific. Making a window handle to hand over, and
//! putting the view where the page says it should be, is the app's business —
//! `src-tauri/src/viewport/` — and that split is what a Windows build would
//! replace.

use crate::player::Sink;
use makevideo_compositor::gpu::GpuCompositor;
use makevideo_compositor::source::Frame;
use makevideo_compositor::{Compositor, Placement, Source};
use makevideo_render::layout::Rect;
use std::sync::Arc;

/// Editor-only marks drawn by the monitor surface after the project frame.
/// They live here, rather than in `Frame`, so render and export can never
/// accidentally include them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Guides {
    pub action_safe_area: bool,
    pub title_safe_area: bool,
    pub rule_of_thirds: bool,
    pub center_lines: bool,
}

struct GuideLayer {
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    dst: Rect,
}

struct GuideOverlay {
    layers: Vec<GuideLayer>,
}

impl GuideOverlay {
    #[cfg(test)]
    fn bytes(&self) -> usize {
        self.layers.iter().map(|layer| layer.pixels.len()).sum()
    }
}

impl Guides {
    pub fn visible(self) -> bool {
        self.action_safe_area || self.title_safe_area || self.rule_of_thirds || self.center_lines
    }
}

/// What the surface is asked for, in order of preference.
///
/// Non-sRGB, because the offscreen frame is drawn into `Rgba8Unorm` and the
/// shader blends encoded values. An sRGB swapchain would apply a conversion on
/// write that the file never gets, and the monitor would be brighter than the
/// render for no reason anybody could see in the code.
const WANTED: [wgpu::TextureFormat; 2] = [
    wgpu::TextureFormat::Bgra8Unorm,
    wgpu::TextureFormat::Rgba8Unorm,
];

/// Draws the composite straight onto a window.
pub struct SurfaceSink {
    compositor: Arc<Compositor>,
    surface: wgpu::Surface<'static>,
    pipeline: wgpu::RenderPipeline,
    config: wgpu::SurfaceConfiguration,
    /// The project frame. The surface is the size of the view on screen, and
    /// the layers are laid out inside a frame of this size, so the two are not
    /// the same number and mixing them up puts the picture in a corner.
    width: u32,
    height: u32,
    guides: Guides,
    guide_overlay: Option<Arc<GuideOverlay>>,
    outcome: PresentOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresentOutcome {
    Presented,
    Deferred,
    Hidden,
}

impl SurfaceSink {
    /// `target` is a window to draw on. It has to outlive the sink, which is
    /// what `'static` says, and on the app side is satisfied by the native view
    /// being owned for as long as playback is.
    ///
    /// Fails rather than falling back. A monitor that silently draws nowhere is
    /// the failure this whole stage exists to remove, so the caller is told and
    /// takes the media element route instead.
    pub fn new(
        compositor: Arc<Compositor>,
        target: wgpu::SurfaceTarget<'static>,
        surface_width: u32,
        surface_height: u32,
        width: u32,
        height: u32,
    ) -> Result<SurfaceSink, String> {
        let gpu = compositor
            .gpu()
            .ok_or("this machine has no graphics device to draw the monitor on")?;
        let surface = gpu
            .instance()
            .create_surface(target)
            .map_err(|error| format!("cannot make a surface for the monitor: {error}"))?;
        let capabilities = surface.get_capabilities(gpu.adapter_handle());
        let format = pick_format(&capabilities.formats)
            .ok_or("the window offers no surface format this can draw in")?;
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            // Auto resolves to sRGB for an 8 bit format, which is what the
            // display expects of the encoded values the shader writes — the
            // same values ffmpeg gets. Anything wider would show the monitor a
            // picture the file does not contain.
            color_space: wgpu::SurfaceColorSpace::Auto,
            width: surface_width.max(1),
            height: surface_height.max(1),
            // Fifo is vsync, which is the point: the scheduler decides *which*
            // frame, and the display decides when it can physically change.
            // Anything else here would tear in exchange for latency the audio
            // clock has already accounted for.
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(gpu.device(), &config);
        let pipeline = gpu.pipeline_for(format);
        Ok(SurfaceSink {
            compositor,
            surface,
            pipeline,
            config,
            width,
            height,
            guides: Guides::default(),
            guide_overlay: None,
            outcome: PresentOutcome::Deferred,
        })
    }

    pub fn with_guides(mut self, guides: Guides) -> SurfaceSink {
        self.set_guides(guides);
        self
    }

    /// Replace only the editor overlay. The surface, compositor and decoded
    /// frame path stay intact; the next `show` uses the new marks.
    pub fn set_guides(&mut self, guides: Guides) {
        if self.guides == guides {
            return;
        }
        self.guides = guides;
        self.guide_overlay = guide_overlay(self.width, self.height, guides).map(Arc::new);
    }

    /// Change the coordinate space of the project frame without replacing the
    /// window surface. Preview-quality switches use the same swapchain with a
    /// differently sized decoded/composited frame.
    pub fn set_frame_size(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if self.width == width && self.height == height {
            return;
        }
        self.width = width;
        self.height = height;
        self.guide_overlay = guide_overlay(width, height, self.guides).map(Arc::new);
    }

    /// The view changed size. Cheap, and safe to call with the same size.
    pub fn resize(&mut self, surface_width: u32, surface_height: u32) {
        let (want_w, want_h) = (surface_width.max(1), surface_height.max(1));
        if self.config.width == want_w && self.config.height == want_h {
            return;
        }
        self.config.width = want_w;
        self.config.height = want_h;
        if let Some(gpu) = self.compositor.gpu() {
            self.surface.configure(gpu.device(), &self.config);
        }
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.config.format
    }

    /// Whether the most recent draw acquired and presented a swapchain image.
    /// Occlusion and timeout keep playback healthy but are not a candidate
    /// commit point.
    pub fn present_outcome(&self) -> PresentOutcome {
        self.outcome
    }

    fn gpu(&self) -> Result<&GpuCompositor, String> {
        self.compositor
            .gpu()
            .ok_or_else(|| "the graphics device went away".to_string())
    }

    fn draw(&mut self, layers: &[(Source<'_>, Placement)]) -> Result<(), String> {
        self.outcome = PresentOutcome::Deferred;
        let gpu = self.gpu()?;
        let texture = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(texture)
            | wgpu::CurrentSurfaceTexture::Suboptimal(texture) => texture,
            // A window that has just been resized or moved between displays
            // hands one of these back. Reconfiguring and trying once more is
            // the ordinary path, not an error.
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(gpu.device(), &self.config);
                match self.surface.get_current_texture() {
                    wgpu::CurrentSurfaceTexture::Success(texture)
                    | wgpu::CurrentSurfaceTexture::Suboptimal(texture) => texture,
                    wgpu::CurrentSurfaceTexture::Occluded => {
                        self.outcome = PresentOutcome::Hidden;
                        return Ok(());
                    }
                    wgpu::CurrentSurfaceTexture::Timeout => return Ok(()),
                    other => return Err(format!("the monitor surface is gone: {other:?}")),
                }
            }
            // Minimised, behind another window, or the compositor was busy.
            // There is nowhere to draw and nothing is wrong: the frame is over
            // and playback goes on. Reporting a failure here would fill the
            // error log every time somebody minimised the app.
            wgpu::CurrentSurfaceTexture::Occluded => {
                self.outcome = PresentOutcome::Hidden;
                return Ok(());
            }
            wgpu::CurrentSurfaceTexture::Timeout => return Ok(()),
            other => return Err(format!("cannot draw the monitor: {other:?}")),
        };
        let view = texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        gpu.draw_onto(&view, &self.pipeline, self.width, self.height, layers)?;
        gpu.queue().present(texture);
        self.outcome = PresentOutcome::Presented;
        Ok(())
    }
}

impl Sink for SurfaceSink {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        let overlay = self.guide_overlay.as_ref().map(Arc::clone);
        let mut layers = frame.sources();
        if let Some(overlay) = overlay.as_deref() {
            layers.extend(overlay.layers.iter().map(|guide| {
                (
                    Source {
                        rgba: &guide.pixels,
                        width: guide.width,
                        height: guide.height,
                        lut: None,
                    },
                    Placement {
                        dst: guide.dst,
                        opacity: 1.0,
                    },
                )
            }));
        }
        self.draw(&layers)
    }

    fn clear(&mut self) -> Result<(), String> {
        let overlay = self.guide_overlay.as_ref().map(Arc::clone);
        let layers = overlay
            .as_deref()
            .map(|overlay| {
                overlay
                    .layers
                    .iter()
                    .map(|guide| {
                        (
                            Source {
                                rgba: &guide.pixels,
                                width: guide.width,
                                height: guide.height,
                                lut: None,
                            },
                            Placement {
                                dst: guide.dst,
                                opacity: 1.0,
                            },
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        self.draw(&layers)
    }
}

fn guide_overlay(width: u32, height: u32, guides: Guides) -> Option<GuideOverlay> {
    if width == 0 || height == 0 || !guides.visible() {
        return None;
    }
    let mut layers = Vec::new();
    let scale = (width.max(height) / 960).max(1);
    let pale = [0xe8, 0xee, 0xf7, 0xff];
    let gold = [0xf7, 0xd1, 0x54, 0xff];
    if guides.action_safe_area {
        dashed_rect(
            &mut layers,
            width,
            height,
            inset_rect(width, height, 35, 1_000),
            pale,
            scale,
            6 * scale,
            4 * scale,
        );
    }
    if guides.title_safe_area {
        dashed_rect(
            &mut layers,
            width,
            height,
            inset_rect(width, height, 50, 1_000),
            gold,
            scale,
            6 * scale,
            4 * scale,
        );
    }
    if guides.rule_of_thirds {
        for x in [width / 3, width.saturating_mul(2) / 3] {
            layers.push(dashed_vertical(
                width,
                height,
                0,
                height.saturating_sub(1),
                x,
                pale,
                scale,
                3 * scale,
                3 * scale,
            ));
        }
        for y in [height / 3, height.saturating_mul(2) / 3] {
            layers.push(dashed_horizontal(
                width,
                height,
                0,
                width.saturating_sub(1),
                y,
                pale,
                scale,
                3 * scale,
                3 * scale,
            ));
        }
    }
    if guides.center_lines {
        let line = scale.saturating_mul(2);
        layers.push(dashed_vertical(
            width,
            height,
            0,
            height.saturating_sub(1),
            width / 2,
            pale,
            line,
            3 * scale,
            3 * scale,
        ));
        layers.push(dashed_horizontal(
            width,
            height,
            0,
            width.saturating_sub(1),
            height / 2,
            pale,
            line,
            3 * scale,
            3 * scale,
        ));
    }
    Some(GuideOverlay { layers })
}

#[derive(Clone, Copy)]
struct GuideRect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

fn inset_rect(width: u32, height: u32, numerator: u32, denominator: u32) -> GuideRect {
    let x = width.saturating_mul(numerator) / denominator;
    let y = height.saturating_mul(numerator) / denominator;
    GuideRect {
        x,
        y,
        w: width.saturating_sub(2 * x).max(1),
        h: height.saturating_sub(2 * y).max(1),
    }
}

fn dashed_rect(
    layers: &mut Vec<GuideLayer>,
    width: u32,
    height: u32,
    rect: GuideRect,
    colour: [u8; 4],
    line: u32,
    dash: u32,
    gap: u32,
) {
    let right = rect
        .x
        .saturating_add(rect.w)
        .saturating_sub(1)
        .min(width - 1);
    let bottom = rect
        .y
        .saturating_add(rect.h)
        .saturating_sub(1)
        .min(height - 1);
    layers.push(dashed_horizontal(
        width, height, rect.x, right, rect.y, colour, line, dash, gap,
    ));
    layers.push(dashed_horizontal(
        width, height, rect.x, right, bottom, colour, line, dash, gap,
    ));
    layers.push(dashed_vertical(
        width, height, rect.y, bottom, rect.x, colour, line, dash, gap,
    ));
    layers.push(dashed_vertical(
        width, height, rect.y, bottom, right, colour, line, dash, gap,
    ));
}

fn dashed_horizontal(
    _width: u32,
    height: u32,
    start: u32,
    end: u32,
    y: u32,
    colour: [u8; 4],
    line: u32,
    dash: u32,
    gap: u32,
) -> GuideLayer {
    let length = end.saturating_sub(start).saturating_add(1).max(1);
    let thickness = line.min(height.saturating_sub(y)).max(1);
    let mut pixels = vec![0; length as usize * thickness as usize * 4];
    for x in 0..length {
        if x % (dash + gap).max(1) < dash {
            for row in 0..thickness {
                let at = ((row * length + x) * 4) as usize;
                pixels[at..at + 4].copy_from_slice(&colour);
            }
        }
    }
    GuideLayer {
        pixels,
        width: length,
        height: thickness,
        dst: Rect {
            x: coordinate(start),
            y: coordinate(y),
            w: length,
            h: thickness,
        },
    }
}

fn dashed_vertical(
    width: u32,
    _height: u32,
    start: u32,
    end: u32,
    x: u32,
    colour: [u8; 4],
    line: u32,
    dash: u32,
    gap: u32,
) -> GuideLayer {
    let length = end.saturating_sub(start).saturating_add(1).max(1);
    let thickness = line.min(width.saturating_sub(x)).max(1);
    let mut pixels = vec![0; thickness as usize * length as usize * 4];
    for y in 0..length {
        if y % (dash + gap).max(1) < dash {
            for column in 0..thickness {
                let at = ((y * thickness + column) * 4) as usize;
                pixels[at..at + 4].copy_from_slice(&colour);
            }
        }
    }
    GuideLayer {
        pixels,
        width: thickness,
        height: length,
        dst: Rect {
            x: coordinate(x),
            y: coordinate(start),
            w: thickness,
            h: length,
        },
    }
}

fn coordinate(value: u32) -> i32 {
    i32::try_from(value).unwrap_or(i32::MAX)
}

/// The first of [`WANTED`] the window offers, then any other non-sRGB one,
/// and nothing at all rather than an sRGB surface: a picture that does not
/// match the file is what this stage removed, and taking one back silently
/// would be worse than falling back to the media elements.
fn pick_format(offered: &[wgpu::TextureFormat]) -> Option<wgpu::TextureFormat> {
    for wanted in WANTED {
        if offered.contains(&wanted) {
            return Some(wanted);
        }
    }
    offered
        .iter()
        .copied()
        .find(|format| !format.is_srgb() && format.has_color_aspect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn overlay_pixel(overlay: &GuideOverlay, x: u32, y: u32) -> [u8; 4] {
        let mut found = [0, 0, 0, 0];
        for layer in &overlay.layers {
            let left = layer.dst.x.max(0) as u32;
            let top = layer.dst.y.max(0) as u32;
            if x < left || y < top || x >= left + layer.width || y >= top + layer.height {
                continue;
            }
            let local_x = x - left;
            let local_y = y - top;
            let at = ((local_y * layer.width + local_x) * 4) as usize;
            let pixel = [
                layer.pixels[at],
                layer.pixels[at + 1],
                layer.pixels[at + 2],
                layer.pixels[at + 3],
            ];
            if pixel[3] != 0 {
                found = pixel;
            }
        }
        found
    }

    #[test]
    fn disabled_guides_allocate_no_overlay() {
        assert!(guide_overlay(1920, 1080, Guides::default()).is_none());
    }

    #[test]
    fn title_safe_uses_the_same_inset_and_colour_as_the_page_guide() {
        let overlay = guide_overlay(
            100,
            100,
            Guides {
                title_safe_area: true,
                ..Guides::default()
            },
        )
        .unwrap();
        assert_eq!(overlay_pixel(&overlay, 5, 5), [0xf7, 0xd1, 0x54, 0xff]);
        assert_eq!(overlay_pixel(&overlay, 1, 1), [0, 0, 0, 0]);
    }

    #[test]
    fn thirds_and_centres_are_monitor_overlay_pixels() {
        let overlay = guide_overlay(
            90,
            60,
            Guides {
                rule_of_thirds: true,
                center_lines: true,
                ..Guides::default()
            },
        )
        .unwrap();
        assert_eq!(overlay_pixel(&overlay, 30, 0), [0xe8, 0xee, 0xf7, 0xff]);
        assert_eq!(overlay_pixel(&overlay, 45, 0), [0xe8, 0xee, 0xf7, 0xff]);
        assert_eq!(overlay_pixel(&overlay, 1, 1), [0, 0, 0, 0]);
    }

    #[test]
    fn four_k_guides_use_strips_smaller_than_one_megabyte() {
        let overlay = guide_overlay(
            3840,
            2160,
            Guides {
                action_safe_area: true,
                title_safe_area: true,
                rule_of_thirds: true,
                center_lines: true,
            },
        )
        .unwrap();
        assert!(overlay.bytes() < 1_000_000, "{} bytes", overlay.bytes());
    }

    #[test]
    fn bgra_is_taken_first_because_that_is_what_a_mac_offers() {
        let offered = [
            wgpu::TextureFormat::Bgra8UnormSrgb,
            wgpu::TextureFormat::Bgra8Unorm,
            wgpu::TextureFormat::Rgba8Unorm,
        ];
        assert_eq!(pick_format(&offered), Some(wgpu::TextureFormat::Bgra8Unorm));
    }

    #[test]
    fn rgba_serves_when_bgra_is_not_offered() {
        let offered = [
            wgpu::TextureFormat::Rgba8UnormSrgb,
            wgpu::TextureFormat::Rgba8Unorm,
        ];
        assert_eq!(pick_format(&offered), Some(wgpu::TextureFormat::Rgba8Unorm));
    }

    /// The one that matters: an sRGB surface would make the monitor disagree
    /// with the file, and disagreeing is what this stage was for.
    #[test]
    fn an_srgb_only_window_is_refused_rather_than_accepted() {
        let offered = [
            wgpu::TextureFormat::Bgra8UnormSrgb,
            wgpu::TextureFormat::Rgba8UnormSrgb,
        ];
        assert_eq!(pick_format(&offered), None);
    }

    #[test]
    fn a_window_offering_nothing_is_refused() {
        assert_eq!(pick_format(&[]), None);
    }

    /// A machine offering something exotic but linear is still usable, so the
    /// fallback is a search rather than a second hard coded list.
    #[test]
    fn an_unusual_linear_format_is_still_taken() {
        let offered = [
            wgpu::TextureFormat::Bgra8UnormSrgb,
            wgpu::TextureFormat::Rgb10a2Unorm,
        ];
        assert_eq!(
            pick_format(&offered),
            Some(wgpu::TextureFormat::Rgb10a2Unorm)
        );
    }
}
