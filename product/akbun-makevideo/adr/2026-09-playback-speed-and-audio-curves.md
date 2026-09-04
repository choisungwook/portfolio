# Playback speed and audio curves

## Decision

- Store playback speed on each clip
- Derive timeline duration from source span divided by speed
- Preserve pitch by default; let the user disable it explicitly
- Store fade-in and fade-out separately from volume keyframes
- Evaluate speed and gain from the same project-frame model in preview and render

## Reason

- The source in/out range remains stable when speed changes
- A derived duration gives trim, split, seek and render one answer
- Pitch-preserving speech is the least surprising default
- Fades are edge-relative controls; keyframes are arbitrary automation points

## Tradeoffs

- Changing speed may be refused when the derived duration overlaps the next clip
- Non-pitch-preserving playback intentionally changes tone
