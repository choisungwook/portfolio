# CLI reference

`makephoto` works on the same catalog as the app, with or without the app open. Every command prints JSON on stdout. Errors go to stderr with exit code 1, and a failed command writes nothing.

## Global option

`--catalog <file>` uses another catalog. Otherwise `MAKEPHOTO_CATALOG`, then the app's own.

## Commands

| Command | What it does |
|---|---|
| `info` | Catalog path, revision, photo, folder and tag counts |
| `import <paths>...` | Add files or folders (recursive, hidden files skipped). Returns added ids |
| `list [--folder F] [--tag T] [--search S] [--min-rating N]` | Photo summaries with `edited` and `missing` |
| `show <id>` | One photo with its full edit |
| `tag <ids>... --add T --remove T` | Repeatable; tags are trimmed and capped at 64 characters |
| `rename-tag <from> <to>` | Everywhere |
| `tags`, `folders` | Names with photo counts |
| `rate <0-5> <ids>...` | Star rating |
| `remove <ids>...` | Out of the catalog; files are untouched |
| `relink <from> <to>` | Move a path prefix, for a drive that mounts under a new name |
| `edit <id> [--set name=value]... [--look id\|none] [--crop x,y,w,h\|none] [--from id] [--reset]` | Change values; anything not named is kept |
| `auto <ids>... [--kind K]... [--dry-run]` | Measure and set; kinds are straighten, color, brightness, light, contrast, vivid. Default is all |
| `render <id> --out file.jpg [--size N] [--force]` | A preview JPEG; refuses to write over the original |
| `export <ids>... --dir D [--quality N]` | Full-size JPEGs, never replacing a file |
| `looks` | Film look ids, labels and descriptions |
| `fields` | Every `--set` name with its range |

## Edit values

Ask the tool with `makephoto fields`. As of writing: `exposure` −3..3 (stops), `contrast`, `highlights`, `shadows`, `warmth`, `tint`, `vibrance`, `saturation` −100..100, `straighten` −45..45 (degrees clockwise), `rotate` 0..3 (quarter turns), `look_amount` 0..100. Out-of-range values are clamped.

A crop is in fractions of the straightened frame: `--crop 0.1,0.1,0.8,0.8` keeps the middle 80%. Rotating drops a crop in the app, because the frame it refers to has turned.

## Patterns for agents

- Read `auto ... --dry-run` notes before saving: they say when the level step found no reliable line.
- `edit <id> --from <other>` copies a whole edit, crop included; the app's Paste Edit keeps each photo's own crop and straighten.
- The app picks up changes within two seconds. There is nothing to restart.
