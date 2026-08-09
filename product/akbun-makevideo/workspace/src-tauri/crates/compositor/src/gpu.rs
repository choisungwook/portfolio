//! The wgpu half of the compositor, behind the `gpu` feature.
//!
//! `composite.wgsl` next to this file is the reference: `cpu.rs` mirrors what
//! it does, and there is a test asserting the two agree. If the shader changes,
//! that test is what catches the other half being left behind.

use crate::{lut::Lut, Placement, Source};
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Mutex;
use wgpu::util::DeviceExt;

/// Uniform block, laid out to match `composite.wgsl`.
#[repr(C)]
#[derive(Clone, Copy)]
struct LayerUniform {
    rect: [f32; 4],
    frame: [f32; 2],
    opacity: f32,
    lut_size: f32,
    domain_min: [f32; 4],
    domain_max: [f32; 4],
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
    /// Kept rather than dropped after `new`, because a surface can only be made
    /// from the instance that made the adapter this device came from. The
    /// viewport asks for one at a point where opening a second device would
    /// mean the picture on screen and the picture in the file were drawn by two
    /// different ones.
    instance: wgpu::Instance,
    /// Kept for the same reason as the instance: asking a surface what formats
    /// it offers is a question about the adapter that will draw on it.
    adapter_handle: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    shader: wgpu::ShaderModule,
    pipeline_layout: wgpu::PipelineLayout,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    identity_lut: Lut,
    lut_textures: Mutex<HashMap<LutKey, wgpu::Texture>>,
    adapter: String,
}

/// Every copy out of a texture has its rows padded to this, so the readback
/// has to strip the padding rather than assume width times four.
const ROW_ALIGN: u32 = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;

/// What the offscreen path draws into.
///
/// Unorm rather than sRGB: ffmpeg hands over encoded values and blends in that
/// domain, so converting here would make the composite disagree with the
/// fallback filter graph for no benefit. A surface has to be asked for the same
/// thing, which is what `Surface` picks its format for.
pub const FRAME_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const LUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba32Float;

#[derive(Eq, Hash, PartialEq)]
struct LutKey {
    size: u32,
    domain_min: [u32; 3],
    domain_max: [u32; 3],
    values: Vec<u8>,
}

impl From<&Lut> for LutKey {
    fn from(lut: &Lut) -> LutKey {
        LutKey {
            size: lut.size(),
            domain_min: lut.domain_min().map(f32::to_bits),
            domain_max: lut.domain_max().map(f32::to_bits),
            values: lut.texture_bytes().to_vec(),
        }
    }
}

/// One graphics adapter this machine offers, for the settings list.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Device {
    /// What the driver calls it. This is also the key the setting stores, so
    /// two identical cards are one entry and either of them will do.
    pub name: String,
    /// "DiscreteGpu", "IntegratedGpu", "Cpu" — what kind of thing it is.
    pub kind: String,
    /// Metal, Vulkan, Dx12. Two entries with the same name and different
    /// backends are the same card reached two ways.
    pub backend: String,
}

/// Every adapter wgpu can see. Empty on a machine with no graphics stack,
/// which is the same answer as "there is nothing to choose from".
pub fn devices() -> Vec<Device> {
    pollster::block_on(wgpu::Instance::default().enumerate_adapters(wgpu::Backends::all()))
        .into_iter()
        .map(|adapter| {
            let info = adapter.get_info();
            Device {
                name: info.name,
                kind: format!("{:?}", info.device_type),
                backend: format!("{:?}", info.backend),
            }
        })
        .collect()
}

impl GpuCompositor {
    /// Picks whatever device this machine has: Metal on a Mac, and a software
    /// rasteriser on a machine with no GPU, which is how the tests run.
    pub fn new() -> Result<GpuCompositor, String> {
        GpuCompositor::with_device(None)
    }

    /// The named adapter, or whatever wgpu would have picked.
    ///
    /// A name that is not there falls back rather than failing: a settings file
    /// travels between machines, and refusing to draw because last week's
    /// eGPU is unplugged would be worse than drawing on the one that is.
    pub fn with_device(wanted: Option<&str>) -> Result<GpuCompositor, String> {
        let instance = wgpu::Instance::default();
        let named = wanted.and_then(|wanted| {
            pollster::block_on(instance.enumerate_adapters(wgpu::Backends::all()))
                .into_iter()
                .find(|adapter| adapter.get_info().name == wanted)
        });
        let adapter = match named {
            Some(adapter) => adapter,
            None => pollster::block_on(
                instance.request_adapter(&wgpu::RequestAdapterOptions::default()),
            )
            .map_err(|error| format!("no graphics adapter: {error}"))?,
        };
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
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D3,
                        multisampled: false,
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

        let pipeline = make_pipeline(&device, &shader, &pipeline_layout, FRAME_FORMAT);

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("source"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });

