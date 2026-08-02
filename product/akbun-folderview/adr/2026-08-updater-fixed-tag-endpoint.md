# The updater polls a fixed tag, not releases/latest

## Decision

The updater endpoint is `releases/download/akbun-folderview-updater/latest.json`. After the release action publishes the versioned release, a workflow step copies its `latest.json` to that fixed tag with `gh release upload --clobber`. The fixed release is created once with `--latest=false` and never deleted.

## Reason

This repository releases more than one product, and GitHub's `releases/latest` is repository-wide: it points at whichever release shipped most recently, regardless of product. An endpoint under `releases/latest/download/` therefore serves this app another product's manifest the moment anything else releases. The failure is quiet in the worst way: the foreign manifest carries a version that does not match this app's, the update check reports "up to date", and a newer folderview sits published that no installed copy will ever find. This is not hypothetical — it was observed live, with the repo-wide latest pointing at another product's release while folderview installs polled it.

A fixed tag costs one workflow step and is owned entirely by this product; nothing else in the repository touches it. `--latest=false` keeps the manifest release itself from capturing the repo-wide latest pointer.

Installed copies from before this change still poll the old `releases/latest` URL and are not protected; only copies updated past it are. The alternative that fixes the problem at the root — one repository per product — changes how the whole repository works and is not this product's call to make.
