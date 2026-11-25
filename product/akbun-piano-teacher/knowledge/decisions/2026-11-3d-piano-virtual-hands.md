---
type: Decision
title: 3D piano view with virtual hands
description: A three.js piano seen from above, under the score, where drawn hands press the sounding keys; a mode next to the 2D keyboard.
tags: [3d, ui, three]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: intent
    resource: /references/piano-coach-intent-architecture-v0.3.md
    title: Piano Coach intent and architecture v0.3
---

## 결정

Practice has a view mode: the 2D canvas keyboard, or a 3D piano (`renderer/piano3d.ts`, three.js) under the score. In 3D, keys sink and light by hand color, and two simple drawn hands (palm and five fingers) put a fingertip on every sounding key. The score's fingering decides the finger when it exists; otherwise the hand shifts only as far as needed and the nearest free finger takes the key. A replayed take drives the same hands, split at middle C.

## 이유

- The user asked for this on 2026-11-25, showing a lesson video layout: score on top, one lit piano below, hands playing along. The intent document lists 3D avatars as a non-goal because a realistic avatar is costly[^intent]; this is not that. Boxes and cylinders give the "hands playing the score" picture at a few hundred lines, and the camera feed of the player's own hands is still the plan for P3.
- One piano, not the video's two (a lit diagram plus a filmed keyboard), so the eye stays on one place.
- The 3D view takes the same marks as the 2D keyboard, so player, MIDI input and replay needed no change. Upgrade the hands (rigged model, hand tracking from the P3 camera) behind `Piano3D` without touching callers.

[^intent]: Section 0 lists 3D avatars as a non-goal; section 2 picks 2D keys with finger numbers for demonstrations.
