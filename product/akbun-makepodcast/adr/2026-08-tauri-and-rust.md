# Tauri with a Rust audio backend

## Decision

Build the app on Tauri v2 with the audio layer in Rust, using `cpal` for devices and streams and `hound` for wav. The page stays plain HTML, CSS and JavaScript with no build step, as in the other Tauri products here. C++ and Swift were considered and not taken.

## Reason

Recording audio is the one thing in this app that a webview cannot do well enough. The Web Audio API can open a microphone, but it cannot enumerate an interface by name, cannot say how many channels it has, and gives no control over the sample format that reaches disk. Selecting a specific audio interface is the first requirement, so the audio layer has to be native. That decides the backend language before anything else does.

Rust was chosen there because `cpal` already is the cross platform layer that would otherwise have to be written: CoreAudio on macOS, WASAPI on Windows, ALSA on Linux, behind one trait. Writing the same thing in C++ means either three backends by hand or a dependency like PortAudio or RtAudio plus a build system to carry it. The saving is not the language, it is not writing the abstraction.

Swift would have been the shortest path to AVAudioEngine on macOS and was rejected for the same reason it was rejected in akbun-mactaskbar's ADR, in reverse. That app went native because Electron could not reach the AppKit APIs it needed; here Rust reaches everything the app needs, and going native would close the door on a Windows build without buying anything today.

Tauri over Electron follows the repository default and is unremarkable here. The page is a menu bar, a canvas, some selects and two meters, all of which the system webview draws. What it buys is an installer of a few megabytes and a backend that is already the language the audio layer wants to be in. Electron would have meant either a native node addon around the same C libraries or shipping the audio through Web Audio, which is what this decision was avoiding.

The cost is that the app is now two languages, and the boundary has to be watched. Everything that touches a device or a file is a command; the page does layout, drawing, and the arithmetic in `meters.js`. That split is the same one the other products use, and it is what keeps both sides testable without an app binary.

The second cost is smaller but real: `cpal` is the only dependency in this repository that needs system development packages to compile on Linux. The pull request job never compiles it, because the model that is worth testing sits in a crate that does not depend on it.
