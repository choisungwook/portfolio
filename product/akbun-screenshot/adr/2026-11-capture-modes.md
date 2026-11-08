# Window and fullscreen capture as screencapture flags

## Decision

The menu bar menu has Capture Area, Capture Window and Capture Fullscreen, and each can have its own global shortcut. A mode is only a different set of `screencapture` flags, kept in `screenshot_core::capture::CaptureMode`. Fullscreen captures the main display. The window and fullscreen shortcuts start unassigned.

## Reason

Area capture already delegated the selection UI to `screencapture`, which also knows how to pick a window (`-w`) and how to grab a display without asking (`-m`). Drawing a window picker or a display picker in the app would duplicate what the system does better, so a mode is a row of flags and nothing else. The flags live in the pure crate so the one thing that differs between modes is covered by `cargo test -p screenshot-core`.

Fullscreen asks for the main display only. Without `-m`, `screencapture` wants one output path per display, and the preview window shows one image. Capturing every display would mean as many previews or a stitched image, neither of which anyone asked for yet.

The new shortcuts default to empty because every obvious key is taken by macOS, and because `Settings::merge` drops an empty stored string and keeps the default. A non-empty default would come back the next time the app started, after the user had cleared it on purpose.

Capture moved out of `windows.rs` into its own `capture.rs`, so window management and starting a capture are separate modules, and the busy flag that stops a second selection became its own managed state instead of a field on the window map.
