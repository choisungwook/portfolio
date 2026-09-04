//! Where a frame ends up.
//!
//! Two of them, and the difference is one call. [`OffscreenSink`] draws into a
//! texture it keeps; [`crate::surface::SurfaceSink`] draws into the one the
//! window is about to show and presents it. Everything before that — the
//! scheduling, the decoding, the pipeline, the shader — is the same code on the
//! same device.
//!
//! That is what makes a headless measurement worth something. The soak runs the
//! real path minus the present, so a number from a machine with no window still
//! says whether the timing is right; what it cannot say is anything about
//! vsync, which is the one thing only a window has.

use crate::player::Sink;
use makevideo_compositor::source::Frame;
use makevideo_compositor::{Compositor, Placement, Source};
use std::sync::Arc;

/// Draws the frame and keeps it nowhere in particular.
///
/// On a machine with a graphics device this goes through `draw_onto`, the same
/// call the swapchain path makes, into a texture made once and reused. The
/// device is then waited on, so the time a frame took is the time it took to
/// draw rather than the time it took to queue.
///
/// With no graphics device it falls back to `Compositor::compose`, which is the
/// software compositor and a readback that is not otherwise needed. Slower and
/// still the same picture, which is the same trade the whole crate makes there.
pub struct OffscreenSink {
    compositor: Arc<Compositor>,
    width: u32,
    height: u32,
    #[cfg(feature = "gpu")]
    target: Option<GpuTarget>,
}

#[cfg(feature = "gpu")]
struct GpuTarget {
    view: wgpu::TextureView,
    pipelines: makevideo_compositor::gpu::Pipelines,
    /// Held because dropping the texture would take the view with it.
    _texture: wgpu::Texture,
}

impl OffscreenSink {
    pub fn new(compositor: Arc<Compositor>, width: u32, height: u32) -> OffscreenSink {
        #[cfg(feature = "gpu")]
        let target = compositor.gpu().map(|gpu| {
            let texture = gpu.device().create_texture(&wgpu::TextureDescriptor {
                label: Some("offscreen monitor"),
                size: wgpu::Extent3d {
                    width: width.max(1),
                    height: height.max(1),
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: makevideo_compositor::gpu::FRAME_FORMAT,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            GpuTarget {
                view: texture.create_view(&wgpu::TextureViewDescriptor::default()),
                pipelines: gpu.pipelines_for(makevideo_compositor::gpu::FRAME_FORMAT),
                _texture: texture,
            }
        });
        OffscreenSink {
            compositor,
            width,
            height,
            #[cfg(feature = "gpu")]
            target,
        }
    }

    fn draw(&mut self, layers: &[(Source<'_>, Placement)]) -> Result<(), String> {
        #[cfg(feature = "gpu")]
        if let (Some(gpu), Some(target)) = (self.compositor.gpu(), self.target.as_ref()) {
            gpu.draw_onto(
                &target.view,
                &target.pipelines,
                self.width,
                self.height,
                layers,
            )?;
            return gpu.wait();
        }
        self.compositor
            .compose(self.width, self.height, layers)
            .map(|_| ())
    }
}

impl Sink for OffscreenSink {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        let layers = frame.sources();
        self.draw(&layers)
    }

    fn clear(&mut self) -> Result<(), String> {
        self.draw(&[])
    }
}

/// Counts and draws nothing. For tests about timing, where compositing would
/// only add noise.
#[derive(Debug, Default)]
pub struct CountingSink {
    pub shown: u64,
    pub cleared: u64,
}

impl Sink for CountingSink {
    fn show(&mut self, _frame: &Frame) -> Result<(), String> {
        self.shown += 1;
        Ok(())
    }

    fn clear(&mut self) -> Result<(), String> {
        self.cleared += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_compositor::Backend;

    /// Whichever backend this machine has, a frame has to reach it without an
    /// error. On a runner with lavapipe that is the `draw_onto` path the
    /// swapchain uses; with no adapter at all it is the software one.
    #[test]
    fn an_offscreen_sink_draws_an_empty_frame_on_whatever_is_here() {
        let compositor = Arc::new(Compositor::new());
        let mut sink = OffscreenSink::new(Arc::clone(&compositor), 64, 32);
        assert_eq!(sink.clear(), Ok(()));
        assert_eq!(sink.clear(), Ok(()), "and the target is reusable");
    }

    #[test]
    fn the_software_compositor_is_also_a_sink() {
        let compositor = Arc::new(Compositor::with_backend(Backend::Cpu).unwrap());
        let mut sink = OffscreenSink::new(compositor, 32, 16);
        assert_eq!(sink.clear(), Ok(()));
    }
}
