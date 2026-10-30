# The updater polls a fixed per-product tag

## Decision

The updater endpoint is `releases/download/akbun-makephoto-updater/latest.json`. After tauri-action publishes a versioned release, the workflow copies its `latest.json` to that tag with `gh release upload --clobber`, and the fixed release is created with `--latest=false`.

## Reason

Several products release from this repository, and GitHub's `releases/latest` points at whichever shipped last. An endpoint under it would serve this app another product's manifest. A fixed tag is owned by this product alone.
