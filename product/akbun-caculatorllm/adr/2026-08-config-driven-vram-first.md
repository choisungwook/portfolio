# Config-driven single-GPU VRAM comes first

## Decision

Make single-GPU VRAM fit the only primary calculation. Load a Hugging Face model ID or local `config.json`, then calculate model weights, KV cache, adjustable extra memory, and total needed VRAM.

Prefer exact Hugging Face parameter metadata. Estimate parameters from config only for supported decoder-only shapes and require manual input otherwise. Show every substituted formula and represent the three memory groups as layered liquids that overflow on OOM.

This decision supersedes the measured-throughput, separate-token-budget, and latency sections as product features. Their records remain as history.

## Reason

A user must know whether the model can load before estimating serving throughput. Limiting the first tool to one GPU removes deployment topology and benchmark vocabulary from the main path. Visible formulas and liquid layers make both the total and the cause of OOM understandable without prior serving knowledge.
