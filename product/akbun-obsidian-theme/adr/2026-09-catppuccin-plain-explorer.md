# Catppuccin palette with a plain explorer

## Decision

Use Catppuccin Latte for light mode and Mocha for dark mode, mapped onto Obsidian's own variables. Give every folder and file in the explorer one muted color and no weight or icon differences beyond a slightly heavier folder name. Render the active file with the accent as background, bold text, and a left marker.

## Reason

The wanted look is AnuPpuccin, and AnuPpuccin is Catppuccin on Obsidian. Reusing the palette keeps the content colors familiar and keeps plugin surfaces coherent, because Obsidian's `--color-*` and `--background-*` variables carry the palette into them.

AnuPpuccin colors folders and files, which makes the sidebar busy and leaves the active file competing with folder colors. Removing every other color from the explorer means the accent appears once, on the open note, and the eye lands there without searching.
