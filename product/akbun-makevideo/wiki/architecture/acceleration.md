# Hardware acceleration

Settings → Render acceleration, defaulting to Auto. What it changes:

| | CPU | Hardware |
|---|---|---|
| Encoder | `-c:v libx264 -preset medium -crf 20` | `-c:v h264_videotoolbox -b:v <computed>k -allow_sw 1` |
| Decode | software | `-hwaccel videotoolbox` before each video input |
| Filters | CPU | **still CPU** |

The filter graph is byte for byte identical on both paths. That is deliberate and there is a test for it: it is what lets a failed hardware render be retried by re-running the same project rather than rebuilding it.

`-crf` and `-preset` are libx264 options; a hardware encoder ignores them and encodes at its default, so the hardware path asks for a bitrate instead — about 0.12 bits per pixel per frame, generous because a media engine spends more bits than x264 for the same picture.

**Detection is a trial encode, not a listing.** `ffmpeg -encoders` reports what ffmpeg was compiled with: the Linux container this was written in lists `h264_nvenc` and has no NVIDIA card. So the listing picks candidates and one frame through `-f null -` decides, about 50 ms each, cached for the life of the app. `AccelProbe.tried` keeps why each candidate was rejected, which is what Settings shows instead of an unexplained "no GPU".

**A hardware failure falls back.** `start_render` builds both argument lists up front, runs the hardware one, and on a non-zero exit that was not a cancel, emits `render:fallback` and runs the CPU one. Only a cancel or a success stops it.

qsv and vaapi are not offered: unlike videotoolbox and nvenc they need frames uploaded into device memory with `hwupload`, so they cannot be reached by swapping the encoder. See [adr/2026-08-gpu-means-hardware-encode.md](../../adr/2026-08-gpu-means-hardware-encode.md).
