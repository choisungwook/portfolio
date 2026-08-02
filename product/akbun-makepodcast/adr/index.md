# ADR

Decision records for akbun-makepodcast in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Tauri with a Rust audio backend](2026-08-tauri-and-rust.md) - The audio layer has to be native, cpal reaches CoreAudio, WASAPI and ALSA behind one API, and the page stays plain HTML.
* [One track, no mixer](2026-08-one-track-and-no-mixer.md) - A solo episode is one interface and one take, and a second track would need sync, mixing and a timeline none of which is written.
* [Takes are 24 bit wav](2026-08-24-bit-wav-takes.md) - The format an interface converts at, with headroom 16 bit does not have and half the size of float.
* [The waveform is columns, pushed by a poller](2026-08-waveform-columns-and-a-poller.md) - The audio callback fills a bucket, a timer sends what is new thirty times a second, and the page appends.
* [Settings sit next to the recordings](2026-08-settings-next-to-recordings.md) - A folder the user can find, back up and delete, rather than a platform data folder they cannot.
* [Playback reads on its own thread](2026-08-playback-reader-thread.md) - A fixed queue between a disk reader and the output callback, and no resampling, because the take plays at the rate it was recorded.
* [macOS only, and the microphone prompt](2026-08-macos-and-microphone-permission.md) - One platform to check the UI on, and an Info.plist string without which recording silently produces silence.
* [The supported updater, on a fixed tag](2026-08-updater-and-release.md) - The plugin rather than a hand written updater, and a tag only this product touches because releases/latest is repository wide.
