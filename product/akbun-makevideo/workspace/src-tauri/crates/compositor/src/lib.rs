//! Drawing one output frame from a stack of decoded source frames.
//!
//! Takes RGBA in, gives RGBA out, and knows nothing about files or ffmpeg. That
//! is what lets it be tested: the same frames can be asserted pixel by pixel on
//! a machine with a GPU, on one with only a software Vulkan device, and on one
//! with no graphics stack at all.
//!
//! There are two backends and they draw the same picture:
//!
//! | Backend | Needs | Used when |
//! |---|---|---|
//! | gpu | the `gpu` feature and a graphics adapter | by default, when one is there |
//! | cpu | nothing | no adapter, the feature off, or asked for |
//!
//! wgpu is an optional dependency. `--no-default-features` builds a compositor
//! that never mentions it, which is the shape a machine with no graphics stack
//! wants and is also how the CPU path is proved to stand on its own.
//!
//! The geometry is not decided here. It comes from `makevideo_render::layout`,
//! which the decoder command reads too, so the picture the preview draws and
//! the picture the render encodes are placed by the same arithmetic.
//!
//! Getting the frames is `source`, and whether they arrive fast enough is
//! `supply`. Both are next door rather than in here because drawing a frame and
//! having a frame to draw are separate problems that look the same on screen.

pub mod cpu;
#[cfg(feature = "gpu")]
pub mod gpu;
pub mod lut;
pub mod pipeline;
pub mod source;
pub mod supply;
pub mod text;

use makevideo_render::{layout::Rect, BlendMode};

/// A decoded source frame, already scaled to the size it will be drawn at.
pub struct Source<'a> {
    pub rgba: &'a [u8],
    pub width: u32,
    pub height: u32,
    pub lut: Option<&'a lut::Lut>,
}

/// Where that frame goes and how much of it shows.
#[derive(Debug, Clone, Copy)]
pub struct Placement {
    pub dst: Rect,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub adjustment: bool,
}

/// Which half does the drawing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// A graphics adapter through wgpu, falling back to the CPU when there is
    /// none. This is the default.
    Auto,
    /// Refuse rather than fall back, so a caller that means it finds out.
    Gpu,
    /// Never touch a graphics device.
    Cpu,
}

impl Backend {
    pub fn parse(name: &str) -> Backend {
        match name {
            "cpu" => Backend::Cpu,
            "gpu" => Backend::Gpu,
            _ => Backend::Auto,
        }
    }
}

enum Inner {
    #[cfg(feature = "gpu")]
    Gpu(gpu::GpuCompositor),
    Cpu(cpu::CpuCompositor),
}

pub struct Compositor {
    inner: Inner,
}

impl Compositor {
    /// A graphics device if there is one, the CPU otherwise. Never fails, so
    /// the app always has something to draw with.
    pub fn new() -> Compositor {
        Compositor::with_backend(Backend::Auto).unwrap_or_else(|_| Compositor {
            inner: Inner::Cpu(cpu::CpuCompositor::new()),
        })
    }

    pub fn with_backend(backend: Backend) -> Result<Compositor, String> {
        Compositor::with_device(backend, None)
    }

    /// As `with_backend`, on a named adapter. `None` is whatever wgpu picks,
    /// and so is a name this machine does not have — see
    /// [`gpu::GpuCompositor::with_device`].
    pub fn with_device(backend: Backend, device: Option<&str>) -> Result<Compositor, String> {
        let _ = device;
        match backend {
            Backend::Cpu => Ok(Compositor {
                inner: Inner::Cpu(cpu::CpuCompositor::new()),
            }),
            #[cfg(feature = "gpu")]
            Backend::Gpu => gpu::GpuCompositor::with_device(device).map(|gpu| Compositor {
                inner: Inner::Gpu(gpu),
            }),
            #[cfg(not(feature = "gpu"))]
            Backend::Gpu => Err("this build has no gpu support compiled in".into()),
            #[cfg(feature = "gpu")]
            Backend::Auto => Ok(match gpu::GpuCompositor::with_device(device) {
                Ok(gpu) => Compositor {
                    inner: Inner::Gpu(gpu),
                },
                Err(_) => Compositor {
                    inner: Inner::Cpu(cpu::CpuCompositor::new()),
                },
            }),
            #[cfg(not(feature = "gpu"))]
            Backend::Auto => Ok(Compositor {
                inner: Inner::Cpu(cpu::CpuCompositor::new()),
            }),
        }
    }

