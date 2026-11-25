# Development

All commands run in `workspace/`. Node 24 or later.

## Build and run

Install dependencies.

```bash
npm ci
```

Build and start Electron.

```bash
npm start
```

`npm run build` bundles `dist/main.cjs`, `dist/preload.cjs` and `dist/renderer/app.js` with esbuild and copies the HTML and CSS. The package is `"type": "module"`, so the Electron entry points use `.cjs`.

## Test

Tests import the TypeScript sources directly with `node --test`; no build and no Electron binary.

```bash
npm test
```

Typecheck the whole workspace, including tests and scripts.

```bash
npm run typecheck
```

The update test runs the swap script with bash and expects it to fail at `hdiutil attach`; it works on Linux too.

## Checking the screens without Electron

The renderer only needs `window.api`. Serve `dist/renderer` with a static server and load a script that defines a stub `window.api` returning a sample song (write one with `writeMusicXml` from `core/musicxml.ts`) before `app.js`. Web MIDI is denied in a plain browser; everything else, including OSMD and playback, works.

## Measuring OMR (P0)

`scripts/omr-eval.ts` runs one vision provider over page images and scores the result against an answer MusicXML. Answers for copyrighted pieces go in `test-data/private/`, which is ignored by git.

With Codex, signed in through `codex login`:

```bash
node scripts/omr-eval.ts --engine codex --truth test-data/private/piece.musicxml page1.png page2.png
```

With the Claude API:

```bash
ANTHROPIC_API_KEY=... node scripts/omr-eval.ts --engine claude --truth test-data/private/piece.musicxml page1.png
```

Each run appends a line to `omr-eval-out/results.jsonl`: measure exact rate, pitch F1, onset F1, seconds, tokens and cost. Raw answers are cached, so a second run of the same pages costs nothing.

## Release

`.github/workflows/release-akbun-piano-teacher.yml`: pull requests run typecheck and tests on ubuntu. A push to master builds the dmg (arm64 and x64) on macOS and the NSIS installer with `latest.yml` on Windows, then tags `akbun-piano-teacher-v<version>` and creates the release. Bump `version` in `workspace/package.json` in the same change; an existing tag fails the release.

## Caveats

- Piano samples load from `tonejs.github.io` the first time; offline, a plain synth plays instead. The CSP in `index.html` allows only that host.
- `TimelinePlayer` reports the measure from unrolled time, but the OSMD cursor follows score ticks, so on a repeat the cursor jumps back to the repeat start, which is correct for the eye.
- MIDI import cuts a note at the next onset in the same staff, so held notes under moving ones become shorter in the score (sound and analysis use the cut length too).
- D.S., D.C. and coda jumps are parsed but not followed in playback.
- The vision providers were not run against a real model while building 0.1.0; the adapters are tested with recorded event streams and a fake model.
