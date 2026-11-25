---
type: Decision
title: The LLM writes piano-notation v1, code checks and judges
description: OMR asks for a short per-measure text instead of MusicXML, rejects what does not add up, and keeps every verdict on practice takes in rule-based code.
tags: [omr, llm, analysis]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: intent
    resource: /references/piano-coach-intent-architecture-v0.3.md
    title: Piano Coach intent and architecture v0.3
---

## 결정

- The vision model returns piano-notation v1 (section 4.4 of the intent document): pitches as printed, durations as letters. `core/notation.ts` applies key signatures and accidentals, checks every voice against the time signature, and flags unreadable tokens and out-of-range notes. Pages with problems are asked again with the problems listed, at most twice, and measures that still fail are kept and marked `invalid` for review.
- Version 0.1 sends whole page images. Staff-system cropping, barline detection and double reading come after the P0 measurement with `npm run omr-eval`, because they only pay off if LLM OMR is good enough to keep.
- Wrong notes, missed and extra notes, stops and tempo are decided by `core/analysis.ts` from MIDI. An LLM may later explain a Report but cannot change it.

## 이유

- A shorter format leaves fewer ways to be wrong, and every mistake that breaks the beat count is caught by code instead of by the user's ear[^intent].
- Beat-count checks cannot catch a wrong pitch. That is what the review panel (edit a measure as text) and playback are for; double reading is the next step if P0 shows pitch errors dominate.
- MIDI gives exact pitches and times, so rules are both cheaper and more trustworthy than a model for judging a take.

[^intent]: Sections 2, 4.4 and 4.5 of the intent document.
