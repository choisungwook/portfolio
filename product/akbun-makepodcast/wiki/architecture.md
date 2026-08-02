# Architecture

One window. A Rust backend owns the sound card and the files; the page owns layout, drawing and the arithmetic behind the display. Nothing crosses that line except commands and two events.

## Processes and threads

There is one process, and inside it four kinds of thread matter.

The main thread runs Tauri and the window. Commands are dispatched here.

The webview thread runs the page. It never touches a device or a file.

Audio callback threads are created by the operating system, one per open stream. They are realtime: they must not allocate, block on a lock they can lose, or wait on a file. The capture callback converts the block to `f32`, writes it to the wav through a one megabyte buffer, folds it into the level meter and pushes it into the waveform accumulator. The playback callback pops from a queue, applies volume, meters, and writes to the device.

Two helper threads carry the rest. The poller wakes every 33 ms, asks the engine what happened, and emits window events. The playback reader reads the take from disk and feeds the queue, parking when it is full.

## Files

```text
workspace/
  src/
    index.html        the whole window
    style.css         light base, dark overridden by prefers-color-scheme
    meters.js         pure display arithmetic, tested by node
    api.js            the only bridge to Tauri
    renderer.js       the page: state, drawing, event handlers
  test/
    meters.test.js
  src-tauri/
    Info.plist        merged into the bundle; carries the microphone prompt string
    crates/recorder/  the model: settings, meters, waveform, queue, channel mapping
    src/audio.rs      the only module that touches cpal and hound
    src/commands.rs   the invoke surface
    src/store.rs      settings.json
    src/lib.rs        plugins, setup, the poller
```

## The model crate

`makepodcast-recorder` depends on neither cpal nor tauri. That is what lets the pull request job test it on a Linux runner with no system packages: `cargo test -p makepodcast-recorder` compiles serde and stops.

It holds `Settings`, the `Meter` (peak and RMS with a merge for accumulating between polls), `to_db` and `meter_fraction`, the `PeakAccumulator` that turns frames into waveform columns, the `SampleQueue` between the playback reader and its callback, `map_channels`, the 24 bit conversions, and the take naming and project name sanitizing.

Everything in it is arithmetic over buffers or over strings, and everything in it has a test. That is the rule for what belongs there: if it needs a device, a file or an app handle, it goes in the app crate instead.

## The audio engine

`audio.rs` exposes one `AudioEngine`, held behind a mutex in Tauri state, so at most one recording and one playback exist at a time.

`list_devices` walks the host and returns every input and output with its channel count and sample rate. A device that errors while being described is skipped rather than failing the list, because one bad driver should not hide the interface next to it. Selection is stored as the cpal device id, not the name: two identical interfaces report the same name.

`start_recording` resolves the stored device, falling back to the system default when it is gone, opens the stream at the device's default config, and creates the wav. `stop_recording` drops the stream first, which is what makes finalizing safe: cpal waits for an in flight callback to return, so nothing can be holding the writer by the time it is taken.

`start_playback` opens the file, builds an output stream at the file's sample rate, starts the reader thread, and returns. `poll_playback` reports the position and stops the engine itself when the reader has hit end of file and the queue has drained.

The engine has no idea Tauri exists. `poll_capture` and `poll_playback` return plain structs, and lib.rs turns them into events.

## The command and event surface

Every mutating command returns the whole `Snapshot` and the page redraws from it, so the page never merges a partial update into a copy of its own.

| Command | What it does |
|---|---|
| `get_state` | The snapshot, for load |
| `refresh_devices` | Ask the host again, for an interface plugged in after start |
| `new_project` | Create a folder under the recordings folder and clear track A |
| `start_recording`, `stop_recording` | Track A capture |
| `start_playback`, `stop_playback` | Play the take |
| `save_wav` | Copy the take to a path the page picked |
| `save_settings` | Write settings.json and apply the volume live |
| `open_project_dir` | Show the folder in the file manager |

The snapshot carries the settings, the resolved recordings folder, where settings.json is, the device lists, the project, the take, the status (`idle`, `recording` or `playing`) and the app version.

Two events go the other way, emitted by the poller and only while something is running.

`capture` carries the waveform columns produced since the last poll, the merged input meter, whether the take has clipped, and the elapsed time. `playback` carries the position, the output meter, and whether the take just finished.

## Drawing

The page keeps one array of waveform columns for track A. While recording, columns arrive on `capture` and are appended; when a take finishes, the snapshot carries the whole array and the page adopts it, so a resize or a restart redraws the take rather than an empty canvas.

While recording the canvas shows the tail of the take at three pixels per column, so the waveform travels the timeline and the indicator sits at the head. When the take is finished the whole thing is fitted to the canvas, aggregating columns by maximum rather than average so a short loud sound stays visible. Both views and the ruler marks come out of `meters.js` and are tested there; `renderer.js` only loops over what it is given.

The indicator is a div rather than part of the canvas, so moving it during playback costs no redraw.

## Storage

`settings.json` lives in `~/Documents/akbun-makepodcast/`, next to the recordings, and stays there if the recordings folder is moved. Written through a temp file and a rename. See [adr/2026-08-settings-next-to-recordings.md](../adr/2026-08-settings-next-to-recordings.md).

A project is a folder under the recordings folder. Takes inside it are `take-001.wav` upwards, numbered past the highest name already present, so a deleted take never reopens its number.

## Capabilities

`capabilities/default.json` is short on purpose. The page is allowed to open dialogs, check for updates, restart and exit. Everything that touches a device or a file goes through a command instead, which is why nothing here grants file system scope. A permission missing from that file fails at runtime, not at compile time, so CI stays green and the user's machine does not.
