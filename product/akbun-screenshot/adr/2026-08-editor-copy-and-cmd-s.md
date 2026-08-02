# Copy in the editor, Cmd+S for save, and a two by two preview

## Decision

The editor toolbar carries Copy next to Save and Save as. It puts the annotated canvas on the clipboard and closes the window, the same ending Save has, and it writes no file. Cmd+S in the editor does what the Save button does. The preview's four buttons are laid out two by two instead of in one row.

## Reason

The preview already had Copy, but going through Edit lost it: the only ways out of the editor were writing a file or throwing the annotations away. A screenshot annotated to be pasted into a chat or an issue had to be saved to disk first and deleted afterwards. The clipboard is a place an image can go, the same as the save directory, so the editor now offers both.

Copy closes the window because that is the shape Save already set: the editor is a place the image passes through, and the two are both ways of being done with it. An editor left open after a copy is a window with nothing left to do, and it is not obvious that a second copy after further edits would replace the first.

Copy reuses the same payload decoder both save paths use. A malformed one leaves the clipboard alone rather than clearing it, which matters more here than on disk, since what the clipboard held before was probably somebody else's.

Cmd+S is checked above the guard that hands a keystroke to a focused toolbar box. That guard exists so Cmd+Z while correcting a font size undoes the digit and not the drawing behind it, but no box on this toolbar has its own use for Cmd+S. A save that depends on where the caret happens to be is worse than the one case the guard protects.

The preview is 280px wide and four buttons across it left each one barely wider than its label, close enough together that the wrong one gets hit. Two by two gives each button room without making the card bigger, and the preview sits over the screen it was taken from, so growing it is not free.
