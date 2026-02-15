---
name: markdown-to-html-pandoc
description: >
  Convert Obsidian markdown to HTML using pandoc for blog platforms like Tistory.
  Obsidian image syntax (![[...]]) is preserved as plain text markers so the user
  knows where to manually insert images. Headers, code blocks, and other markdown
  elements are converted normally. Use this skill when the user wants to convert
  markdown to HTML with pandoc or export Obsidian notes for blog upload.
  Trigger on: "markdown to html", "pandoc convert", "tistory", "obsidian to html",
  "blog upload".
---

# Markdown to HTML with Pandoc

## Problem

Blog platforms like Tistory do not support API-based uploads. Content must be
copy-pasted manually. Obsidian uses local image syntax (`![[path/to/image.png]]`)
which is not standard markdown, so pandoc cannot render it as an `<img>` tag.

Instead, pandoc leaves `![[...]]` as **plain text** in the HTML output. This is
useful because the text markers show where images need to be manually inserted
in the blog editor.

All other markdown elements (headers, code blocks, lists, bold, links, etc.)
are converted to HTML normally.

## Prerequisites

- `pandoc` installed via Homebrew (`brew install pandoc`)
- `$OBSIDIAN_VAULT` environment variable set in `~/.zshrc`:

```sh
# Add to ~/.zshrc
export OBSIDIAN_VAULT="your obsidian path"
```

Use `~` relative paths. Never use absolute paths like `/Users/username/...`.

## Usage

Run the bundled script with the Obsidian file path:

```sh
bash scripts/md-to-html.sh "$OBSIDIAN_VAULT/my-post.md"
```

Output goes to `~/Downloads/<filename>.html`.

## What the Script Does

1. **Converts markdown to standalone HTML** - Runs `pandoc -s` to produce a
   complete HTML document with `<html>`, `<head>`, `<body>` tags (the
   `-s`/`--standalone` flag ensures the output is a valid HTML file, not a fragment)
2. **Preserves line breaks** - Uses `-f markdown+hard_line_breaks` so single
   newlines become `<br />` tags, matching Obsidian's line break behavior
3. **Preserves image markers** - Obsidian `![[...]]` syntax stays as plain text,
   serving as placeholders for manual image insertion
4. **Outputs to ~/Downloads** - Ready for copy-paste into blog editor

## After Export

1. Open the generated HTML in a browser or text editor
2. Copy the content and paste into the blog editor (HTML mode)
3. Find the `![[...]]` text markers and manually upload images at those positions

## Script Location

`scripts/md-to-html.sh` - See script comments for detailed explanation
of each flag and step.
