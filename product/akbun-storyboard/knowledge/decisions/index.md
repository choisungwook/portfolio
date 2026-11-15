# Decisions

Decisions made while building akbun-storyboard, with their reasons.

* [One Rust binary serves the web UI, the CLI and the MCP server](2026-11-single-rust-binary.md) - a local server opened in a browser, not a desktop app.
* [Web UI, MCP and CLI share one operation registry](2026-11-one-operation-registry.md) - same operations everywhere; live updates from a revision counter.
* [Import and export the storyboard skills' storyboard.json exactly](2026-11-skill-json-compatibility.md) - lossless round trip with the skills.
* [Images are files in a chosen folder, removed when unused, with sizes shown](2026-11-images-are-files-with-visible-size.md) - disk use stays visible and does not grow from replaced images.
