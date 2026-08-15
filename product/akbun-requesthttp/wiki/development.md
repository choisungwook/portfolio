# Development

## Build and run

Development run (opens the desktop app with devtools):

```bash
cd workspace
npm install
npm start
```

Web version locally (worker plus static assets):

```bash
npm run web
```

Release build for the current machine:

```bash
npm run dist
```

## Test

Page logic and the worker proxy under node, no browser, no app binary, no Workers runtime:

```bash
npm test
```

Opening `src/index.html` in a plain browser shows the UI too, but sending fails there: no Tauri and no `/api/proxy`. Use `npm run web` for a browser-testable build.

## Release (desktop)

Push to master with changes under `product/akbun-requesthttp/` and the `release-akbun-requesthttp` workflow builds a macOS dmg, creates the `akbun-requesthttp-v<version>` release, appends the generated change list ("What's Changed") to the release notes, and copies `latest.json` to the fixed `akbun-requesthttp-updater` tag the installed app polls.

Rules that keep releases working:

- Bump `workspace/package.json` version in the same commit as any workspace change. tauri-action republishes over an existing release without failing, so a forgotten bump ships silently stale bits.
- After merging, confirm with `gh release list` that the new version exists.
- Do not delete the `akbun-requesthttp-updater` release; it is the update endpoint, not a real release.
- Pull request CI runs the node tests only; it does not compile the Rust side and does not prove the release job works.

## Deploy (web)

The web version is a Cloudflare Worker defined by `workspace/wrangler.json`: `worker/index.js` plus `src/` as static assets. Deployment follows the same pattern as the other web products in this repository — a Cloudflare Workers build connected to this repository, building on push to master:

- Root directory: `product/akbun-requesthttp/workspace`
- Deploy command: `npx wrangler deploy`

Manual deploy from a machine with Cloudflare credentials:

```bash
npm run deploy
```

## Updater signing key (one-time setup)

The updater refuses anything not signed by the private key, and the public key is baked into `tauri.conf.json`. The key pair lives at `~/.tauri/akbun-requesthttp.key` (generated without a password). If it is ever lost, regenerate with the command below — but installed copies then reject the new key's signatures and never update again, so treat regeneration as a last resort, not maintenance.

Generate a key pair:

```bash
cd workspace
npm run tauri signer generate -- -w ~/.tauri/akbun-requesthttp.key
```

Put the two repository secrets the workflow reads (run from the repository root):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_REQUESTHTTP < ~/.tauri/akbun-requesthttp.key
```

The key has no password, so the password secret is the empty string:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_REQUESTHTTP_PASSWORD --body ""
```

The `pubkey` field of `src-tauri/tauri.conf.json` already holds the matching public key (`~/.tauri/akbun-requesthttp.key.pub`, key contents not file path). Keep them in sync if the pair is ever regenerated.

Two warnings that are easy to learn the hard way:

- **Losing the private key means never updating installed users again.** A repository secret cannot be read back, so keep a copy of `~/.tauri/akbun-requesthttp.key` somewhere that outlives this laptop.
- If the secrets are missing from the release job, no `.sig` is produced and the action skips `latest.json` **without failing**. The release looks green and nobody can update.

## Caveats

- Turning off TLS verification sends requests without checking the server's identity. The setting exists for TLS-inspecting networks and self-signed labs; the settings dialog carries the warning, and the web build cannot do it at all.
- Response bodies are treated as text; binary responses display as lossy text. The size and status are still right.
- `/api/proxy` on the web build is an origin-checked but otherwise open fetch endpoint — anyone scripting against the deployed URL can use it. Cloudflare rate limiting is the backstop; see the ADR before hardening further.
- curl import covers the common flag subset (`-X`, `-H`, `-d`/`--data*`, `--url`, `-A`); form uploads (`-F`) and `@file` bodies are not represented.
- `.http` import recognizes `###` separators, `# @name`/`// @name`, request lines, headers, bodies, and `@name = value` variables. Response-handler scripts and multipart file bodies are not represented.
- The macOS build is unsigned: first launch needs `xattr -cr /Applications/akbun-requesthttp.app`, which the release notes state.
