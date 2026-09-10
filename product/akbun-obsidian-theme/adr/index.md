# ADR

Decision records for akbun-obsidian-theme in decision-and-reason form.

## Contents

- [Source in the monorepo, listing through a mirror repository](2026-09-monorepo-source-mirror-repo.md) - The community directory needs manifest.json at a repository root, so the release mirrors the files out instead of moving the source.
- [Catppuccin palette with a plain explorer](2026-09-catppuccin-plain-explorer.md) - Keep the AnuPpuccin colors for content and strip color from the sidebar so the active file stands alone.
- [Colors as variables with a Style Settings block](2026-09-variables-and-style-settings.md) - One variable per tunable color, edited in the file or from the plugin, with a test that keeps both in step.
