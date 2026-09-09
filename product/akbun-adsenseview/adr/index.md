# ADR

Decision records for akbun-adsenseview in "decision - reason" form. Filenames follow `YYYY-MM-<topic>.md`.

## Contents

* [Local only, no release](2026-09-local-only-no-release.md) - No release workflow, no signing and no updater, because the app runs on one machine from the source tree.
* [Tauri with Svelte and TypeScript](2026-09-tauri-with-svelte.md) - Tauri for the small binary, a Svelte page instead of plain JavaScript because the page is tables and a chart over typed rows.
* [Settle days decide what is refetched](2026-09-settle-days-cache.md) - Unsettled days always go to the API, settled days once, and empty days are marked fetched so they are not asked again.
* [OAuth installed-app flow with a loopback port](2026-09-oauth-loopback.md) - The client secret stays in the config folder, the redirect comes back to 127.0.0.1, and the refresh token is a plain file.
* [Rules in Rust, sums in the page](2026-09-rules-in-rust.md) - The page never sees Google or SQLite; it invokes commands and adds up rows.
