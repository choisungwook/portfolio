# Originals are referenced and never written

## Decision

Import records the absolute path of each photo. Nothing is copied. Edits are stored as numbers in the catalog and applied whenever a picture is drawn. The only files the app writes are the catalog, settings, thumbnails in the cache folder, and exports, which are created with `create_new` so they cannot replace an existing file. The CLI's `render --force` refuses a path that resolves to the original.

## Reason

The people this is for keep photos on external drives because the internal disk is full. Copying on import would fail them on the first folder. Non-destructive editing also means a beginner cannot ruin a photo: Reset All always gets the original back.

Referencing means a moved file or an unplugged drive breaks the link. Photos then show as offline with their tags and edits intact, and Locate… rewrites the folder prefix. That is cheaper than tracking files by content.
