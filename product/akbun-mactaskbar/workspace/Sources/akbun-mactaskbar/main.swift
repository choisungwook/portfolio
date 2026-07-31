import AppKit

// Menu bar app: accessory activation policy means no dock icon and no menu of
// its own, so the status items are the whole surface. The bundle also carries
// LSUIElement, which covers the moment before this line runs.
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
