# akbun-obsidian-theme

An Obsidian theme named Akbun. Catppuccin Latte in light mode and Mocha in dark mode, a file explorer with one muted color for every item, an active file that cannot be missed, and heading colors that are single variables.

## What it does

| Feature | How it works |
| --- | --- |
| Palette | Catppuccin Latte and Mocha, mapped onto Obsidian's own variables so plugins pick the colors up too |
| Plain explorer | Folders and files share one muted color; no per-folder or per-extension colors |
| Loud active file | Accent background, bold text, and a marker on the left edge |
| Tunable colors | Headings H1 to H6, bold, italic, link, highlight, accent, and active file are `--akbun-*` variables |
| Style Settings | The same variables appear in the Style Settings plugin with light and dark defaults |

## Directory layout

| Path | Description |
| --- | --- |
| `workspace/theme.css` | The theme: Style Settings block, tunable variables, palette, mapping, component rules |
| `workspace/manifest.json` | Name, version, and minimum app version that Obsidian reads |
| `workspace/test/` | Node tests that run without Obsidian |
| `wiki/` | Structure, release flow, and caveats for the next agent |
| `adr/` | Decision records |
| `knowledge/` | Durable decisions that outlive one task |

## Quick start

Copy the two files into a vault and enable the theme:

```bash
mkdir -p "<vault>/.obsidian/themes/Akbun"
cp workspace/manifest.json workspace/theme.css "<vault>/.obsidian/themes/Akbun/"
```

Then Settings, Appearance, Themes, Akbun. Run the tests from the workspace:

```bash
cd workspace
npm test
```

Release and distribution details are in [wiki/development.md](./wiki/development.md).
