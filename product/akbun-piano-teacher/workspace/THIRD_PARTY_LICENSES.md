# Third-party licenses

Everything bundled into the app is under a permissive license. GPL and AGPL tools (Audiveris, ffmpeg) are not bundled; when supported, the user installs them and the app runs them as separate processes.

## Bundled

| Package | License | Used for |
|---|---|---|
| electron | MIT | App runtime |
| electron-updater | MIT | Windows self update |
| opensheetmusicdisplay | BSD-3-Clause | Score rendering |
| three | MIT | 3D piano view |
| tone | MIT | Audio scheduling and sampler |
| @tonejs/midi | MIT | MIDI file import |
| @xmldom/xmldom | MIT | MusicXML parsing in the main process |
| jszip | MIT (dual MIT or GPL-3.0; used under MIT) | `.mxl` files |
| @anthropic-ai/sdk | Apache-2.0 | Claude API vision calls |

## Loaded at runtime

| Asset | License | Attribution |
|---|---|---|
| Salamander Grand Piano samples, served from tonejs.github.io | CC-BY 3.0 | Salamander Grand Piano by Alexander Holm |

## Used but not shipped

| Tool | License | How |
|---|---|---|
| Codex CLI | Apache-2.0 | Installed and signed in by the user; spawned as a separate process |

## Build only

esbuild (MIT), typescript (Apache-2.0), electron-builder (MIT).
