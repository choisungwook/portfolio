# Separate loading from running a workload

## Decision

Show two calculations in vertical panels that share one model, weight format, and GPU selection.

- Load Model compares model weights alone with GPU VRAM.
- Run a Workload reuses those model weights and adds KV cache and extra memory.
- Each calculation has its own jar, result, and formula group.
- Both results emphasize Needed, Available, and Free or Over.

## Reason

A model can fail before a request starts because its weights do not fit in GPU memory. Separating the two stages makes that failure distinct from workload OOM caused by context length, concurrency, KV cache, or runtime allocations. Shared model and GPU inputs keep the comparison direct and avoid duplicate settings.
