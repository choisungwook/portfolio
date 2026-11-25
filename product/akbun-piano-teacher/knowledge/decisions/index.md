# Decisions

Decisions in "decision - reason" form. File names are `YYYY-MM-<topic>.md`.

## List

* [Electron and TypeScript](2026-11-electron-typescript.md) - Electron instead of the default Tauri, for Web MIDI, camera and node LLM SDKs on macOS and Windows.
* [One package with a core folder](2026-11-single-package-core.md) - `src/core` without electron imports instead of a workspace monorepo; node:test instead of vitest.
* [Codex CLI spawned directly](2026-11-codex-cli-spawn.md) - `codex exec --experimental-json` instead of shipping @openai/codex-sdk; JSON parsed from text for both providers.
* [LLM writes piano-notation, code judges](2026-11-llm-notation-code-judges.md) - short per-measure notation, parser checks and retries; whole pages until P0 measures accuracy.
* [3D piano with virtual hands](2026-11-3d-piano-virtual-hands.md) - a three.js top-down piano where drawn hands follow the score, added on request although the intent document lists 3D as a non-goal.
* [No recording in 0.1.0](2026-11-no-recording.md) - recording, replay, the report and warm-up were removed on request; the analyzer stays in core.
* [Self update per platform](2026-11-self-update-per-platform.md) - macOS dmg swap ported from akbun-k8supgradeview; Windows electron-updater pointed at the release of the found tag.
