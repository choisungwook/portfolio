#!/bin/zsh
#
# md-to-html.sh
#
# Convert Obsidian markdown to blog-ready HTML.
# Obsidian image syntax (![[...]]) is NOT standard markdown, so pandoc
# leaves it as plain text in the HTML output. This is intentional:
# the text markers show where images should be manually inserted
# in the blog editor.
#
# Usage:
#   ./md-to-html.sh <file1.md> [file2.md ...]
#
# pandoc flags:
#   -s (--standalone): Produces a complete HTML document with <html>, <head>,
#     <body> tags. Without -s, pandoc outputs only an HTML fragment.
#   -f markdown+hard_line_breaks+autolink_bare_uris:
#     hard_line_breaks: Treats single newlines as <br /> tags.
#       By default, pandoc ignores single newlines (standard markdown behavior).
#       Obsidian treats single newlines as line breaks, so this flag preserves
#       the paragraph spacing as seen in Obsidian.
#     autolink_bare_uris: Converts bare URLs (e.g. https://example.com) into
#       clickable <a> links automatically.
#
# Output: ~/Downloads/<filename>.html

for f in "$@"
do
  filename=$(basename "$f")
  base="${filename%.*}"

  output=~/Downloads/"$base".html
  /opt/homebrew/bin/pandoc -s -f markdown+hard_line_breaks+autolink_bare_uris --metadata title="$base" "$f" -o "$output"

  # Post-processing: add extra <br /> for paragraph spacing
  # 1. After </p> tags: double line break between paragraphs
  # 2. After </div> (code block closing): double line break after code blocks
  # 3. After image markers (![[...]]): double line break after images
  sed -i '' \
    -e 's|</p>|</p><br />|g' \
    -e 's|</div>|</div><br />|g' \
    -e 's|!\[\[.*\]\]|&<br />|g' \
    "$output"

  # Remove extra <br /> ABOVE code blocks (only keep below)
  perl -0777 -pi -e 's|</p><br />\n<div class="sourceCode"|</p>\n<div class="sourceCode"|g' "$output"

  echo "Converted: $output"
done
