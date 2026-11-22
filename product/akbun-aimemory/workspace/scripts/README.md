# Build Scripts

- `build-binary.ts`: builds a standalone `aimem` binary via `bun build --compile`, embedding `ui/` and `skills/` through `src/resources.ts` so the binary runs without Node or a checkout (`node scripts/build-binary.ts [outfile]`).
- Used by `.github/workflows/release-akbun-aimemory.yml` for both the standalone CLI archive (`aimem-darwin-arm64.tar.gz`) and the Tauri desktop sidecar (`aimemory-desktop-darwin-arm64.dmg`).
