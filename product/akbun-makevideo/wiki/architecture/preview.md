# The preview

`src/preview.js` keeps one media element per clip in a pool, stacks them in `#stage-inner`, and drives them from a clock:

1. A `requestAnimationFrame` loop computes the playhead from `performance.now()`.
2. `clipsAt()` says which clips are live at that instant.
3. Each live element is shown, given a z-index from its track, and seeked if it has drifted further than the current quality tolerance allows.
4. Everything not live is hidden and paused.

This is not the render. The differences are real and worth knowing:

- The preview composites with CSS `object-fit: contain` and `opacity`; the render composites with `scale`, `pad` and `overlay`. They agree on framing and z-order, and they will not agree on colour management.
- The preview does not mix audio; it plays several elements at once and lets the system add them up. The render uses `amix` with `normalize=0`.
- The preview cannot honour a frame rate. It shows whatever the element decodes.

Anything that looks wrong in the preview should be checked against a render before it is called a bug.

## Preview quality

Set in Settings and defaulted to **Half**. It changes two things:

| Setting | Layout scale | Drift tolerance |
|---|---|---|
| Full | 1 | 0.12 s |
| Half | 0.5 | 0.25 s |
| Quarter | 0.25 | 0.4 s |

The stage box stays the same size on screen. What changes is that `#stage-inner` is laid out at `scale` and transformed back up, so the browser composites a smaller surface, and how far an element may run from the playhead before it is seeked back. The second one matters more: seeking is the expensive operation, and a looser tolerance is most of the saving. Lowering the quality does **not** make the decoder do less work, because the element still decodes its source at full resolution.
