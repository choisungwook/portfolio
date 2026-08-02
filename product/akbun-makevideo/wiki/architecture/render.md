# The render

`crates/render/src/ffmpeg.rs` builds the whole argument list. Shape:

```text
-hide_banner -nostdin -loglevel error -y
  (per clip)  -ss <in> -t <len> -i <path>          video and audio
              -loop 1 -framerate <fps> -t <len> -i <path>   stills
-filter_complex <graph>
-map [vout] [-map [aout]]
-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r <fps>
[-c:a aac -b:a 192k -ar 48000]
-t <total> -movflags +faststart -progress pipe:1 -nostats <output>
```

One input per clip rather than per asset. That costs an extra decoder when the same file is used twice, and buys input level seeking (`-ss` before `-i`, so ffmpeg skips to the in point instead of decoding everything before it) and a uniform way to give a still a length.

The graph:

```text
color=c=black:s=WxH:r=FPS:d=TOTAL[base]

per video clip:
  [N:v]format=yuva420p,
       scale=W:H:force_original_aspect_ratio=decrease,
       pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black@0,
       fps=FPS,setpts=PTS-STARTPTS[,colorchannelmixer=aa=OPACITY],
       tpad=start_duration=START:start_mode=add:color=black@0[vN]
  [prev][vN]overlay=x=0:y=0:eof_action=pass:enable='between(t,START,END)'[ovK]

per audio clip:
  [N:a]aformat=fltp:48000:stereo,asetpts=PTS-STARTPTS,
       volume=VOL,adelay=STARTMS:all=1[aN]
  [a0][a1]…amix=inputs=N:normalize=0:dropout_transition=0[aout]
```

Four details in there are load bearing:

- **`format=yuva420p` and `color=black@0` in the pad.** An off-aspect clip is letterboxed to the output size. With an opaque pad those bars would paint over the track underneath. With a transparent one the lower track shows through, which is what the timeline says should happen.
- **`tpad` rather than a bare `setpts` offset.** `overlay` pairs frames from both inputs; if the second one has no frames until five seconds in, framesync has nothing to pair and the graph can stall. `tpad` gives it transparent frames from zero so both inputs run from the start.
- **`enable='between(...)'`** is belt and braces on top of `tpad`, and is also what hides the clip again after its end. Commas inside the quoted expression are safe because the whole graph is one argv element.
- **`eof_action=pass`** lets the base through once a clip ends, instead of holding its last frame for the rest of the render.

Progress comes back on stdout as `-progress` blocks. The parser reads `out_time_us` and ignores `out_time_ms`, which ffmpeg has reported in microseconds for years; reading it as milliseconds puts the bar at 1000x and the render looks finished a second in.

## Render presets

FHD and 4K set the **long edge**, 1920 and 3840, and the project aspect decides the other side. A 1080x1920 project therefore renders 1080x1920 at FHD rather than a landscape frame with a stripe of video down the middle. Both derived sizes are rounded to even numbers because h264 requires it.
