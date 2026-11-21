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

## CI

`.github/workflows/verify-akbun-aimemory.yml` runs the type check and tests on pull requests. There is no release job yet, so the version in `package.json` does not create a tag.

## Reindex performance

Measured on Apple Silicon (Node 24) with 10,000 synthetic multilingual memories (English, Korean, Japanese, Chinese):

| Tokenizer | 10,000 rows `reindex()` |
|---|---|
| `builtin` | ~224 ms |
| `hf-json` (Unigram) | ~328 ms |
| `hf-json` (BPE) | ~338 ms |

## Caveats

- Vector search scans every row. Past about 100k memories, move to an ANN index such as sqlite-vec.
- The hashed vectors are lexical, not semantic: synonyms do not match. A local embedding model is an optional upgrade where models are allowed.
- `import` merges into the live database instead of replacing it, so a running hook never sees a missing file.
