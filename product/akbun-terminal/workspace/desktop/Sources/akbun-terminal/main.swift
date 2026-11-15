import AppKit

// SwiftPM builds a bare executable, so the app is set up here rather than in a
// nib. scripts/bundle.sh wraps this binary in the .app the release ships.
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.activate(ignoringOtherApps: true)
application.run()
