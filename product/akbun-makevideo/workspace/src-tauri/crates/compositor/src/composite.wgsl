// The one shader. Both the preview frame and every frame of a render are drawn
// with it, which is the whole point: there is no second implementation of
// compositing to drift from this one.
//
// One draw per layer, bottom track first, ordinary source-over alpha blending.
// The geometry comes from the uniform rather than a vertex buffer, so a layer
// is a rectangle in output pixels and nothing here has to agree with a vertex
// layout somewhere else.

struct Layer {
    // x, y, width, height of the destination, in output pixels.
    rect: vec4<f32>,
    // Output frame size, to turn those pixels into clip space.
    frame: vec2<f32>,
    opacity: f32,
    _pad: f32,
};

@group(0) @binding(0) var<uniform> layer: Layer;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var source_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
    // Two triangles over the unit square; the rect turns them into the
    // destination. Corner order matches uv order, so no flip is needed.
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
    );
    let corner = corners[index];
    let pixel = layer.rect.xy + corner * layer.rect.zw;

    var out: VertexOutput;
    // Pixel space is y down, clip space is y up.
    out.position = vec4<f32>(
        pixel.x / layer.frame.x * 2.0 - 1.0,
        1.0 - pixel.y / layer.frame.y * 2.0,
        0.0,
        1.0,
    );
    out.uv = corner;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let texel = textureSample(source, source_sampler, in.uv);
    return vec4<f32>(texel.rgb, texel.a * layer.opacity);
}