    /// Whether a graphics device is actually doing the work.
    pub fn is_gpu(&self) -> bool {
        match &self.inner {
            #[cfg(feature = "gpu")]
            Inner::Gpu(_) => true,
            Inner::Cpu(_) => false,
        }
    }

    /// The graphics device behind this compositor, when there is one.
    ///
    /// The viewport needs it because a surface belongs to the device that will
    /// draw into it: opening a second one would put the picture on screen and
    /// the picture in the file on two devices. `None` is the software
    /// compositor, and it is why a machine with no graphics adapter falls back
    /// to the media elements rather than showing nothing.
    #[cfg(feature = "gpu")]
    pub fn gpu(&self) -> Option<&gpu::GpuCompositor> {
        match &self.inner {
            Inner::Gpu(gpu) => Some(gpu),
            Inner::Cpu(_) => None,
        }
    }

    /// What drew the frame, for the About box and for a bug report that says
    /// the picture is wrong.
    pub fn adapter(&self) -> &str {
        match &self.inner {
            #[cfg(feature = "gpu")]
            Inner::Gpu(gpu) => gpu.adapter(),
            Inner::Cpu(cpu) => cpu.adapter(),
        }
    }

    /// Draw the layers onto black, bottom of the slice first, and hand back
    /// RGBA8 rows with no padding.
    pub fn compose(
        &self,
        width: u32,
        height: u32,
        layers: &[(Source<'_>, Placement)],
    ) -> Result<Vec<u8>, String> {
        match &self.inner {
            #[cfg(feature = "gpu")]
            Inner::Gpu(gpu) => gpu.compose(width, height, layers),
            Inner::Cpu(cpu) => cpu.compose(width, height, layers),
        }
    }
}

impl Default for Compositor {
    fn default() -> Self {
        Compositor::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_render::layout::fit_rect;

    fn solid(width: u32, height: u32, colour: [u8; 4]) -> Vec<u8> {
        colour
            .iter()
            .cycle()
            .take((width * height * 4) as usize)
            .copied()
            .collect()
    }

    fn pixel(frame: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let index = ((y * width + x) * 4) as usize;
        [
            frame[index],
            frame[index + 1],
            frame[index + 2],
            frame[index + 3],
        ]
    }

    fn full(size: u32) -> Rect {
        Rect {
            x: 0,
            y: 0,
            w: size,
            h: size,
        }
    }

    /// Every drawing test runs on both halves. The CPU one is always there; the
    /// GPU one fails loudly rather than skipping when the feature is on,
    /// because CI installs a software Vulkan device for exactly this.
    fn backends() -> Vec<(&'static str, Compositor)> {
        let all: Vec<(&'static str, Compositor)> =
            vec![("cpu", Compositor::with_backend(Backend::Cpu).unwrap())];
        #[cfg(feature = "gpu")]
        let all = {
            let mut all = all;
            all.push((
                "gpu",
                Compositor::with_backend(Backend::Gpu)
                    .expect("no graphics adapter, install mesa-vulkan-drivers"),
            ));
            all
        };
        all
    }

    #[test]
    fn an_empty_frame_is_opaque_black() {
        for (name, compositor) in backends() {
            let frame = compositor.compose(64, 32, &[]).unwrap();
            assert_eq!(frame.len(), 64 * 32 * 4, "{name}");
            assert_eq!(pixel(&frame, 64, 0, 0), [0, 0, 0, 255], "{name}");
            assert_eq!(pixel(&frame, 64, 63, 31), [0, 0, 0, 255], "{name}");
        }
    }

    #[test]
    fn a_full_frame_layer_covers_everything() {
        let red = solid(16, 16, [255, 0, 0, 255]);
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    16,
                    16,
                    &[(
                        Source {
                            rgba: &red,
                            width: 16,
                            height: 16,
                            lut: None,
                        },
                        Placement {
                            dst: full(16),
                            opacity: 1.0,
                            blend_mode: makevideo_render::BlendMode::Normal,
                            adjustment: false,
                        },
                    )],
                )
                .unwrap();
            assert_eq!(pixel(&frame, 16, 0, 0), [255, 0, 0, 255], "{name}");
            assert_eq!(pixel(&frame, 16, 15, 15), [255, 0, 0, 255], "{name}");
        }
    }

    #[test]
    fn a_lut_changes_the_source_before_both_backends_blend_it() {
        let source = solid(1, 1, [128, 64, 192, 255]);
        let lut = lut::Lut::from_cube(
            "LUT_3D_SIZE 2\n0.1 0.2 0.3\n0.4 0.2 0.3\n0.1 0.6 0.3\n0.4 0.6 0.3\n0.1 0.2 0.9\n0.4 0.2 0.9\n0.1 0.6 0.9\n0.4 0.6 0.9\n",
        )
        .unwrap();
        let mut frames = Vec::new();
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    1,
                    1,
                    &[(
                        Source {
                            rgba: &source,
                            width: 1,
                            height: 1,
                            lut: Some(&lut),
                        },
                        Placement {
                            dst: full(1),
                            opacity: 1.0,
                            blend_mode: makevideo_render::BlendMode::Normal,
                            adjustment: false,
                        },
                    )],
                )
                .unwrap();
            assert_ne!(pixel(&frame, 1, 0, 0), [128, 64, 192, 255], "{name}");
            frames.push((name, frame));
        }
        if frames.len() == 2 {
            assert_eq!(frames[0].1, frames[1].1, "CPU and GPU LUT output");
        }
    }

