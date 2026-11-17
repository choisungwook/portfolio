# Development

Nothing here runs yet. This page fixes the stack and the release shape so each phase of [plan.md](./plan.md) builds on the same ground.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript for the server side, JavaScript ES modules with JSDoc for the page |
| Runtime in a checkout | Node 24, running `.ts` files directly by type stripping |
| Type check | `tsc --noEmit` with `erasableSyntaxOnly`, and `checkJs` for `ui/` |
| Tests | `node --test "test/**/*.test.ts"` |
| Release binary | `bun build --compile`, one executable per platform with `ui/` embedded |
| Runtime dependencies | `@modelcontextprotocol/sdk` only. HTTP is `node:http`, crypto is `node:crypto` |

Reuse [akbun-taskq](../../akbun-taskq/wiki/development.md): its `package.json` scripts, `tsconfig.json`, `src/resources.ts` (reading embedded files in a compiled binary) and `scripts/build-binary.ts` solve the same problems. Reasons for the stack are in [the decision](../knowledge/decisions/2026-11-typescript-node-bun-stack.md).

Type stripping forbids `enum` and parameter properties, and imports need the `.ts` extension.

## Commands

Planned `package.json` scripts, run in `workspace/`:

```bash
npm ci
npm run typecheck
npm test
node src/cli/main.ts status
```

Tests must not need a compiled binary, a real home directory or a terminal. Every test sets `AKBUN_KEYCHAIN_HOME` to a temp directory, and core functions take the password as an argument.

## Release workflow

`.github/workflows/release-akbun-keychain.yml` does not exist yet, because a workflow with nothing to build would fail. Phase 7 writes it, modeled on `.github/workflows/release-akbun-taskq.yml`.

| Event | Jobs |
|---|---|
| `pull_request` touching `product/akbun-keychain/workspace/**` or the workflow | `verify` on ubuntu (typecheck, tests), then `build` on all three runners with the smoke test |
| `push` to master touching `src/`, `ui/`, `package.json`, `package-lock.json`, `scripts/build-binary.ts` or the workflow | `build`, then `release` |

Build matrix. Each target builds on its own OS so the smoke test runs the real binary:

| Runner | Target | Artifact |
|---|---|---|
| `macos-latest` | darwin-arm64 | `akbun-keychain-darwin-arm64.tar.gz` |
| `ubuntu-latest` | linux-x64 | `akbun-keychain-linux-x64.tar.gz` |
| `windows-latest` | windows-x64 | `akbun-keychain-windows-x64.zip` |

Smoke test, with `AKBUN_KEYCHAIN_HOME` in a temp directory and no Node on `PATH`: `init --password-stdin`, `unlock --password-stdin`, `set` a value from stdin, `list`, `run` a command that prints the variable and check the output shows `[masked:…]` and not the value, `lock`, then check `run` exits 3.

Release job: read the version from `package.json`, create and push the tag `akbun-keychain-v<version>`, create the release with the three archives. Build, then tag, then release, so a failed build leaves no tag.

Rules that apply when writing it:

- Register the workflow in `.github/scripts/checks/product-versions.json` with `version_file` `product/akbun-keychain/workspace/package.json`, `tag_prefix` `akbun-keychain-v`, `existing_tag` `fail`.
- Top-level `permissions: contents: read`; only the release job gets `contents: write`.
- Check the latest stable major of every action and of bun at that time. Do not copy the pins from this page or from another workflow without checking.
- Release notes include the unsigned-binary steps: on macOS `xattr -d com.apple.quarantine akbun-keychain` after a browser download; on Windows "More info" then "Run anyway" on the SmartScreen warning.
- Bump `package.json` version in any commit that changes a path the push trigger watches.

## Verified and not verified

Checked on 2026-11-17 with one script run under Node 22 and bun 1.4.4 on Linux:

| Item | Result |
|---|---|
| `crypto.scryptSync` with N=2^17, r=8, p=1, `maxmem` 256 MiB | Works on both, about 0.4 seconds |
| AES-256-GCM with AAD; changed AAD rejected | Works on both |
| `crypto.hkdfSync` | Works on both |
| `node:net` Unix domain socket server and client | Works on both |
| `fs.openSync(path, 'wx')` fails with `EEXIST` on the second call | Works on both |
| `crypto.argon2Sync` | Present in bun 1.4.4, absent in Node 22 |

Not checked. Phase 0 of the plan settles these before anything depends on them:

- Windows named pipes through `node:net` in a bun-compiled binary.
- Hidden terminal input in a bun-compiled binary on Windows.
- `@modelcontextprotocol/sdk` stdio server inside a bun-compiled binary.
- A detached child that outlives its parent on Windows.
- Binary size.

## Caveats

- A Unix socket path is limited to about 104 bytes. If `<home>/agent.sock` is longer, put the socket in a 0700 directory under the OS temp directory and record the path in `agent.json`.
- `agent.json` can outlive a killed agent. Every client checks that the pid is alive before using it and removes a stale file.
- The page has no build and no framework. Check it with `.claude/scripts/verify-page.mjs` against a running `gui --no-open`.
