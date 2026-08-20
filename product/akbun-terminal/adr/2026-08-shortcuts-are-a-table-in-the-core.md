# Shortcuts are a table in the core

## Decision

Every menu command is a row in `shortcuts.rs`: an id, a title, which menu it belongs under and the key it ships on. The shell asks for that list and builds the menu bar from it, looking each row's action up by id. Settings › Shortcuts draws the same list and records a new key onto a row.

Only the rows somebody changed are saved, in the state file beside the theme. A key another command already has is refused, with the name of the command that has it.

A shortcut crosses the boundary as a string: `cmd+shift+f`, modifiers in a fixed order and the key last. The core canonicalises it, so `Shift+Cmd+K` and `cmd+shift+k` cannot both sit in the saved map looking like two different shortcuts.

## Reason

The keys were spelled out in the menu builder, which meant a rebindable shortcut would have been a second list that has to agree with the first. One table read by both is what makes them agree by construction.

Saving only the changed rows is what lets a default change later. Storing the whole list would freeze today's defaults into everyone's state file on first launch, and the row nobody has an opinion about would never move again.

Refusing a duplicate rather than sharing it is the difference between a message and a mystery. AppKit runs whichever item it finds first; the other command goes dead with nothing on screen to say why.

A bare letter is refused as a shortcut, because the middle of this window is a shell and every letter belongs to it. Function keys are the exception, since nothing types those.

## Consequence

Adding a command is a row in the core and a selector in `AppDelegate`. A command the core sends that this build has no selector for is skipped rather than drawn as a dead row, so an older shell against a newer core loses the item and nothing else.

Recording a key is a local event monitor that swallows the press. That is what allows a key currently bound to something else to be typed into the window without running it on the way past.
