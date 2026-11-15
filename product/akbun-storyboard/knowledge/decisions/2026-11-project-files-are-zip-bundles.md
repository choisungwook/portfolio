---
type: Decision
title: A project moves as one zip that carries its images
description: Save and open use a zip of project.json plus media/, uploaded and downloaded by the browser rather than typed paths.
tags: [storage, interop]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-15T00:00:00Z }
---

## 결정

`project_bundle` produces `project.json` and `media/<file>` for every image the project uses. The web UI downloads it as `<title>.zip` and opens a zip through a file picker; the CLI and MCP write a zip for a `.zip` path and a folder otherwise. Images are stored uncompressed, JSON is deflated. Loading looks entries up by exact name and never extracts to disk.

## 이유

- A storyboard without its sketches is not useful, and a folder of 40 files is easy to copy half of. One file is what people expect to back up, mail or AirDrop.
- A file picker works on any machine and on an iPad; asking for absolute paths only works on the machine running the server.
- PNG and JPEG are already compressed, so deflating them costs time for no size gain.
- Reading by name instead of extracting rules out zip-slip paths without extra checks.
