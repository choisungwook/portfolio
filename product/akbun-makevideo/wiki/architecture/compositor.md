# The compositor

## What it is for

The preview and the render used to be two independent implementations of the
same timeline: the browser stacking `<video>` elements with CSS, and ffmpeg
scaling, padding and overlaying in a filter graph. They agreed by hand and had
no way to keep agreeing.

`crates/compositor` is one implementation of drawing a frame, used by both. It
takes decoded RGBA in and gives one composited frame out, and it knows nothing
about files or ffmpeg. `crates/compositor/src/composite.wgsl` is the shader —
one file, one draw call per layer, ordinary source-over alpha blending.

## wgpu is optional, and the CPU draws the same picture

There are two backends behind one `Compositor`:

| Backend | Needs | Chosen when |
|---|---|---|
| `gpu.rs` | the `gpu` feature and a graphics adapter | by default, when there is one |
| `cpu.rs` | nothing at all | no adapter, the feature off, or Settings says so |

`Compositor::new()` cannot fail. With no graphics device it returns the
software compositor, so "this machine has no GPU" stopped being a reason for
anything to break — the frame is the same, it just takes longer to draw.

wgpu is an **optional dependency**. `cargo build -p makevideo-compositor
--no-default-features` produces a crate with no wgpu anywhere in its dependency
tree, and the verify job builds and tests exactly that, so the option is real
rather than declared.

`cpu.rs` mirrors `composite.wgsl` on purpose, down to the blend factors, and
`both_backends_draw_the_same_frame` asserts they land within one unorm8 step of
each other on every channel. If the shader changes and the software half is
left behind, that test is what says so.

The one place they can differ: the shader samples linearly and `cpu.rs` samples
nearest, which only shows when a source is not already at its destination size.
The pipeline always scales with ffmpeg first, so in the app it never arises.

Measured at 1080p with two layers, per frame of compositing alone:

| Backend | Per frame |
|---|---|
| llvmpipe, a software Vulkan device | 23 ms |
| `cpu.rs` | 114 ms |

A real GPU is far quicker than either. The scalar loop being slower than a
software *rasteriser* is expected: llvmpipe is vectorised and threaded, and
this is neither.

## Where the geometry comes from

Not from the compositor. `makevideo_render::layout` decides what is on screen
and where:

| Function | Answers |
|---|---|
| `fit_rect` | Where one source lands in the frame: contain and centre, rounded even |
| `placements` | Every clip that can draw, in paint order, with its rect |
| `layers_at` | What is on screen at one instant, derived from `placements` |

That crate has no GPU dependency, so all of it is tested without one. The
decoder command reads the same rects to decide what size to scale a clip to,
which is why ffmpeg's scaler doing the resizing does not reintroduce a second
opinion: ffmpeg carries out a decision, it does not make one.

## The two render routes

Settings → Compositor picks between them.

```text
Auto or CPU (default is Auto)
  ffmpeg decode per clip  ─┐
  ffmpeg decode per clip  ─┼─► compositor ─► ffmpeg encode ─► file
  ffmpeg decode per clip  ─┘   (gpu or cpu)     (+ audio)

ffmpeg filter graph
  every clip ─► scale, pad, overlay, amix inside one ffmpeg ─► file
```

Audio never leaves ffmpeg on either route. `amix` is not worth reimplementing,
and sound is not what was diverging.

`pipeline::run` walks the frames. A decoder is started when its clip's first
frame is wanted and killed when its last one has been read, so a fifty clip
project is not fifty processes for the whole render. Each frame it reads one
frame from every active decoder, composes, and writes the result to the
encoder's stdin. Closing that stdin is what tells ffmpeg the video is over.

A decoder that cannot start, or that runs out early, marks itself dead and its
clip stops drawing. That is deliberate: a clip whose media was moved leaves a
hole in the render, the same hole the timeline draws for it, rather than
failing an hour of encoding.

## What it costs

Measured on a 5 second 1080p30 two track project, against a **software**
rasteriser with no GPU at all:

| Route | Time |
|---|---|
| ffmpeg filter graph | 2.7 s |
| composited | 9.2 s |

That is 3.4x, and it moved 1.24 GB through pipes — about 250 MB for every
second of timeline, because every frame leaves ffmpeg as raw RGBA and comes
back the same way.

Two things to hold onto about that number. It is an upper bound: on a Mac the
drawing runs on the GPU rather than on llvmpipe, and the pipe traffic is what
is left. And it is the reason the filter graph is still here and still
supported rather than deleted.

## The preview frame

`pipeline::preview_frame` draws one frame the same way, decoding each visible
clip with its own single frame ffmpeg call. That costs roughly 50 ms a layer,
which answers when the playhead stops and cannot possibly keep up with
playback. So the page uses both:

| When | What is on screen | Badge |
|---|---|---|
| Paused or just scrubbed | The composited frame, on a canvas over the stack | exact frame |
| Playing | The stacked media elements | live preview |

The frame crosses IPC as raw RGBA with an eight byte width and height header,
and the page blits it with `putImageData`. Raw rather than a JPEG on purpose:
the whole point is to show exactly what the render will contain, and a lossy
hop to the screen would undo that.

There is a test for the claim, not just a paragraph:
`the_preview_frame_matches_the_rendered_frame` renders a file, asks for the
preview frame at the same instant, and compares pixels in the middle and at the
pillarboxed edge.

## Testing without a GPU

Every drawing test runs on both backends. The software one is always there, so
the suite passes on a machine with no graphics stack; when the `gpu` feature is
on, the GPU one **fails loudly rather than skipping**, and the verify job
installs `mesa-vulkan-drivers` so lavapipe provides an adapter. A software
Vulkan device draws the same frames a real one does, which is what makes a
pixel assertion meaningful on a runner with no hardware.

The verify job runs the crate twice, and the order matters:

1. `--no-default-features`, before mesa is installed. No wgpu is compiled and
   no adapter exists, so this is the CPU path standing entirely on its own.
2. With the feature and with lavapipe, so the GPU half and
   `both_backends_draw_the_same_frame` actually run.

`tests/render.rs` needs ffmpeg as well, and renders real files into a temp
directory. It is the slowest part of the suite — about half a minute on the
GPU backend and a minute on the CPU one — and it is the only thing standing
between a broken pipeline and a user finding out at the end of a long render.
