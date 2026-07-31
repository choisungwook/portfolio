# Camera housing decides visibility, not the screen edge

## Decision

Judge whether a status item is visible by comparing its x against `NSScreen.auxiliaryTopRightArea.minX`, not against zero. Use the same test on the app's own control icon, and when it fails, open the item list window on launch and offer a system-wide shortcut so the app can still be driven.

## Reason

On a display with a camera housing the menu bar is split in two, and status items only ever land in the right half. An item that does not fit there is placed under the housing, keeps a perfectly ordinary positive x, and is drawn nowhere.

This was found by measuring a full bar on a 1728pt display. `auxiliaryTopRightArea.minX` reported 956. The leftmost item macOS actually drew was at 993, and four items belonging to other applications sat between 878 and 955, invisible while reporting positive coordinates. Treating x as the answer would have called all four visible, which makes the item list confidently wrong about the one thing it exists to report.

The second use is the one that matters more. macOS gives a new status item the leftmost free slot, so on a bar with no room left this app's own control icon lands under the housing. The app then runs correctly and looks like it never started: no dock icon, no window, no icon. That is not an edge case, it is the bar this app is built for.

There is no way to fix it from inside the app. Where an item goes is macOS's decision, and nothing here can make room or move an icon that belongs to somebody else. What the app can do is notice. `controlIsHidden` compares the control item's window frame against the same geometry, and when it is true the item list window opens on launch, carrying every action the icon would have offered and an explanation of why the icon is missing. Launching the app again reopens that window, so closing it is not a dead end.

A Carbon hotkey covers the same case from anywhere, and it was chosen over an `NSEvent` monitor because it needs no accessibility permission and consumes the key. Consuming the key is also its cost: a combination claimed system-wide is one taken from whatever else wanted it, and macOS offers no way to ask what that might be. A second registration of a combination another app already owns can succeed and simply never fire, so there is nothing to detect and report.

That is why the combination is a setting rather than a constant. The window offers three choices and an off switch, and changing it re-registers immediately, so a clash is something the user can walk out of instead of a reason to stop using the shortcut.

Getting the icon itself back is the user's move: free room to the right of the housing, then Command-drag the icon there. `autosaveName` on all three status items makes that stick.
