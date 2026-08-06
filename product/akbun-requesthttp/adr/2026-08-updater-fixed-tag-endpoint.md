# The updater polls a fixed per-product tag, not releases/latest

## Decision

The updater endpoint is `releases/download/akbun-requesthttp-updater/latest.json`. After tauri-action publishes a versioned release, the workflow copies its `latest.json` to that fixed tag with `gh release upload --clobber`, and the fixed release is created with `--latest=false`.

## Reason

This repository releases several products, and GitHub's `releases/latest` is repository-wide: it points at whichever product shipped most recently. An endpoint under `releases/latest/download/` therefore serves this app another product's manifest — or a 404 — the moment anything else releases. The failure is quiet: the update check reports no update, or errors, while a newer version sits published.

A fixed tag costs one workflow step and is owned entirely by this product. `--latest=false` keeps the manifest release from hijacking the repo-wide latest pointer that other products' endpoints unfortunately still depend on.

The alternative — one repository per product — fixes this properly but changes how this whole repository works, which is not this product's call to make.
