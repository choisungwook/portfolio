# Known themes ship in the core as data

## Decision

The colour schemes people already know by name — Dracula, Nord, Solarized, Gruvbox, Tokyo Night and the rest — are a table in the core. Each row is a name, a background, a foreground, a cursor and sixteen ANSI colours written as `#rrggbb`. The chosen name is saved next to the project tree and applied to every open terminal.

The default is `System`, which has no colours of its own.

## Reason

Colours written as hex are what every published scheme is already written in, so adding one is a paste rather than a conversion. Keeping them in the core means the saved name and the palette it refers to cannot disagree, and a second shell would show the same window.

`System` stays the default because it is the only setting that follows dark and light mode on its own. A named theme is a decision to stop following the system, and that should be something someone chose.

The list is short on purpose. Every known collection has hundreds; a dozen covers what people ask for by name, and the table is where the rest go if they are.

## Consequence

A theme is picked from the View menu and applies immediately to every tab, including ones already running.

The shell refuses a palette it cannot fully parse and falls back to the system appearance, so a typo in a row shows up as a theme that does nothing rather than as black text. A test in the core checks every row is sixteen readable colours, which is what keeps that from happening.
