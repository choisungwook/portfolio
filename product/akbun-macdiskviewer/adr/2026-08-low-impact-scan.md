# Low-impact scan into a replaceable SQLite index

## Decision

Run the full-disk scan in a low-priority Rust process. Traverse sequentially, yield regularly, stream progress, and write a new SQLite index that replaces the completed index only after success.

## Reason

Walking the startup disk is unavoidably I/O-heavy. One directory at a time avoids the bursts caused by parallel stat calls, and lower OS priority lets interactive work win CPU time. SQLite keeps millions of entries out of the renderer heap and supports paging and sorting without loading the catalog at once. Keeping the prior index during a scan makes pause, cancellation, failure, and startup recovery safe.
