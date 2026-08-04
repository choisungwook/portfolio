# Frames come from a per-clip prefetch buffer, not from a synchronous read

## Decision

Decode each clip on its own thread into a bounded queue of finished frames, and let the consumer take only what is already there. Queue depth and how early a decoder starts are settings; the defaults are 6 frames and 15 frames, chosen from the supply meter rather than picked.

Keep ffmpeg as a separate process per clip. Revisit linking it as a library only if a measurement says the process route cannot reach the target rate.

Define seek as one operation: throw every queue away and refill from the target. Playing and paused take that same path.

Leave the behaviour of a broken source as it is — the clip stops drawing and the rest of the timeline runs on.

Judge the result headlessly with `supply-soak`, and do not connect it to the window in this step. The render uses the same source, so there is one decoding path rather than a playback one and a render one.

## Why

- A synchronous read ties every clip to the slowest decoder, so one clip stalling for 40 ms stops all of them for 40 ms, which at 30 fps is a visible hitch.
- Linking ffmpeg makes one bad file able to kill the editor and changes the licence terms of what is shipped, which is not worth taking on before the need is proved.
- Depth trades memory against jitter — `depth * width * height * 4` per clip on screen — and the right trade depends on the source resolution and the track count.
- One seek path means one behaviour to get right and one to test; two would drift.
- Supply and drawing look the same on screen and have nothing to do with each other, so measuring supply with no window is what keeps the next stage's failures readable.
