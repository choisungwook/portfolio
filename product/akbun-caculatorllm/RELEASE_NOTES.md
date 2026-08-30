# Release notes

## 0.3.0

- Split the estimator into Load Model and Run a Workload calculations.
- Reused one model and GPU selection across both calculations.
- Added separate jars, results, and formulas for model-only and workload memory.
- Added FP32, BF16, FP16, FP8, INT8, INT4, AWQ, GPTQ, NF4, GGUF, and custom-bit weight formats.
- Made VRAM capacity and Needed, Available, Free, or Over values more prominent.
- Fixed the OOM result layout and added a fully stacked mobile layout.
- Simplified the header and removed the introductory helper copy.

## 0.2.0

- Replaced throughput planning with a simple single-GPU VRAM estimator.
- Added Hugging Face model loading and local `config.json` upload.
- Added model-weight, KV-cache, and extra-memory formulas with substituted values.
- Added adjustable model precision, KV precision, context, concurrency, GPU capacity, and reserve.
- Added layered liquid visualization with Fits and animated OOM overflow states.
- Removed the lower capacity guidance and primary reference sections.

## 0.1.0

- Added separate prefill and decode capacity budgets.
- Added sustainable RPS, total throughput, hourly volume, and per-GPU throughput.
- Added target utilization, bottleneck, and replica recommendations.
- Added TTFT, inter-token latency, end-to-end latency, and output-speed estimates.
- Added standard-attention KV cache sizing with block rounding.
- Added local persistence, workload presets, expandable formulas, and summary copy.
- Added responsive layouts for desktop, tablet, and phone.
- Added Cloudflare static asset deployment and pull request verification.