        Ok(GpuCompositor {
            instance,
            adapter_handle: adapter,
            device,
            queue,
            shader,
            pipeline_layout,
            pipeline,
            layout,
            sampler,
            identity_lut: Lut::identity(),
            lut_textures: Mutex::new(HashMap::new()),
            adapter: name,
        })
    }

    pub fn adapter(&self) -> &str {
        &self.adapter
    }

    /// The instance the adapter came from. A surface has to be made from this
    /// one, not from a fresh `Instance::default()`.
    pub fn instance(&self) -> &wgpu::Instance {
        &self.instance
    }

    /// The adapter the device came from, for asking a surface what it can do.
    pub fn adapter_handle(&self) -> &wgpu::Adapter {
        &self.adapter_handle
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    /// The same shader and the same blending, drawing into `format`.
    ///
    /// A swapchain rarely offers [`FRAME_FORMAT`] — on macOS it is usually
    /// `Bgra8Unorm` — and a render pipeline is tied to the format of what it
    /// draws into, so the viewport builds its own with this rather than
    /// re-declaring the pipeline next to a second copy of the blend state.
    pub fn pipeline_for(&self, format: wgpu::TextureFormat) -> wgpu::RenderPipeline {
        make_pipeline(&self.device, &self.shader, &self.pipeline_layout, format)
    }

    /// Draw the layers into `view`, which must be `width` x `height` and must
    /// have been made in the format `pipeline` was built for.
    ///
    /// This is the whole of the drawing, and both callers reach the screen
    /// through it: `compose` gives it a texture it then reads back, and the
    /// viewport gives it the swapchain texture and presents. The frame the
    /// monitor shows is therefore the frame the render writes, drawn by one
    /// pass over one shader, rather than two implementations that agree today.
    pub fn draw_onto(
        &self,
        view: &wgpu::TextureView,
        pipeline: &wgpu::RenderPipeline,
        width: u32,
        height: u32,
        layers: &[(Source<'_>, Placement)],
    ) -> Result<(), String> {
        let bindings = self.bind(width, height, layers)?;
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });
        self.pass(&mut encoder, view, pipeline, &bindings);
        self.queue.submit(Some(encoder.finish()));
        Ok(())
    }

    /// Block until the device has finished what it has been given.
    ///
    /// `draw_onto` submits and returns, which is what a swapchain wants — the
    /// present is the synchronisation. A caller measuring how long a frame took
    /// has to ask for the work to be finished, or it times the submission and
    /// not the drawing.
    pub fn wait(&self) -> Result<(), String> {
        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map(|_| ())
            .map_err(|error| format!("the device stopped: {error}"))
    }

    /// Bind groups, one per layer, built before the pass opens because they
    /// have to outlive it.
    fn bind(
        &self,
        width: u32,
        height: u32,
        layers: &[(Source<'_>, Placement)],
    ) -> Result<Vec<wgpu::BindGroup>, String> {
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
                    format: FRAME_FORMAT,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING,
                    view_formats: &[],
                },
                wgpu::util::TextureDataOrder::LayerMajor,
                &source.rgba[..expected],
            );
            let lut = source.lut.unwrap_or(&self.identity_lut);
            let uniform = LayerUniform {
                rect: [
                    placement.dst.x as f32,
                    placement.dst.y as f32,
                    placement.dst.w as f32,
                    placement.dst.h as f32,
                ],
                frame: [width as f32, height as f32],
                opacity: placement.opacity.clamp(0.0, 1.0),
                lut_size: lut.size() as f32,
                domain_min: [
                    lut.domain_min()[0],
                    lut.domain_min()[1],
                    lut.domain_min()[2],
                    0.0,
                ],
                domain_max: [
                    lut.domain_max()[0],
                    lut.domain_max()[1],
                    lut.domain_max()[2],
                    0.0,
                ],
            };
            let buffer = self
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("layer"),
                    contents: uniform.bytes(),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
            let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            let lut_view = self.lut_view(lut);
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
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(&lut_view),
                    },
                ],
            }));
        }
        Ok(bindings)
    }

    fn lut_view(&self, lut: &Lut) -> wgpu::TextureView {
        let key = LutKey::from(lut);
        let mut textures = self.lut_textures.lock().unwrap();
        let texture = textures.entry(key).or_insert_with(|| {
            self.device.create_texture_with_data(
                &self.queue,
                &wgpu::TextureDescriptor {
                    label: Some("LUT"),
                    size: wgpu::Extent3d {
                        width: lut.size(),
                        height: lut.size(),
                        depth_or_array_layers: lut.size(),
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D3,
                    format: LUT_FORMAT,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING,
                    view_formats: &[],
                },
                wgpu::util::TextureDataOrder::LayerMajor,
                lut.texture_bytes(),
            )
        });
        texture.create_view(&wgpu::TextureViewDescriptor::default())
    }

    fn pass(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        pipeline: &wgpu::RenderPipeline,
        bindings: &[wgpu::BindGroup],
    ) {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("composite"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view,
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
        pass.set_pipeline(pipeline);
        for binding in bindings {
            pass.set_bind_group(0, binding, &[]);
            pass.draw(0..6, 0..1);
        }
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
            format: FRAME_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = target.create_view(&wgpu::TextureViewDescriptor::default());
        let bindings = self.bind(width, height, layers)?;

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
        self.pass(&mut encoder, &view, &self.pipeline, &bindings);
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
        let submission = self.queue.submit(Some(encoder.finish()));

        let slice = readback.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        // This submission and no other. The default waits for whatever was
        // submitted most recently, which on a machine with the monitor running
        // means waiting on its frames as well — this call is the preview and it
        // has no business holding the thread for playback's work.
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(submission),
                timeout: None,
            })
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

/// One declaration of the pipeline, used for the offscreen frame and for the
/// swapchain. The blend state is the picture, so having it written once is what
/// stops the monitor and the file from drifting apart at the one place they
/// could still disagree.
fn make_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("composite"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
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
    })
}
