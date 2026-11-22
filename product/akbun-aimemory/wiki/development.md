# Development

## Run

Node 24 runs the TypeScript sources directly; there is no build output. `npm run build` is only the type check.

```bash
npm ci && npm run build && npm test
```

Use a throwaway home while trying commands so your real memory is untouched.

```bash
AIMEMORY_HOME=$(mktemp -d) node src/cli.ts serve
```

## Tests

`test/core.test.ts` holds only the invariants whose failure loses data or breaks an agent: CJK tokenization, multilingual hybrid search with dedup, export/import round trip, spool fallback and replay, hook exit code 0. All are tagged `[critical]`. Add a test only when a bug would cost the same.

## CI and Release

- `.github/workflows/verify-akbun-aimemory.yml` runs type check, Node tests, and desktop launch crate tests on pull requests.
- `.github/workflows/release-akbun-aimemory.yml` builds and smoke-tests the standalone `aimem` binary (without Node on PATH) on pull requests, and on `master` pushes tags `akbun-aimemory-v<version>` and publishes the macOS Apple silicon CLI archive, desktop `.dmg`, and updater manifest (`akbun-aimemory-updater`) only after the build passes. Bump `workspace/package.json` whenever changing shipped files.

## Reindex performance

Measured on Apple Silicon (Node 24) with 10,000 synthetic multilingual memories (English, Korean, Japanese, Chinese):

| Tokenizer | 10,000 rows `reindex()` |
|---|---|
| `builtin` | ~224 ms |
| `hf-json` (Unigram) | ~328 ms |
| `hf-json` (BPE) | ~338 ms |

## Search benchmark (100k rows)

Run `node bench/benchmark.ts 100000` to verify `sqlite-vec` ANN latency at 100,000 synthetic multilingual memories. Measured on Apple Silicon (Node 24, `sqlite-vec` 0.1.9): p50 91.6 ms, p95 96.6 ms, max 96.9 ms (ANN build ~1.9 s).

## Caveats

- Below `annThreshold` (default 100,000 memories), vector search scans rows in memory. At or above `annThreshold`, `openStore`/`addMemory`/`reindex` automatically switches to the `sqlite-vec` `vec0` virtual table when the optional `sqlite-vec` extension is installed.
- The hashed vectors are lexical, not semantic: synonyms do not match. A local embedding model is an optional upgrade where models are allowed.
- `import` merges into the live database instead of replacing it, so a running hook never sees a missing file.
