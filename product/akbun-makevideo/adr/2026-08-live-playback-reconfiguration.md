# Playback settings switch after the replacement picture is ready

## Decision

- Preview quality, proxy use, guides, compositor backend and graphics device changes take effect while playback continues
- Audio clock, transport and the current picture stay active while the replacement video path prepares
- A setting that only changes drawing is read on the next frame
- A setting that needs a new video path switches only after that path has produced its first frame
- Results from an older setting generation are discarded after the switch
- A failed explicit choice keeps the previous path, restores the previous setting and reports the failure
- Automatic selection may try another graphics device or the CPU before restoring the previous setting
- Keep one native surface and presenter for the session; replacement paths never attach another window layer
- Reuse the compositor when the selected physical adapter is unchanged
- Merge an automatic proxy refresh into the latest confirmed settings instead of restoring an older settings snapshot
- Treat every settings entry point as one latest-wins sequence; a failed newest request restores the backend-confirmed snapshot

## Why

- Editing settings need immediate visual feedback during playback
- Releasing the current session before attaching its replacement can leave audio running over a frozen or missing picture
- Keeping the current path alive during preparation trades a short period of duplicate resource use for continuous picture and sound
- A fixed native surface prevents abandoned replacement layers from covering the committed picture

## Consequence

- The stopped-only reconfiguration rule in [2026-08-persistent-playback-pipeline.md](./2026-08-persistent-playback-pipeline.md) is superseded
- Immediate means that the old picture keeps moving until the first replacement frame is ready, not that device initialization must finish inside one frame
- The same adapter keeps the GPU texture path; a different adapter temporarily requires readback and upload through the fixed presenter
- Explicit setting generations take priority over automatic proxy refreshes, and only the newest generation may commit
- Playback quality checks must fail on a frozen picture, an audio gap, an old-generation frame after the switch or a setting that claims a failed explicit choice
