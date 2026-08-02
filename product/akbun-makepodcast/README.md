# akbun-makepodcast

Desktop podcast recorder. It finds the audio interfaces and microphones attached to the machine, records the one you pick into a wav file, draws the waveform as it arrives, and plays the take back through the output you pick. Built on Tauri with a plain HTML and JavaScript page, so there is no build step on the frontend.

## What it does

- Lists every input and output the system exposes, with channel count and sample rate
- Records track A from the chosen interface into 24 bit wav
- Draws the waveform live while recording, with a timeline and an indicator that travels it
- Input and output level meters in dBFS, with a clip indicator
- Plays the take back through the chosen output, with a volume control
- Projects: a named folder under the recordings folder, takes numbered inside it
- Save WAV copies the take anywhere
- Self update from the Settings dialog

## Directories

| Directory | Description |
|---|---|
| [workspace/](./workspace/) | The app: the page under `src/`, the Rust side under `src-tauri/`, the tests under `test/` |
| [wiki/](./wiki/) | What the next agent reads before changing anything here |
| [adr/](./adr/) | Decision records |

## Quick start

Install the Tauri CLI and run the app from source:

```bash
cd workspace
npm install
npm start
```

Run both test suites:

```bash
npm test
npm run test:rust
```

The installed build is a macOS dmg from the release page. It is not code signed, so clear the quarantine attribute once after dragging it to Applications:

```bash
xattr -cr /Applications/akbun-makepodcast.app
```

macOS asks for microphone permission the first time you press record. See [wiki/development.md](./wiki/development.md) for what happens if you decline.
