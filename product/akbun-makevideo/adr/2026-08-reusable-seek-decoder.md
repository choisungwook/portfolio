# Short forward seeks reuse a decoder and may show two earlier frames

## Decision

- Keep the isolated ffmpeg subprocess architecture
- Reuse a live decoder for a forward seek of at most 24 project frames
- Restart the decoder for a backward or larger seek
- During playing seek, temporarily show only a current-generation frame at `T-1` or `T-2`
- Clear an unrelated pre-seek picture before settling; blank is allowed until `T-2`, `T-1` or `T` is available
- Never show a future frame early
- Replace the temporary frame with exact `T` as soon as it is ready, even when the audio clock has advanced
- While paused, including mouse release after scrubbing, wait for exact `T`
- Play or pause while a seek is still settling does not cancel exact `T`
- Close the audio output gate as soon as seek is requested; reopen it only after the old ring is flushed and the new position is buffered
- Rapid seeks may share one audio-ring flush, but completion belongs to the newest target
- Keep paused decoders idle for two seconds, then release them without clearing the last picture
- Count decoded queues, retained neighbor and pending-presentation frames, including text and shape raster bytes, in the reported memory ceiling

Do not add a separate application keyframe index while decoding remains an ffmpeg subprocess. The decoder command uses input-side `-ss` before `-i`; [ffmpeg already seeks through the container index to a nearby seek point and, with accurate seek enabled, decodes and discards up to the requested timestamp](https://ffmpeg.org/ffmpeg.html#Main-options).

## Why

- Reusing a process avoids repeated startup cost during nearby forward scrubbing
- Restarting backward and distant seeks keeps the subprocess protocol simple and deterministic
- A picture at most two frames behind gives immediate feedback without pretending that a distant or future frame is exact
- Exact-only paused frames keep edit decisions trustworthy
- A second keyframe cache would duplicate ffmpeg's container index and would need another discard/mapping layer to preserve exact project-frame timing
- Running, idle and released states keep quick resume cheap without retaining decoder memory indefinitely

## Consequence

- The all-seeks-restart rule in [2026-08-prefetch-frame-source.md](./2026-08-prefetch-frame-source.md) is superseded
- `supply-soak` measures repeated short-forward and backward seeks separately
- `present-soak` fails when audio advances by more than two project frames while the accepted visible frame does not advance
