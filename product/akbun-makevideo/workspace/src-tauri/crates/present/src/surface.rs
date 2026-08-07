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
use std::sync::Arc;

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
        })
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

    fn gpu(&self) -> Result<&GpuCompositor, String> {
        self.compositor
            .gpu()
            .ok_or_else(|| "the graphics device went away".to_string())
    }

    fn draw(&mut self, layers: &[(Source<'_>, Placement)]) -> Result<(), String> {
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
                    other => return Err(format!("the monitor surface is gone: {other:?}")),
                }
            }
            // Minimised, behind another window, or the compositor was busy.
            // There is nowhere to draw and nothing is wrong: the frame is over
            // and playback goes on. Reporting a failure here would fill the
            // error log every time somebody minimised the app.
            wgpu::CurrentSurfaceTexture::Occluded | wgpu::CurrentSurfaceTexture::Timeout => {
                return Ok(())
            }
            other => return Err(format!("cannot draw the monitor: {other:?}")),
        };
        let view = texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        gpu.draw_onto(&view, &self.pipeline, self.width, self.height, layers)?;
        gpu.queue().present(texture);
        Ok(())
    }
}

impl Sink for SurfaceSink {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        let layers = frame.sources();
        self.draw(&layers)
    }

    fn clear(&mut self) -> Result<(), String> {
        self.draw(&[])
    }
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
