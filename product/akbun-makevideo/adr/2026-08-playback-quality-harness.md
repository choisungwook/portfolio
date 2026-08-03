# Playback quality is judged by one numeric harness

## Decision

Use one synthetic 1080p30 source and four fixed soak scenarios to measure frame interval p50 and p99, dropped frames, A/V drift, startup delay and process-tree memory growth.

Keep the current media element result in `quality/media-element-macos.json` as the first engine baseline.

## Why

- Playback regressions become comparable across the media element, frame source and native surface stages.
- A generated colour pattern with burned-in timecode is reproducible without committing a large video.
- The four scenarios cover continuous playback, restart, track pressure and seek pressure without adding symptom-specific tests.
