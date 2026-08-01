# A native right click menu, delete to the Recycle Bin, and Copy means the path

## Decision

Pop a real system menu with the framework's `Menu` API and give each item an action callback, rather than drawing a menu in the page. Delete moves the file to the Recycle Bin after a native confirmation. Copy puts the file path on the clipboard. Rename reuses the Properties dialog instead of getting a prompt of its own.

## Reason

A menu drawn in HTML has to reimplement everything the system already does: placement near the edge of the screen, keyboard navigation, the platform's own spacing and highlight, and dismissal on a click elsewhere. `Menu.popup` is a real system menu and costs one function in `api.js`, which is also the single place listing what can be done to a file.

Each item carries its own action and runs the handler directly. The obvious shape, a menu that resolves a promise with the chosen action, has nowhere to settle when the user clicks away: there is no dismissed event, so that promise would simply never resolve and the caller would be left waiting.

Delete moves the file to the Recycle Bin rather than unlinking it. The standard library has no equivalent, so this is one of the few dependencies in the backend; the Win32 call underneath is easy to get wrong in the direction that deletes permanently, which is not a thing to hand write here. This app is where someone keeps photos, and the difference between trashing and unlinking is whether a mis-click is recoverable. The Recycle Bin makes the mistake survivable outside this app entirely, which is worth more than the undo stack that would otherwise have to exist. The confirmation is a native dialog for the same reason as the menu.

Copy is the one place where the obvious meaning is not available. Copying a file so it can be pasted into a file browser needs the clipboard format Windows uses for file drops. The previous stack could not reach it and the clipboard plugin here does not either; it writes text. The choices were to write raw clipboard buffers and hope the receiving application reads them, or to do the thing that always works. Copy Path always works, and Show in Folder covers the case where the file itself is what was wanted, by handing it to the system file browser where a real copy is one keystroke away.

Rename has no dialog of its own because a rename is a property of the file, and the Properties dialog was already going to be the place where the name, tags and rating are shown. Two dialogs that both edit a name would be two places to keep in step. Rename opens Properties with the name selected, which is the same number of keystrokes and one fewer piece of code. The dialog plugin offers a message and a question and nothing that takes text, so the alternative was never one line anyway.
