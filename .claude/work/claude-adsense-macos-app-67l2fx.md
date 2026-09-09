# akbun-adsenseview: local-only macOS Tauri app for AdSense earnings

- Issue: (none yet)
- Branch: claude/adsense-macos-app-67l2fx

## 실행 계획

- [x] 1. Rust cache crate (plan.rs missing days, store.rs sqlite upsert) + tests
- [x] 2. Rust app: auth.rs, adsense.rs, commands.rs, lib.rs, tauri config
- [x] 3. Svelte + TS page (sidebar, summary, chart, table, site rollup)
- [x] 4. Verify: cargo test -p adsense-cache, vite build, svelte-check, cargo check (app crate if deps allow)
- [x] 5. README, wiki, adr
- [x] 6. verify workflow, product/README, root README, products.json

## 다음 세션이 알아야 할 것

- User overrides skill: no release, no signing, no updater. Record in ADR.
- Frontend Svelte + TS per user request (deviation from plain JS rule), recorded in ADR.
