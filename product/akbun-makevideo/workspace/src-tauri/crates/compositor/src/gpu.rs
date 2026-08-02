//! The wgpu half of the compositor, behind the `gpu` feature.
//!
//! `composite.wgsl` next to this file is the reference: `cpu.rs` mirrors what
//! it does, and there is a test asserting the two agree. If the shader changes,
//! that test is what catches the other half being left behind.

use crate::{Placement, Source};
use std::borrow::Cow;
use wgpu::util::DeviceExt;

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

pub struct GpuCompositor {
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

impl GpuCompositor {
    /// Picks whatever device this machine has: Metal on a Mac, and a software
    /// rasteriser on a machine with no GPU, which is how the tests run.
    pub fn new() -> Result<GpuCompositor, String> {
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

        Ok(GpuCompositor {
            device,
            queue,
            pipeline,
            layout,
            sampler,
            adapter: name,
        })
    }

    pub fn adapter(&self) -> &str {
        &self.adapter
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
