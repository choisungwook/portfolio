# Architecture

One CSS file and one manifest. Obsidian loads `theme.css` after its own stylesheet, so almost everything is done by overriding variables Obsidian already reads.

## Layers in theme.css

| Layer | Purpose |
|---|---|
| Style Settings block | A YAML comment the Style Settings plugin parses into a settings page. Ids equal the variable names without the leading dashes |
| Tunable variables | `--akbun-*` on `.theme-light`, `.theme-dark`, and `body`. This is the only block a user edits by hand |
| Palette | `--ctp-*` Catppuccin Latte on `.theme-light` and Mocha on `.theme-dark`, plus `--ctp-*-rgb` triples for callouts |
| Mapping | Obsidian variables assigned once for both modes, pointing at `--ctp-*` and `--akbun-*` |
| Component rules | Selectors for what variables cannot express: the active file row, folder weight, bold and italic color, active tab line |

The mapping is written once for both modes on purpose. Mode differences live in the palette, so a new color only changes in two places.

## Key flows

- **Heading color**: `--akbun-h1-color` feeds `--h1-color`, which Obsidian applies in the editor and the reading view. The inline title uses the H1 color through `--inline-title-color`.
- **Plain explorer**: `--nav-item-color` is `--akbun-explorer-color` for every folder and file. Extension badges are transparent with a faint color.
- **Active file**: `.nav-file-title.is-active` and `.tree-item-self.is-active` take `--akbun-active-file-bg`, `--akbun-active-file-color`, `--akbun-active-file-weight`, and an inset box shadow from `--akbun-active-file-marker`. A box shadow instead of a border keeps the row height unchanged.
- **Style Settings**: the plugin writes `--akbun-*` on `.theme-light` and `.theme-dark` for themed colors and on `body` for numbers. Those rules come after the theme, so the plugin value wins when it is set.

## Surface with Obsidian

| File | Read by |
|---|---|
| `manifest.json` | Obsidian, for the theme name, version, and minimum app version. The folder under `.obsidian/themes/` must equal `name` |
| `theme.css` | Obsidian, as the whole theme |
| Both, attached to a release whose tag equals `manifest.version` | The community directory and BRAT, from a repository whose root holds `manifest.json` |

## Tests

`test/theme.test.js` uses `node:test` and reads the files as text: manifest fields, version agreement with `package.json`, no `@import` or remote assets, balanced braces, every Style Settings id has a CSS default, defaults in the block equal the CSS values, every referenced `--akbun-*` and `--ctp-*` variable is defined, and both palettes list the same names.

The Style Settings block parser is a line parser bound to the shape used in the file: two-space list indent, `- id:` opens an item, four-space fields. Keep that shape or update the parser.
