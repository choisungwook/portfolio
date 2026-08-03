# One compositor for the preview and the render

## Decision

Drawing a frame happens in one place: a wgpu compositor in `crates/compositor`
with a single WGSL shader, fed by geometry from `makevideo_render::layout`.

The render decodes each clip with its own ffmpeg subprocess, composites in that
shader, and pipes the finished frames back to an ffmpeg encoder on stdin. The
preview asks the same compositor for one frame whenever the playhead is not
moving, and shows it over the stacked media elements.

The compositor has two interchangeable backends: wgpu, and a software one that
needs nothing. wgpu is an optional Cargo feature, and `Compositor::new()` never
fails — with no graphics device the software backend draws the same frame.

Encoding, decoding and audio mixing stay in ffmpeg subprocesses. The old filter
graph route stays too, chosen in Settings and used automatically if the
composited route fails.

## Reason

The preview and the render were two implementations of the same timeline. They
agreed on framing and z-order because both had been written to, and nothing
kept them agreeing. That was named as the weakest part of the architecture when
the preview was first built, and it is the thing this fixes.

The fix is not "move everything into one process". It is narrower: **the
decision about what a frame looks like now exists once.** `layout::fit_rect`
replaced CSS `object-fit: contain` in one place and
`scale=force_original_aspect_ratio=decrease` plus `pad` in the other. One
shader replaced CSS stacking and `overlay`. There is a test that renders a file,
asks for the preview frame at the same instant, and compares pixels.

### Why the frames go back out to ffmpeg

Linking libavcodec was rejected earlier and the reasons have not changed: a
malformed file segfaults the editor instead of a subprocess, libavcodec is the
most CVE-prone thing in the media world and would be in our address space, and
the ffmpeg most users have is a GPL build that cannot be linked into a
distributed app.

Piping raw frames is the price of keeping that separation. It is 250 MB for
every second of 1080p30 timeline, and on a software rasteriser it made a test
render 3.4x slower. On a Mac the drawing is on the GPU and the pipe traffic is
what remains, but it is a real cost and it is why the filter graph route is
still supported rather than deleted.

### Why the preview is still two things

A composited frame costs about 50 ms per visible layer, because each one is a
separate single frame ffmpeg call. That answers when the playhead stops. It
cannot play.

So playback stays on the stacked elements and the exact frame appears when
playing stops, with a badge saying which is on screen. That is not a
compromise hidden in the implementation — it is the professional pattern, and
the case where the difference matters is exactly the case this serves: checking
what the render will look like before spending an hour on it.

### Why wgpu is optional and the CPU can do it all

A compositor that only works with a graphics device would make "no GPU" mean
"the preview cannot show you the render", which is the one thing this change
was for. It would also make wgpu — a large dependency — mandatory for a build
that might never use it.

So the software backend is not a stub. It mirrors the shader down to the blend
factors and there is a test asserting the two agree within one unorm8 step. It
is slower: 114 ms a frame at 1080p with two layers, against 23 ms for a
software Vulkan device and much less for a real one. Slow is a fine answer;
"cannot draw" is not.

Being able to build without wgpu at all is the other half. It keeps the option
honest — a feature that is never compiled out rots — and the verify job builds
and tests `--no-default-features` before it installs any graphics driver, so
the CPU path is proved on a machine that has nothing.

### What was rejected

**Putting the shader in the page instead.** WebGPU in a WKWebView is not
something to depend on today, and WGSL and GLSL are not interchangeable, so
"the same shader" would have become "two shaders written from the same notes",
which is the problem again with extra steps.

**Compositing on the GPU inside ffmpeg** with `scale_vt` and
`overlay_videotoolbox`. That keeps frames in device memory and would be faster,
but it is a filter graph per vendor, gated on which filters a given ffmpeg
build happens to have, and it would not give the preview anything.

**Deleting the filter graph route.** It is faster, it has been verified pixel
by pixel, and it is the fallback that makes the composited route safe to
default to. Keeping both costs a setting and one shared set of encoder
arguments, which is tested to be identical on both routes.
