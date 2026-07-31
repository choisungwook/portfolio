# Three explicit preview buttons instead of an automatic clipboard copy

## Decision

The preview carries Save, Copy and Close, and each one dismisses it. Save writes the png into the save directory. Copy puts the image on the clipboard. Close keeps nothing. Capture itself no longer touches the clipboard.

## Reason

The first version wrote every capture to the clipboard before the preview even appeared, and the two buttons were Save and Delete. Save meant "also keep a file" and Delete meant "drop the file, the clipboard copy survives". That was one decision fewer to make at capture time, and for a capture-then-paste habit it was right.

It reads as surprising once the file is what you wanted. A capture you intended to keep silently replaced whatever was on the clipboard, and the button named Delete did not delete the thing the user had just seen copied. Two words in the interface described neither what they did nor what was left behind.

Naming the clipboard as its own button removes the guess. Nothing happens to the clipboard unless Copy is pressed, and Save means a file and only a file. The cost is one extra click for the paste habit, which is the case the previous behaviour was tuned for.

The third button is named Close rather than Delete because Delete described the temp file, which is an implementation detail the user never asked to create and never sees. What the user is actually doing is dismissing a preview they do not want to keep, and Close says that whether or not they pressed Copy first.

Copy drops the temp png right after writing it, because the clipboard holds the bitmap rather than a path. Nothing points at the temp file once the preview is gone.
