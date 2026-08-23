# Low-impact scan into a replaceable SQLite index

## Decision

Run the full-disk scan in a background-I/O, low-CPU-priority Rust process. Traverse sequentially, stream progress, batch SQLite writes, and build query indexes after traversal. Replace the completed index only after success.

## Reason

Walking the startup disk is unavoidably I/O-heavy. One directory at a time avoids bursts from parallel stat calls, while `taskpolicy -b` and `nice -n 10` let interactive work win disk and CPU time. Batching rows and deferring indexes removes per-item sleeps and repeated B-tree updates without increasing traversal concurrency. Keeping the prior index during a scan makes pause, cancellation, failure, and startup recovery safe.
