# Electron menu bar app

## Decision

Built on Electron in plain JavaScript, reusing akbun-screenshot, instead of the Tauri default.

## Reason

- The tray icon is the app's primary and only surface, which is one of the listed reasons to leave Tauri. akbun-screenshot already runs a macOS tray app on Electron.
- Windows and Linux are planned. Electron's Tray, Menu and nativeImage behave the same on all three, and the core modules are plain node with no platform code except the keychain fallback.
- The installer is about 90 MB against under 10 MB for Tauri. For a personal tool that is a download size, not a runtime cost.
