# The core owns the project and workspace tree

## Decision

The Rust core owns projects, their workspace children and workspace status names. Every mutation returns the complete tree. The shell only chooses folders and renders the returned state.

The core stores the tree in `projects.json` under the app data directory supplied by the shell. The file starts with `schema_version: 1`; writes replace the file only after the new JSON has been written successfully.

The app is not sandboxed. Folder paths therefore need no security-scoped bookmark. Enabling the App Sandbox later requires adding persisted bookmarks and a schema migration before it can ship.

## Reason

Projects and workspace order must survive a view rewrite and an app restart. Keeping one authoritative copy avoids merging partial mutations in Swift. Status names keep detection in the core and accessibility-aware colour choices in the shell.

Folder selection remains an AppKit concern. A project may have no folder, in which case its terminals use the home directory, and no project path is required to be a Git repository.

## Consequence

The shell must load the store before creating projects or workspaces. Unknown future schema versions fail explicitly instead of silently dropping fields.
