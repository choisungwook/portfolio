# Stay on Electron, and treat Windows as a port rather than a rebuild

## Decision

Keep Electron and keep the app macOS only. Do not rewrite it in Swift the way akbun-mactaskbar was, and do not carry a Windows build today. If Windows is ever wanted, plan a port of three subsystems rather than a recompile: capture, update, and the tray icon.

## Reason

The question that started this was whether the current code runs on Windows unchanged. It does not, and the reason is not portability sloppiness. It is that the two decisions this app is built on are both macOS decisions.

The first is [capture by the screencapture binary](./2026-07-electron-native-screencapture.md). The whole selection UI, the capture quality and the Esc-to-cancel behaviour are the operating system's, and the app spends four lines getting them. Windows has no equivalent to shell out to. Snipping Tool cannot be driven headlessly into a temp file. The Windows path would be `desktopCapturer`, a full screen transparent always-on-top window per display, a drag rectangle drawn in the renderer, and a crop before writing the png. That is the largest single piece of work, and it is work the macOS version deliberately does not do.

The second is [update by dmg download and bundle swap](./2026-07-update-download-and-swap.md). The swap script is bash calling `hdiutil`, `ditto` and `xattr`, the release asset is a dmg, `pickDmg` filters on `.dmg`, and `appBundlePath` walks up three directories because that is the `.app` layout. Windows has none of those. A Windows updater is a different mechanism, most likely an NSIS installer run silently, and it is a rewrite of `update.js` rather than a branch inside it.

The third is smaller but decides whether the app is visible at all. The menu bar icon is the 📷 emoji set through `tray.setTitle`, and `setTitle` is macOS only. On Windows the `Tray` would be constructed from `nativeImage.createEmpty()`, so it would exist with no icon. A menu bar app nobody can see has not started, as far as the user is concerned. Windows needs a real png.

What that leaves is roughly half the source. `lib.js`, `settings.js`, `preload.js`, the preview renderer and the IPC and settings structure of `main.js` are already portable. So Electron is not the thing blocking Windows. Electron is what makes the portable half portable, and what would let a Windows capture path be added as one more file instead of a second application.

That is also why Swift is the wrong move here, even though it was the right move for akbun-mactaskbar. That app went native because Electron could not reach the APIs it needed: `NSStatusItem.length` for a divider's width, `AXExtrasMenuBar` for a per-process query, and `NSScreen.auxiliaryTopRightArea` to know whether its own icons were hidden under the camera housing. This app needs no AppKit API at all. It asks the system for a screenshot and shows a window. Rewriting it in Swift would buy a smaller bundle and a faster launch, and would cost the working app plus the Windows option, since a Swift rewrite closes the door the current code leaves open.

So the honest summary is that the code is macOS only by decision rather than by accident, Electron is not what is standing in the way of Windows, and the cost of Windows is one new capture module, one new updater and an icon file. That number is worth paying only if somebody actually wants to run this on Windows.
