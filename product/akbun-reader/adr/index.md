# ADR

Decision records for akbun-reader in decision-and-reason form.

## Contents

- [One Worker with D1 on the free tier](2026-09-worker-d1-free-tier.md) - Hosting for one user fits inside the free allowances, and it matches how the other web products deploy.
- [Access for the browser, Worker tokens for automation](2026-09-access-plus-api-tokens.md) - Login code stays at zero and the Worker verifies one thing.
- [PWA and an iOS Shortcut instead of a native app](2026-09-pwa-and-shortcut.md) - A signed iOS app costs more per month than the whole budget.
- [Plain page, no bundler](2026-09-vanilla-page-no-build.md) - Four screens do not justify a build step; the source is what runs.
- [The CLI replaces the macOS sync app](2026-09-cli-replaces-mac-app.md) - Incremental Markdown export needs no window.
- [Public share pages bypass Access on one path](2026-09-public-share-path.md) - A share is a random id in D1; deleting the row revokes it.
