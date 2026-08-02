# Preview by stacking media elements, not by decoding in Rust

## Decision

The preview keeps one `<video>` or `<audio>` element per clip, stacks them in the stage, and drives them from a `requestAnimationFrame` clock. Rust decodes nothing for the preview. The preview and the render are therefore two independent implementations of the same timeline, and the wiki says so.

## Reason

The alternative is to decode and composite frames somewhere and push them to a canvas — in Rust, or by piping ffmpeg into the page. Both mean writing a compositor, a frame scheduler and an audio clock, and getting real time playback out of them. The browser already has all three, tuned by people who do nothing else, and reaches them through four lines of code per element.

What that buys is a preview that plays on the first day. What it costs is that the preview is an approximation:

- It composites with `object-fit: contain` and `opacity`; the render composites with `scale`, `pad` and `overlay`. They agree on framing and z-order and will not agree on colour management.
- It does not mix audio, it plays several elements and lets the system add them up.
- It cannot honour a project frame rate. It shows whatever the element decodes.

That is an acceptable trade for an editor whose output is the render, as long as nobody mistakes the two. It would not be acceptable for colour work.

The honest limit of this approach is the number of simultaneous elements. Four video tracks playing at once is four decoders, and a webview will not keep up with four 4K streams. That is what the preview quality setting is for, and why it defaults to Half rather than Full.

## Where a lower quality actually saves

Not where it looks like it does. A `<video>` decodes its source at full resolution whatever size it is drawn at, so shrinking the stage does not make the decoder do less work. The two things that do change:

1. `#stage-inner` is laid out at the quality scale and transformed back up, so the browser composites a smaller surface.
2. The drift tolerance loosens, from 0.12 s to 0.4 s. Seeking is the expensive operation during playback, and letting an element run further before it is pulled back is most of the saving.

Writing this down because "quality" reads like it should reduce decode cost, and someone will otherwise spend an afternoon wondering why Quarter did not help as much as expected.
