# Source in the monorepo, listing through a mirror repository

## Decision

Keep the theme source under `product/akbun-obsidian-theme/workspace/` and release from this repository with `manifest.json` and `theme.css` attached. Add a mirror step that pushes the same files to the root of `choisungwook/akbun-obsidian-theme` and tags a release there, gated on a token secret so the step is a no-op until that repository exists.

## Reason

Obsidian itself does not care where a theme comes from: a folder under `.obsidian/themes/` with the two files is a working install, so the monorepo works for manual installs and for release downloads. What does not work is the community directory. It reads `manifest.json` from the root of the default branch, downloads the two files from the release whose tag equals `manifest.version`, and its registry entry is `owner/repo` with no path. A subdirectory cannot be listed.

Moving the source out would cost the shared rules, workflows, and indexes of this repository for a two-file product. A mirror keeps the source here and gives the directory the shape it wants. The mirror is driven by the same release step so the two repositories cannot drift by hand.