    /// The case the ffmpeg render was checked against pixel by pixel: a 4:3
    /// clip over a 16:9 one shows through at the sides rather than painting
    /// black bars over it.
    #[test]
    fn a_pillarboxed_layer_lets_the_one_underneath_show_at_the_sides() {
        let (width, height) = (160u32, 90u32);
        let bottom = fit_rect(160, 90, width, height);
        let top = fit_rect(4, 3, width, height);
        let red = solid(bottom.w, bottom.h, [255, 0, 0, 255]);
        let green = solid(top.w, top.h, [0, 128, 0, 255]);
        assert_eq!(top.x, 20, "the 4:3 layer is 120 wide, centred");

        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    width,
                    height,
                    &[
                        (
                            Source {
                                rgba: &red,
                                width: bottom.w,
                                height: bottom.h,
                                lut: None,
                            },
                            Placement {
                                dst: bottom,
                                opacity: 1.0,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                        (
                            Source {
                                rgba: &green,
                                width: top.w,
                                height: top.h,
                                lut: None,
                            },
                            Placement {
                                dst: top,
                                opacity: 1.0,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                    ],
                )
                .unwrap();
            assert_eq!(
                pixel(&frame, width, 80, 45),
                [0, 128, 0, 255],
                "{name} middle"
            );
            assert_eq!(pixel(&frame, width, 2, 45), [255, 0, 0, 255], "{name} left");
            assert_eq!(
                pixel(&frame, width, 157, 45),
                [255, 0, 0, 255],
                "{name} right"
            );
        }
    }

    #[test]
    fn the_last_layer_is_on_top() {
        let red = solid(8, 8, [255, 0, 0, 255]);
        let green = solid(8, 8, [0, 255, 0, 255]);
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    8,
                    8,
                    &[
                        (
                            Source {
                                rgba: &red,
                                width: 8,
                                height: 8,
                                lut: None,
                            },
                            Placement {
                                dst: full(8),
                                opacity: 1.0,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                        (
                            Source {
                                rgba: &green,
                                width: 8,
                                height: 8,
                                lut: None,
                            },
                            Placement {
                                dst: full(8),
                                opacity: 1.0,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                    ],
                )
                .unwrap();
            assert_eq!(pixel(&frame, 8, 4, 4), [0, 255, 0, 255], "{name}");
        }
    }

    #[test]
    fn half_opacity_mixes_with_what_is_under_it() {
        let red = solid(8, 8, [255, 0, 0, 255]);
        let white = solid(8, 8, [255, 255, 255, 255]);
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    8,
                    8,
                    &[
                        (
                            Source {
                                rgba: &red,
                                width: 8,
                                height: 8,
                                lut: None,
                            },
                            Placement {
                                dst: full(8),
                                opacity: 1.0,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                        (
                            Source {
                                rgba: &white,
                                width: 8,
                                height: 8,
                                lut: None,
                            },
                            Placement {
                                dst: full(8),
                                opacity: 0.5,
                                blend_mode: makevideo_render::BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                    ],
                )
                .unwrap();
            let [r, g, b, a] = pixel(&frame, 8, 4, 4);
            assert_eq!(r, 255, "{name}");
            assert!((120..=136).contains(&g), "{name}: green was {g}");
            assert!((120..=136).contains(&b), "{name}: blue was {b}");
            assert_eq!(a, 255, "{name}: the frame stays opaque");
        }
    }

    #[test]
    fn multiply_and_screen_match_on_both_backends() {
        let bottom = solid(1, 1, [100, 200, 50, 255]);
        let top = solid(1, 1, [128, 128, 128, 255]);
        for (mode, expected) in [
            (BlendMode::Multiply, [50, 100, 25, 255]),
            (BlendMode::Screen, [178, 228, 153, 255]),
        ] {
            for (name, compositor) in backends() {
                let frame = compositor
                    .compose(
                        1,
                        1,
                        &[
                            (
                                Source {
                                    rgba: &bottom,
                                    width: 1,
                                    height: 1,
                                    lut: None,
                                },
                                Placement {
                                    dst: full(1),
                                    opacity: 1.0,
                                    blend_mode: BlendMode::Normal,
                                    adjustment: false,
                                },
                            ),
                            (
                                Source {
                                    rgba: &top,
                                    width: 1,
                                    height: 1,
                                    lut: None,
                                },
                                Placement {
                                    dst: full(1),
                                    opacity: 1.0,
                                    blend_mode: mode,
                                    adjustment: false,
                                },
                            ),
                        ],
                    )
                    .unwrap();
                assert_eq!(pixel(&frame, 1, 0, 0), expected, "{name} {mode:?}");
            }
        }
    }

    #[test]
    fn an_adjustment_lut_changes_the_composite_below_it() {
        let source = solid(1, 1, [128, 64, 192, 255]);
        let lut = lut::Lut::from_cube(
            "LUT_3D_SIZE 2\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n",
        )
        .unwrap();
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    1,
                    1,
                    &[
                        (
                            Source {
                                rgba: &source,
                                width: 1,
                                height: 1,
                                lut: None,
                            },
                            Placement {
                                dst: full(1),
                                opacity: 1.0,
                                blend_mode: BlendMode::Normal,
                                adjustment: false,
                            },
                        ),
                        (
                            Source {
                                rgba: &[],
                                width: 0,
                                height: 0,
                                lut: Some(&lut),
                            },
                            Placement {
                                dst: full(1),
                                opacity: 1.0,
                                blend_mode: BlendMode::Normal,
                                adjustment: true,
                            },
                        ),
                    ],
                )
                .unwrap();
            assert_eq!(pixel(&frame, 1, 0, 0), [0, 0, 0, 255], "{name}");
        }
    }

    #[test]
    fn a_layer_placed_off_centre_lands_where_it_was_told() {
        let blue = solid(4, 4, [0, 0, 255, 255]);
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    16,
                    16,
                    &[(
                        Source {
                            rgba: &blue,
                            width: 4,
                            height: 4,
                            lut: None,
                        },
                        Placement {
                            dst: Rect {
                                x: 8,
                                y: 8,
                                w: 4,
                                h: 4,
                            },
                            opacity: 1.0,
                            blend_mode: makevideo_render::BlendMode::Normal,
                            adjustment: false,
                        },
                    )],
                )
                .unwrap();
            assert_eq!(pixel(&frame, 16, 9, 9), [0, 0, 255, 255], "{name} inside");
            assert_eq!(pixel(&frame, 16, 4, 4), [0, 0, 0, 255], "{name} outside");
            assert_eq!(pixel(&frame, 16, 13, 13), [0, 0, 0, 255], "{name} outside");
        }
    }

    #[test]
    fn a_short_source_buffer_is_refused_rather_than_read_past() {
        let tiny = vec![0u8; 8];
        for (name, compositor) in backends() {
            let result = compositor.compose(
                8,
                8,
                &[(
                    Source {
                        rgba: &tiny,
                        width: 8,
                        height: 8,
                        lut: None,
                    },
                    Placement {
                        dst: full(8),
                        opacity: 1.0,
                        blend_mode: makevideo_render::BlendMode::Normal,
                        adjustment: false,
                    },
                )],
            );
            assert!(
                result.is_err(),
                "{name}: a truncated frame must not be drawn"
            );
        }
    }

    #[test]
    fn readback_strips_the_row_padding() {
        // 3 pixels is 12 bytes a row, which a texture copy pads to 256. Getting
        // this wrong shifts every row and skews the picture.
        for (name, compositor) in backends() {
            let frame = compositor.compose(3, 2, &[]).unwrap();
            assert_eq!(frame.len(), 3 * 2 * 4, "{name}");
        }
    }

    #[test]
    fn a_layer_hanging_off_the_edge_draws_the_part_that_fits() {
        let red = solid(8, 8, [255, 0, 0, 255]);
        for (name, compositor) in backends() {
            let frame = compositor
                .compose(
                    8,
                    8,
                    &[(
                        Source {
                            rgba: &red,
                            width: 8,
                            height: 8,
                            lut: None,
                        },
                        Placement {
                            dst: Rect {
                                x: -4,
                                y: -4,
                                w: 8,
                                h: 8,
                            },
                            opacity: 1.0,
                            blend_mode: makevideo_render::BlendMode::Normal,
                            adjustment: false,
                        },
                    )],
                )
                .unwrap();
            assert_eq!(
                pixel(&frame, 8, 1, 1),
                [255, 0, 0, 255],
                "{name} the visible half"
            );
            assert_eq!(
                pixel(&frame, 8, 6, 6),
                [0, 0, 0, 255],
                "{name} the rest is base"
            );
        }
    }

    /// The claim that makes the CPU backend usable rather than a placeholder:
    /// it draws what the shader draws. If `composite.wgsl` changes and `cpu.rs`
    /// is left behind, this is what fails.
    #[cfg(feature = "gpu")]
    #[test]
    fn both_backends_draw_the_same_frame() {
        let (width, height) = (120u32, 68u32);
        let bottom = fit_rect(16, 9, width, height);
        let top = fit_rect(4, 3, width, height);
        let small = fit_rect(1, 1, width, height);
        let red = solid(bottom.w, bottom.h, [220, 30, 40, 255]);
        let green = solid(top.w, top.h, [20, 180, 90, 255]);
        let blue = solid(small.w, small.h, [40, 60, 240, 255]);

        let layers = || {
            vec![
                (
                    Source {
                        rgba: &red,
                        width: bottom.w,
                        height: bottom.h,
                        lut: None,
                    },
                    Placement {
                        dst: bottom,
                        opacity: 1.0,
                        blend_mode: makevideo_render::BlendMode::Normal,
                        adjustment: false,
                    },
                ),
                (
                    Source {
                        rgba: &green,
                        width: top.w,
                        height: top.h,
                        lut: None,
                    },
                    Placement {
                        dst: top,
                        opacity: 0.65,
                        blend_mode: makevideo_render::BlendMode::Normal,
                        adjustment: false,
                    },
                ),
                (
                    Source {
                        rgba: &blue,
                        width: small.w,
                        height: small.h,
                        lut: None,
                    },
                    Placement {
                        dst: small,
                        opacity: 0.5,
                        blend_mode: makevideo_render::BlendMode::Normal,
                        adjustment: false,
                    },
                ),
            ]
        };

        let on_cpu = Compositor::with_backend(Backend::Cpu)
            .unwrap()
            .compose(width, height, &layers())
            .unwrap();
        let on_gpu = Compositor::with_backend(Backend::Gpu)
            .expect("no graphics adapter, install mesa-vulkan-drivers")
            .compose(width, height, &layers())
            .unwrap();
        assert_eq!(on_cpu.len(), on_gpu.len());

        // A unorm8 target rounds, and a GPU is allowed to round the last bit
        // differently, so one step apart is agreement and two is a bug.
        let worst = on_cpu
            .iter()
            .zip(on_gpu.iter())
            .map(|(a, b)| (*a as i32 - *b as i32).abs())
            .max()
            .unwrap_or(0);
        assert!(
            worst <= 1,
            "the two backends differ by {worst} on some channel"
        );
    }

    #[test]
    fn the_default_compositor_always_exists() {
        // Whatever the machine has, something draws. This is the promise that
        // lets the app stop treating "no GPU" as a failure.
        let compositor = Compositor::new();
        assert!(!compositor.adapter().is_empty());
        assert_eq!(compositor.compose(4, 4, &[]).unwrap().len(), 4 * 4 * 4);
    }

    #[cfg(not(feature = "gpu"))]
    #[test]
    fn without_the_feature_there_is_no_gpu_to_ask_for() {
        assert!(Compositor::with_backend(Backend::Gpu).is_err());
        assert!(!Compositor::new().is_gpu());
    }
}
