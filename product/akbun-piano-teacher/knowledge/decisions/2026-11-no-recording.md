---
type: Decision
title: No recording of takes in 0.1.0
description: Record, replay, the report screen, warm-up buttons and session storage were removed; live MIDI key lighting and the tested analyzer in core stay.
tags: [scope, midi, analysis]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: intent
    resource: /references/piano-coach-intent-architecture-v0.3.md
    title: Piano Coach intent and architecture v0.3
---

## 결정

The app does not record takes. Removed: the Record and Replay buttons, the guide-sound option, the Report view, warm-up buttons, the `session:*` IPC and `sessions/` storage. Kept: Web MIDI input, which lights the keys you press, and `core/analysis.ts` with its tests, which no screen calls.

## 이유

- The user asked to take recording out on 2026-11-25, while the 3D piano with playing hands was being built. Playback and following the score are what 0.1.0 is for.
- Everything that only consumed a recorded take (report, replay, warm-up from weak measures, sessions on disk) had nothing left to read, so it went with it rather than staying as screens without data.
- The analyzer is pure, tested and is the core of phase P4[^intent]. It was kept so recording can return by adding the capture and a screen, without rewriting the judging. Delete it if recording is dropped for good.

[^intent]: Section 6.3, P4.
