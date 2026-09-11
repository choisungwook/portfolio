# Selection beats mouse reporting

## Context

A drag across the terminal did not select anything while a CLI agent was running, so the error on screen could not be copied.

SwiftTerm hands the mouse to the program when the program asks for it, and every agent CLI asks for it in order to scroll its own transcript. Two things follow from that default. A drag is forwarded instead of selecting, and every linefeed clears whatever was selected, so even a selection made at an idle prompt does not survive the next line of output.

## Decision

Mouse reporting is off. The emulator keeps the mouse, a drag selects, and a selection survives output.

`View > Mouse Reporting` turns it back on for the window. It is not saved: it is reached for while one program is running rather than chosen once.

The URL menu no longer asks whether the program wanted the mouse, because with reporting off the program never receives the click whatever it asked for.

## Reason

This app exists to run agent CLIs, so the case where selection broke was the only case that mattered. Copying an error out of a transcript is a thing people do many times a day; scrolling with the wheel inside a TUI has the keyboard as an alternative and now also has a switch.

Shift and drag already bypassed reporting in the emulator, but a terminal where the ordinary drag does nothing teaches people that selection is broken rather than that it is modified.
