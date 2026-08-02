# macOS only, and the microphone prompt

## Decision

The release job builds a macOS dmg and nothing else. `src-tauri/Info.plist` carries `NSMicrophoneUsageDescription`, which the bundler merges into the app bundle.

## Reason

Tauri renders in each platform's own webview, so every platform shipped is a platform the UI has to be checked on. Shipping one keeps that honest. macOS is the one because it is where the interface and the microphone this app was written for are plugged in, and because CoreAudio is the backend `cpal` is most predictable on.

Nothing in the code is macOS specific. `cpal` and `hound` build on all three platforms, the page is flexbox and a canvas, and the release job is a runner label and a bundle target. Adding Windows later is a second job and a check of the window on that webview, not a port. It is not done now because an untested artifact is worse than no artifact.

The Info.plist entry is the part that has to be right the first time, because getting it wrong fails silently. Without `NSMicrophoneUsageDescription`, macOS does not prompt and does not refuse either: the input stream opens, every callback delivers zeroes, and the app draws a flat line with no error anywhere to explain it. The user concludes the app is broken and there is nothing in a log to say otherwise. Any future entitlement the app needs belongs in the same file for the same reason: a permission that is missing here is a runtime symptom, not a build failure.

The string in it is what the user reads in the prompt, so it says what the app does with the microphone and where the recording goes rather than repeating the app's name.

Denying the prompt has the same symptom as omitting the key, and the release notes say so. That is the only mitigation available: an app cannot distinguish "the user said no" from "this input is silent" without asking the permission API directly, and the take is genuinely silent in both cases.
