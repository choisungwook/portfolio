//! Drawing one output frame from a stack of decoded source frames.
//!
//! Takes RGBA in, gives RGBA out, and knows nothing about files or ffmpeg. That
//! is what lets it be tested headless: a software Vulkan device draws the same
//! frames a real GPU would, so the composite can be asserted pixel by pixel on
//! a machine with no graphics hardware.
//!
//! The geometry is not decided here. It comes from `makevideo_render::layout`,
//! which the decoder command reads too, so the picture the preview draws and
//! the picture the render encodes are placed by the same arithmetic.

pub mod pipeline;

use makevideo_render::layout::Rect;
use std::borrow::Cow;
use wgpu::util::DeviceExt;

/// A decoded source frame, already scaled to the size it will be drawn at.
pub struct Source<'a> {
    pub rgba: &'a [u8],
    pub width: u32,
    pub height: u32,
}

/// Where that frame goes and how much of it shows.
#[derive(Debug, Clone, Copy)]
pub struct Placement {
    pub dst: Rect,
    pub opacity: f32,
}

/// Uniform block, laid out to match `composite.wgsl`.
#[repr(C)]
#[derive(Clone, Copy)]
struct LayerUniform {
    rect: [f32; 4],
    frame: [f32; 2],
    opacity: f32,
    _pad: f32,
}

impl LayerUniform {
    fn bytes(&self) -> &[u8] {
        // Plain old data with no padding beyond what is declared above.
        unsafe {
            std::slice::from_raw_parts(
                (self as *const LayerUniform) as *const u8,
                std::mem::size_of::<LayerUniform>(),
            )
        }
    }
}

pub struct Compositor {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    adapter: String,
}

/// Every copy out of a texture has its rows padded to this, so the readback
/// has to strip the padding rather than assume width times four.
const ROW_ALIGN: u32 = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;

