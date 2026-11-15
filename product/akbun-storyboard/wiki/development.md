# Development

## Build and run

Rust stable is the only requirement; SQLite is bundled by `rusqlite`.

Run the web UI against a throwaway data folder inside `target/`:

```bash
cd product/akbun-storyboard/workspace
cargo run -- --data target/dev-data serve --open
```

The web files are compiled in with `include_str!`, so restart `serve` after editing `web/`. The repository's `.claude/launch.json` has an `akbun-storyboard` entry that runs the same command on port 4780.

Seed it with a real storyboard from the storyboard skills:

```bash
cargo run -- --data target/dev-data project_import path=/abs/storyboard-output/demo/storyboard.json
```

## Test

Tests cover CRUD and ordering, the revision counter, image type checks and cleanup, skill import/export round-trip, project save/load, moving the image folder, and that every listed operation dispatches. They need no browser.

```bash
cargo test
```

Check the MCP server by piping JSON-RPC lines into it:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | cargo run -q -- --data target/dev-data mcp
```

## Release

`.github/workflows/release-akbun-storyboard.yml` runs `cargo build` with warnings as errors and `cargo test` on pull requests. On master it builds macOS arm64 and x86_64, Linux x86_64 and Windows x86_64 archives, creates the tag `akbun-storyboard-v<version>` after every build succeeds, and publishes the release.

The version is `version` in `workspace/Cargo.toml`. Bump it in the same commit as any change under `workspace/`, or the PR version check fails and master's release stops on the existing tag. `Cargo.lock` is committed because builds use `--locked`.

## Caveats

- Schema changes: tables are created with `CREATE TABLE IF NOT EXISTS`, which does not add columns to an existing database. A new column needs an `ALTER TABLE` guarded by a column check in `Store::open`.
- Scene numbers in `music` ranges and in `answer_scene` are positions; moving scenes shifts what they point to, as in the skill format.
- `serve` handles one request at a time. Large image uploads block other requests until they finish.
- Big images are not resized. MCP `media_view` falls back to returning the path above 1 MB.
