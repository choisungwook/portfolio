# akbun-piano-teacher

A desktop piano practice coach for one player, on macOS and Windows. It imports a score and plays it back with a moving cursor under a full-width score, and a lit 2D keyboard or a 3D piano where virtual hands play along. A USB-MIDI digital piano lights up the keys you press.

- Import MusicXML (`.musicxml`, `.xml`, `.mxl`), MIDI files, or photos of the pages. Photos are read by a vision model (Codex on a ChatGPT plan, or the Claude API with a key) and every measure is checked before you see it.
- Practice view: score with cursor, an 88-key keyboard in 2D, or a 3D piano seen from above where virtual hands press the keys as the score plays, with hand colors and finger numbers, tempo 0.25 to 1.5, loop a measure range, one hand at a time, metronome.
- Photo-recognized scores get a Review view: every measure as a tile with its status and editable notation.
- In the 3D piano a hand icon shows or hides the hands.
- Everything stays in `~/PianoCoach` as JSON and MusicXML files. The API key is kept encrypted by the OS keychain.

## Directory

| Path | Content |
|---|---|
| [workspace/](./workspace/) | Source, tests, build and the OMR evaluation script |
| [wiki/](./wiki/index.md) | Architecture, development notes, feature map |
| [knowledge/](./knowledge/index.md) | Decision records and the intent and architecture document the product follows |
| [changelog/](./changelog/README.md) | One folder per version: release notes and how the code and architecture changed |

## Quick start

Install dependencies in `workspace/`.

```bash
npm ci
```

Build and open the app.

```bash
npm start
```

Run the tests (no Electron binary needed).

```bash
npm test
```

## Install a release

Releases are on the repository's release page under tags `akbun-piano-teacher-v<version>`. Builds are unsigned.

On macOS, remove the quarantine attribute once after copying the app to Applications.

```bash
xattr -cr /Applications/akbun-piano-teacher.app
```

On Windows, choose "More info" and then "Run anyway" when SmartScreen warns. After that, "Check for Updates…" in the app menu installs newer versions.

## Not built yet

Recording and judging your playing was removed from this version. Video of the hands, side-by-side compare playback, wait mode, LLM coaching, PDF input and staff-system cropping for OMR are in the plan ([wiki/features.md](./wiki/features.md)) but not built.
