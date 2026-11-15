---
type: Decision
title: Images are files in a chosen folder, removed when unused, with sizes shown
description: Sketches and photos are stored as files, not database blobs, and disk use is always visible.
tags: [storage, media]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-15T00:00:00Z }
---

## 결정

Each image is `<media_root>/<id>.<ext>`, with the type taken from magic bytes. `media_root` defaults to `<data>/media` and can be changed in Settings, which moves the existing files. Replacing a scene's image, deleting a scene, idea or project deletes the files nothing else uses. Sizes are shown per image, per project and in total, and Settings can delete leftover unused images.

## 이유

- Generated sketches are 2 to 3 MB each, so one 40-scene project is around 90 MB. The person is sensitive to disk use, so it must be visible and must not grow from replaced images.
- Files keep the database small and let the person put images on another disk or a synced folder without moving the database.
- Cleanup on replace is targeted at the old id only. A blanket sweep could delete an image uploaded a moment ago but not yet attached, so the manual sweep skips images younger than a minute.