impl Compositor {
    /// Picks whatever device this machine has: Metal on a Mac, and a software
    /// rasteriser on a machine with no GPU, which is how the tests run.
    pub fn new() -> Result<Compositor, String> {
        let instance = wgpu::Instance::default();
        let adapter =
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
                .map_err(|error| format!("no graphics adapter: {error}"))?;
        let name = adapter.get_info().name;
        let (device, queue) =
            pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
                .map_err(|error| format!("cannot open {name}: {error}"))?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("composite"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("composite.wgsl"))),
        });

        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("layer"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("composite"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("composite"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                // Unorm rather than a sRGB format: ffmpeg hands over encoded
                // values and blends in that domain, so converting here would
                // make the composite disagree with the fallback filter graph
                // for no benefit.
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("source"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });

        Ok(Compositor {
            device,
            queue,
            pipeline,
            layout,
            sampler,
            adapter: name,
        })
    }

    /// What actually drew the frame, for the About box and for a bug report
    /// that says the picture is wrong.
    pub fn adapter(&self) -> &str {
        &self.adapter
    }

    /// Draw the layers onto black, bottom of the slice first, and hand back
    /// RGBA8 rows with no padding.
    pub fn compose(
        &self,
        width: u32,
        height: u32,
        layers: &[(Source<'_>, Placement)],
    ) -> Result<Vec<u8>, String> {
        if width == 0 || height == 0 {
            return Err("the output frame has no size".into());
        }
        let target = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("frame"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = target.create_view(&wgpu::TextureViewDescriptor::default());

        // Bind groups have to outlive the render pass, so they are all built
        // before it opens.
        let mut bindings = Vec::with_capacity(layers.len());
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
            let texture = self.device.create_texture_with_data(
                &self.queue,
                &wgpu::TextureDescriptor {
                    label: Some("source"),
                    size: wgpu::Extent3d {
                        width: source.width,
                        height: source.height,
                        depth_or_array_layers: 1,
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING,
                    view_formats: &[],
                },
                wgpu::util::TextureDataOrder::LayerMajor,
                &source.rgba[..expected],
            );
            let uniform = LayerUniform {
                rect: [
                    placement.dst.x as f32,
                    placement.dst.y as f32,
                    placement.dst.w as f32,
                    placement.dst.h as f32,
                ],
                frame: [width as f32, height as f32],
                opacity: placement.opacity.clamp(0.0, 1.0),
                _pad: 0.0,
            };
            let buffer = self
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("layer"),
                    contents: uniform.bytes(),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
            let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            bindings.push(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("layer"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(&texture_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                ],
            }));
        }

        let padded_row = ((width * 4).div_ceil(ROW_ALIGN)) * ROW_ALIGN;
        let readback = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: (padded_row as u64) * (height as u64),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("composite"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        // Opaque black, the same base the filter graph starts
                        // from, so a frame with nothing on it matches.
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            for binding in &bindings {
                pass.set_bind_group(0, binding, &[]);
                pass.draw(0..6, 0..1);
            }
        }
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &target,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit(Some(encoder.finish()));

        let slice = readback.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|error| format!("the device stopped: {error}"))?;
        receiver
            .recv()
            .map_err(|error| format!("the readback never finished: {error}"))?
            .map_err(|error| format!("cannot read the frame back: {error}"))?;

        let mapped = slice
            .get_mapped_range()
            .map_err(|error| format!("cannot map the frame: {error}"))?;
        let row = (width * 4) as usize;
        let mut pixels = Vec::with_capacity(row * height as usize);
        for y in 0..height as usize {
            let start = y * padded_row as usize;
            pixels.extend_from_slice(&mapped[start..start + row]);
        }
        drop(mapped);
        readback.unmap();
        Ok(pixels)
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

    /// Fails loudly rather than skipping. A compositor nobody ran is worse than
    /// no compositor; CI installs a software Vulkan device for exactly this.
    fn compositor() -> Compositor {
        Compositor::new().expect("no graphics adapter, install mesa-vulkan-drivers")
    }

    #[test]
    fn an_empty_frame_is_opaque_black() {
        let frame = compositor().compose(64, 32, &[]).unwrap();
        assert_eq!(frame.len(), 64 * 32 * 4);
        assert_eq!(pixel(&frame, 64, 0, 0), [0, 0, 0, 255]);
        assert_eq!(pixel(&frame, 64, 63, 31), [0, 0, 0, 255]);
    }

    #[test]
    fn a_full_frame_layer_covers_everything() {
        let red = solid(16, 16, [255, 0, 0, 255]);
        let frame = compositor()
            .compose(
                16,
                16,
                &[(
                    Source {
                        rgba: &red,
                        width: 16,
                        height: 16,
                    },
                    Placement {
                        dst: Rect {
                            x: 0,
                            y: 0,
                            w: 16,
                            h: 16,
                        },
                        opacity: 1.0,
                    },
                )],
            )
            .unwrap();
        assert_eq!(pixel(&frame, 16, 0, 0), [255, 0, 0, 255]);
        assert_eq!(pixel(&frame, 16, 15, 15), [255, 0, 0, 255]);
    }

    /// The case the ffmpeg render was checked against pixel by pixel: a 4:3
    /// clip over a 16:9 one shows through at the sides rather than painting
    /// black bars over it.
    #[test]
    fn a_pillarboxed_layer_lets_the_one_underneath_show_at_the_sides() {
        let compositor = compositor();
        let (width, height) = (160u32, 90u32);
        let bottom = fit_rect(160, 90, width, height);
        let top = fit_rect(4, 3, width, height);
        let red = solid(bottom.w, bottom.h, [255, 0, 0, 255]);
        let green = solid(top.w, top.h, [0, 128, 0, 255]);

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
                        },
                        Placement {
                            dst: bottom,
                            opacity: 1.0,
                        },
                    ),
                    (
                        Source {
                            rgba: &green,
                            width: top.w,
                            height: top.h,
                        },
                        Placement {
                            dst: top,
                            opacity: 1.0,
                        },
                    ),
                ],
            )
            .unwrap();

        assert_eq!(top.x, 20, "the 4:3 layer is 120 wide, centred");
        assert_eq!(
            pixel(&frame, width, 80, 45),
            [0, 128, 0, 255],
            "middle is the top layer"
        );
        assert_eq!(
            pixel(&frame, width, 2, 45),
            [255, 0, 0, 255],
            "the side shows through"
        );
        assert_eq!(pixel(&frame, width, 157, 45), [255, 0, 0, 255]);
    }

    #[test]
    fn the_last_layer_is_on_top() {
        let compositor = compositor();
        let red = solid(8, 8, [255, 0, 0, 255]);
        let green = solid(8, 8, [0, 255, 0, 255]);
        let full = Rect {
            x: 0,
            y: 0,
            w: 8,
            h: 8,
        };
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
                        },
                        Placement {
                            dst: full,
                            opacity: 1.0,
                        },
                    ),
                    (
                        Source {
                            rgba: &green,
                            width: 8,
                            height: 8,
                        },
                        Placement {
                            dst: full,
                            opacity: 1.0,
                        },
                    ),
                ],
            )
            .unwrap();
        assert_eq!(pixel(&frame, 8, 4, 4), [0, 255, 0, 255]);
    }

    #[test]
    fn half_opacity_mixes_with_what_is_under_it() {
        let compositor = compositor();
        let red = solid(8, 8, [255, 0, 0, 255]);
        let white = solid(8, 8, [255, 255, 255, 255]);
        let full = Rect {
            x: 0,
            y: 0,
            w: 8,
            h: 8,
        };
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
                        },
                        Placement {
                            dst: full,
                            opacity: 1.0,
                        },
                    ),
                    (
                        Source {
                            rgba: &white,
                            width: 8,
                            height: 8,
                        },
                        Placement {
                            dst: full,
                            opacity: 0.5,
                        },
                    ),
                ],
            )
            .unwrap();
        let [r, g, b, a] = pixel(&frame, 8, 4, 4);
        assert_eq!(r, 255);
        assert!(
            (120..=136).contains(&g),
            "green was {g}, expected about half"
        );
        assert!((120..=136).contains(&b), "blue was {b}");
        assert_eq!(a, 255, "the frame stays opaque");
    }

    #[test]
    fn a_layer_placed_off_centre_lands_where_it_was_told() {
        let compositor = compositor();
        let blue = solid(4, 4, [0, 0, 255, 255]);
        let frame = compositor
            .compose(
                16,
                16,
                &[(
                    Source {
                        rgba: &blue,
                        width: 4,
                        height: 4,
                    },
                    Placement {
                        dst: Rect {
                            x: 8,
                            y: 8,
                            w: 4,
                            h: 4,
                        },
                        opacity: 1.0,
                    },
                )],
            )
            .unwrap();
        assert_eq!(pixel(&frame, 16, 9, 9), [0, 0, 255, 255], "inside the rect");
        assert_eq!(
            pixel(&frame, 16, 4, 4),
            [0, 0, 0, 255],
            "outside it stays black"
        );
        assert_eq!(pixel(&frame, 16, 13, 13), [0, 0, 0, 255]);
    }

    #[test]
    fn a_short_source_buffer_is_refused_rather_than_read_past() {
        let compositor = compositor();
        let tiny = vec![0u8; 8];
        let result = compositor.compose(
            8,
            8,
            &[(
                Source {
                    rgba: &tiny,
                    width: 8,
                    height: 8,
                },
                Placement {
                    dst: Rect {
                        x: 0,
                        y: 0,
                        w: 8,
                        h: 8,
                    },
                    opacity: 1.0,
                },
            )],
        );
        assert!(result.is_err(), "a truncated frame must not be drawn");
    }

    #[test]
    fn readback_strips_the_row_padding() {
        // 3 pixels is 12 bytes a row, which the copy pads to 256. Getting this
        // wrong shifts every row and skews the picture.
        let frame = compositor().compose(3, 2, &[]).unwrap();
        assert_eq!(frame.len(), 3 * 2 * 4);
    }
}
