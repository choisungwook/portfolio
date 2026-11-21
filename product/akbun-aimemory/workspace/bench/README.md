# Search Benchmark

Synthetic 100,000-memory benchmark covering hybrid retrieval (FTS5 BM25 + `sqlite-vec` ANN), access-aware decay, and invalidated-row filtering.

## Run

```bash
cd product/akbun-aimemory/workspace
node bench/benchmark.ts 100000
```

The script generates 100,000 synthetic multilingual rows (5% invalidated via `valid_until`), builds the `sqlite-vec` `vec0` index, runs 32 multilingual queries, and exits non-zero if p95 latency exceeds 200 ms.

## Latest measurement

Measured on Apple Silicon (Node 24, `sqlite-vec` 0.1.9):

| Metric | Result |
|---|---|
| Rows | 100,000 |
| Bulk insert | ~2,008 ms |
| ANN index build (`vec0`) | ~1,886 ms |
| Search p50 | 91.6 ms |
| Search p95 | 96.6 ms (target: <= 200 ms) |
| Search max | 96.9 ms |
