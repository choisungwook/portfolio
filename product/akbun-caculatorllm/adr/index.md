# ADR

Decision records for akbun-caculatorllm in decision-and-reason form.

## Contents

- [A Vite static page on Cloudflare](2026-08-vite-static-cloudflare.md) - The product is an interactive browser tool, so a small bundler and static asset deployment are enough.
- [Measured throughput is the capacity input](2026-08-measured-throughput-input.md) - Production-like benchmark rates are more defensible than hardware-only theoretical estimates.
- [Prefill and decode remain separate budgets](2026-08-separate-token-budgets.md) - Adding token rates before converting them to requests hides the actual bottleneck.
- [Latency and KV cache stay explicit estimates](2026-08-explicit-estimates.md) - Useful planning arithmetic belongs in the tool only when its assumptions remain visible.
