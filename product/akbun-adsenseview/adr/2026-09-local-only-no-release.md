# Local only, no release

## Decision

No release workflow, no code signing and no updater plugin. The app is built on the owner's machine with `cargo tauri build` or run with `cargo tauri dev`. The only GitHub Actions job is a pull request verify job that runs the cache tests, svelte-check and the Vite build on ubuntu.

## Reason

The app reads one person's AdSense account with their own OAuth client. Nobody else can use a build of it without their own `client_secret.json`, so an installer would have no second user. The product rule that every desktop app ships self update exists so that installed users receive fixes; here there are no installed users, only a source tree that is rebuilt when it changes.

The cost is that the "bump the version or the release fails silently" trap does not apply, which also means nothing enforces a bump. The version is still kept in `package.json` and shown in the window so a stale build is recognizable.
