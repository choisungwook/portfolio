# Development

Node only. No dependencies, no build step, no Obsidian binary needed for the tests.

## Run in a vault

Copy the files, or symlink the workspace so edits show up live:

```bash
ln -s "$(pwd)/workspace" "<vault>/.obsidian/themes/Akbun"
```

Enable the theme under Settings, Appearance, Themes. After a `manifest.json` change restart Obsidian; after a `theme.css` change reselect the theme or reload with the Reload app command.

Inspect with the developer tools (Cmd+Option+I on macOS, Ctrl+Shift+I elsewhere) to find the variable behind an element before adding a selector rule.

## Test

```bash
cd product/akbun-obsidian-theme/workspace
npm test
```

## Version

Bump `version` in both `manifest.json` and `package.json` in the same commit. The test fails when they differ. Obsidian requires the version in the manifest and requires the release tag to equal it, so the manifest is the value that matters; `package.json` mirrors it for the repository rule that products carry their version there.

## Release

`.github/workflows/release-akbun-obsidian-theme.yml`:

- Pull request: `verify` runs the tests.
- Master push: `release` reads the manifest version, skips when the tag `akbun-obsidian-theme-v<version>` already exists, and otherwise creates a release with `manifest.json` and `theme.css` attached.
- Mirror: when the secret `OBSIDIAN_THEME_REPO_TOKEN` exists, the same step clones `choisungwook/akbun-obsidian-theme`, copies `manifest.json`, `theme.css`, `README.md`, and `LICENSE` to its root, pushes, and creates a release tagged `<version>` there.

An unbumped version makes the release step skip silently. Check the master push run after merging a workspace change.

## Dedicated repository

The Obsidian community directory reads `manifest.json` from the root of a repository's default branch and downloads `theme.css` from the release whose tag equals that version. Its registry entry is `owner/repo` with no path, so this monorepo cannot be listed. The mirror repository exists for that listing and for BRAT installs.

To set it up:

1. Create the empty repository `choisungwook/akbun-obsidian-theme`.
2. Create a fine-grained token with contents read and write on that repository and store it as the `OBSIDIAN_THEME_REPO_TOKEN` secret of this repository.
3. Push a workspace change with a new version. The mirror fills on that release.
4. Add a 512 by 288 screenshot to the mirror root and open the submission pull request against obsidianmd/obsidian-releases when ready.

## Caveats

- No screenshot exists yet. The community submission requires one and it has to come from a real Obsidian window.
- `color-mix()` is used for translucent colors. Obsidian ships a recent Chromium, and `minAppVersion` 1.5.0 is well past its support.
- The theme sets `--interactive-accent` directly, so the accent color picker in Obsidian's appearance settings has no effect. Change the accent through Style Settings or `--akbun-accent`.
