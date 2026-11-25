# Architecture

## Processes

| Process | Entry | Does |
|---|---|---|
| Main | `src/main/main.ts` | Window, menu, self update, IPC handlers, library files, settings, OMR task |
| Preload | `src/main/preload.ts` | Exposes `window.api` (the IPC surface below) with context isolation |
| Renderer | `src/renderer/app.ts` | Screens, OSMD score, 2D keyboard and 3D piano, Tone.js playback, Web MIDI input that lights keys |

`src/core/` is shared by main, renderer, tests and scripts and imports nothing from Electron.

## Core modules

| File | Role |
|---|---|
| `core/model.ts` | Score, Measure, NoteEvent, Timeline, Session, Report types; `TPQ` = 480 ticks per quarter |
| `core/ports.ts` | `VisionLlm`, `TaskContext`, `Availability`, `Player`, OMR result types |
| `core/notation.ts` | piano-notation v1 parser and writer; key signature and accidental rules; beat-count, format and range checks |
| `core/musicxml.ts` | MusicXML (first part) to Score, and Score to MusicXML for scores that came from MIDI or OMR |
| `core/midi-file.ts` | Parsed MIDI file to Score: 16th grid, first time signature, track or pitch split into hands |
| `core/timeline.ts` | Unrolls repeats and voltas, merges ties, ticks to ms; `sliceTimeline` for a measure range and hands |
| `core/fingering.ts` | Fills a finger for every timeline note without printed fingering: five fingers on neighboring white keys, the hand moves only as far as needed, chords ordered away from the thumb. Printed fingering always wins |
| `core/analysis.ts` | RuleAnalyzer: chord groups, Needleman-Wunsch alignment, wrong/missed/extra, stops, rushing and dragging. Tested, but the app no longer calls it since recording was removed |
| `core/omr.ts` | Prompt, per-page vision call, parse and check, retry with the problems, cache key, Score and per-measure origins |
| `core/omr-metrics.ts` | Measure exact match, pitch F1 and onset F1 against an answer score |

## Flows

Import: the renderer calls `importSong`. Main opens a file dialog. MusicXML and MIDI become a Score in `library.ts` and are saved with the original file. Image files run OMR as a background task: `importImages` hashes each page, calls the chosen VisionLlm through `recognizePages`, caches raw answers in `~/PianoCoach/cache/omr`, writes the Score as MusicXML and saves `omr/origins.json`.

3D view: `renderer/piano3d.ts` draws one piano with three.js and runs its own render loop while the 3D mode is on. `paintKeyboard` hands it the same marks the 2D canvas gets (sounding guide notes with hand, finger and how much of the note has sounded, and your keys). Each frame, keys ease toward pressed or released and toward their color. Fingers are two segments: the middle joint rises when knuckle and tip are closer than the finger is long, so a hovering finger curls and a striking one stretches. The hand icon (`#hands-toggle`) calls `setHandsVisible`; keys keep lighting with the hands hidden. A finger strikes fast and lifts slower, and lifts once 80% of its note has sounded so repeated notes show a new strike. Each hand picks fingers: the score's fingering when present, otherwise the nearest free finger after shifting the hand only as far as needed to reach every note.

Practice: the renderer loads `score.json` and `score.musicxml`, builds a Timeline, fills missing fingering with `suggestFingering`, renders the MusicXML with OSMD and drives `TimelinePlayer`. The player schedules notes 250 ms ahead on the Tone.js clock; each frame it reports the position, the cursor moves to the tick of the sounding note, and the keyboard repaints.

Review: for photo-recognized songs the sidebar shows Review. Measures with `invalid` or `uncertain` status are shown with their notation as text. Applying an edit re-parses that one measure with the measure's key and time, replaces its events, marks it `user-edited`, and saves Score, MusicXML and origins.

## IPC surface

| `window.api` | Channel | Returns |
|---|---|---|
| `listSongs()` | `library:list` | Song summaries by title |
| `loadSong(id)` | `library:load` | `{ score, musicxml, origins }` |
| `importSong()` | `library:import` | `{ id }` or null when cancelled; runs OMR for images |
| `saveScore(score, origins?)` | `library:save-score` | Writes score.json, score.musicxml and origins |
| `cancelTask()` | `task:cancel` | Aborts the running OMR task |
| `onTaskProgress(fn)`, `onTaskLog(fn)` | `task:progress`, `task:log` | Events from main |
| `getSettings()`, `saveSettings(s)`, `setApiKey(k)` | `settings:*` | Settings without the key; the key is encrypted with safeStorage |
| `visionStatus()` | `vision:status` | `Availability` of the selected vision provider |
| `openLibraryFolder()` | `shell:open-library` | Opens `~/PianoCoach` |

Ids that reach the file system are checked against `^[\w가-힣.-]+$` in main.

## Files on disk

Layout of the user's data folder:

```text
~/PianoCoach/
  library/<songId>/source/          original files
  library/<songId>/score.json       Score
  library/<songId>/score.musicxml   what OSMD renders
  library/<songId>/omr/origins.json per-measure status, notation, usage
  cache/omr/                        raw vision answers by (page hash, engine, model, prompt version, attempt)
  config/settings.json
```

## Self update

`src/main/update.ts` lists the repository releases and picks the first tag with prefix `akbun-piano-teacher-v`. macOS downloads the dmg for `process.arch` and swaps the bundle with a detached script. Windows sets electron-updater's feed to that tag's download folder and installs the NSIS build. Only packaged builds install; development builds open the release page.

