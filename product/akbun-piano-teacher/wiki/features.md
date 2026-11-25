# Feature map

What a user can see and act on, by the name this wiki uses for it. Selectors are from `workspace/src/renderer/index.html`; the lists inside them are rendered by `workspace/src/renderer/app.ts`.

| Name | Selector | What it does |
|---|---|---|
| Nav | `#nav`, `[data-view]` | Switches between Library, Practice, Review (only for photo-recognized songs, `#nav-review`) and Settings |
| Notice | `#notice` | Status and error line in the header; click to clear |
| Task | `#task` | Progress of a running OMR import, with Cancel (`#task-cancel`) |
| Import button | `#import` | Opens the file dialog for MusicXML, MIDI or page images |
| Song list | `#song-list` | Songs by title; click to practice |
| Play button | `#play` | Large round button with a play or pause icon (also Space); orange while playing |
| Position | `#song-title`, `#position` | Song and current measure |
| Tempo | `#tempo` | Playback and target tempo, 0.25× to 1.5× |
| Repeat | `#loop-on`, `#loop-from`, `#loop-to` | Repeat icon, filled while on: plays the measure range over and over |
| Hands | `#hand-r`, `#hand-l` | Which hands sound and light up |
| Metronome | `#metronome` | Metronome icon, filled while on: click on every beat, accented downbeat |
| Piano panel | `#keys-toggle` | Keyboard icon, filled while on: hides the 2D keyboard or 3D piano so the score gets the whole height |
| MIDI input | `#midi-device` | Labeled "MIDI": the USB-MIDI device whose keys light up; "No MIDI input" when none is connected, "Not available" when Web MIDI is denied |
| Score | `#score` | OSMD rendering, full width, every line starting at the same left edge (no part name); the cursor follows the note that started last |
| Review | `#view-review`, `#omr-list` | One tile per recognized measure: status color on the left edge, notation text, Apply. A separate view so the score fills Practice |
| Hands toggle | `#hands-toggle` | Hand icon, shown in 3D: filled while the hands show; a click hides or shows them |
| View mode | `#view-mode` | 2D keyboard or 3D piano under the score; remembered per machine |
| Keyboard | `#keyboard` | 2D: 88 keys, right hand blue, left hand green, a finger number on every sounding key (printed or suggested), your keys outlined in orange |
| 3D piano | `#piano3d` | 3D: one piano from above; sounding keys sink, light by hand and show the finger number at their front edge; virtual hands with jointed fingers strike each key and lift before the note ends; your keys light orange |
| Settings | `#settings-form` | Vision provider, Codex path and model, Claude model and API key, library location |

Icon toggles keep their state in `aria-pressed` and remember it per machine in localStorage (`toggle#<id>`).

## Planned, not built

From the intent document's phases, in order:

| Phase | Item |
|---|---|
| P0 | Run `omr-eval` on the target pieces and record go/no-go; vector PDF coordinates; MediaRecorder seek |
| P1-b | PDF input, staff-system cropping and barline detection, double reading, original measure image next to the rendering, note-level editing |
| P3, P4 | Recording a take (removed in 0.1.0 on request), camera video, the report and compare view. `core/analysis.ts` still judges a take but nothing calls it |
| P5 | LLM explanation of a report and follow-up questions |
| P6 | Wait mode and the four guide levels |
| P7 | Fingering suggestions, hand tracking, side camera, pedal correction |
