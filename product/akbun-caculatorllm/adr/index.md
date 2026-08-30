# ADR

Decision records for akbun-caculatorllm in decision-and-reason form.

## Contents

- [A Vite static page on Cloudflare](2026-08-vite-static-cloudflare.md) - The product is an interactive browser tool, so a small bundler and static asset deployment are enough.
- [Config-driven single-GPU VRAM comes first](2026-08-config-driven-vram-first.md) - The first question is whether model weights, KV cache, and extra memory fit in one GPU.
- [Measured throughput is the capacity input](2026-08-measured-throughput-input.md) - Superseded product direction retained as history.
- [Prefill and decode remain separate budgets](2026-08-separate-token-budgets.md) - Superseded product direction retained as history.
- [Latency and KV cache stay explicit estimates](2026-08-explicit-estimates.md) - Superseded product direction retained as history.
