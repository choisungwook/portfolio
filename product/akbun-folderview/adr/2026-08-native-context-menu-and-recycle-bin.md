# A native right click menu, delete to the Recycle Bin, and Copy means the path

## Decision

Build the right click menu in the main process with `Menu.popup` and resolve it with the chosen action, rather than drawing a menu in the page. Delete moves the file to the Recycle Bin after a native confirmation. Copy puts the file path on the clipboard. Rename reuses the Properties dialog instead of getting a prompt of its own.

## Reason

A menu drawn in HTML has to reimplement everything the system already does: placement near the edge of the screen, keyboard navigation, the platform's own spacing and highlight, and dismissal on a click elsewhere. `Menu.popup` is a real system menu and costs one IPC handler. The renderer sends nothing but the request, gets back an action name, and runs it. That also keeps the list of things a file can have done to it in one place in main, next to the handlers that do them.

Delete goes through `shell.trashItem` rather than `unlink`. This app is where someone keeps photos, and the difference between the two is whether a mis-click is recoverable. The Recycle Bin makes the mistake survivable outside this app entirely, which is worth more than the undo stack that would otherwise have to exist. The confirmation is a native dialog for the same reason as the menu.

Copy is the one place where the obvious meaning is not available. Copying a file so it can be pasted into a file browser needs the clipboard format Windows uses for file drops, and Electron does not expose it. The choices were to write raw clipboard buffers and hope the receiving application reads them, or to do the thing that always works. Copy Path always works, and Show in Folder covers the case where the file itself is what was wanted, by handing it to the system file browser where a real copy is one keystroke away.

Rename has no dialog of its own because a rename is a property of the file, and the Properties dialog was already going to be the place where the name, tags and rating are shown. Two dialogs that both edit a name would be two places to keep in step. Rename opens Properties with the name selected, which is the same number of keystrokes and one fewer piece of code. Electron also disables `window.prompt` in renderers, so the alternative was never one line anyway.
