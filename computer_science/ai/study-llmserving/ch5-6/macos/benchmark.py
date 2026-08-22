"""Measure real MLX generation latency and memory."""

import json
import statistics
import time
from pathlib import Path

import mlx.core as mx
from mlx_lm import load, stream_generate

WARMUP_REQUESTS = 1
MEASURED_REQUESTS = 5
WORKLOADS = {
  "long-prefill": ("Explain why continuous batching improves GPU utilization. " * 80, 32),
  "long-decode": ("List practical LLM serving checks.", 256),
}


def percentile(values: list[float], ratio: float) -> float:
  """Return the nearest-rank percentile."""
  ordered = sorted(values)
  index = min(len(ordered) - 1, round((len(ordered) - 1) * ratio))
  return ordered[index]


def measure(model, tokenizer, prompt: str, max_tokens: int) -> dict[str, float]:
  """Measure one streamed generation."""
  mx.reset_peak_memory()
  started = time.perf_counter()
  first_token_at = None
  output_tokens = 0
  for response in stream_generate(
    model,
    tokenizer,
    prompt=prompt,
    max_tokens=max_tokens,
  ):
    if response.text and first_token_at is None:
      first_token_at = time.perf_counter()
    output_tokens = response.generation_tokens
  finished = time.perf_counter()
  first_token_at = first_token_at or finished
  decode_seconds = max(0.0, finished - first_token_at)
  return {
    "ttft_ms": (first_token_at - started) * 1000,
    "tpot_ms": decode_seconds * 1000 / max(1, output_tokens - 1),
    "e2e_ms": (finished - started) * 1000,
    "output_tokens": output_tokens,
    "peak_memory_gib": mx.get_peak_memory() / 1024**3,
  }


def summarize(measurements: list[dict[str, float]]) -> dict[str, float]:
  """Summarize repeated MLX measurements."""
  elapsed_seconds = sum(item["e2e_ms"] for item in measurements) / 1000
  output_tokens = sum(item["output_tokens"] for item in measurements)
  return {
    "ttft_p50_ms": statistics.median(item["ttft_ms"] for item in measurements),
    "ttft_p95_ms": percentile([item["ttft_ms"] for item in measurements], 0.95),
    "tpot_p50_ms": statistics.median(item["tpot_ms"] for item in measurements),
    "tpot_p95_ms": percentile([item["tpot_ms"] for item in measurements], 0.95),
    "e2e_p50_ms": statistics.median(item["e2e_ms"] for item in measurements),
    "e2e_p95_ms": percentile([item["e2e_ms"] for item in measurements], 0.95),
    "output_tps": output_tokens / elapsed_seconds,
    "peak_memory_gib": max(item["peak_memory_gib"] for item in measurements),
  }


def run(model_id: str, precision: str) -> None:
  """Load one MLX model and benchmark both fixed workloads."""
  model, tokenizer = load(model_id)
  results = []
  for name, (prompt, max_tokens) in WORKLOADS.items():
    for _ in range(WARMUP_REQUESTS):
      measure(model, tokenizer, prompt, max_tokens)
    measurements = [
      measure(model, tokenizer, f"run-{index} {prompt}", max_tokens)
      for index in range(MEASURED_REQUESTS)
    ]
    results.append({"workload": name, **summarize(measurements)})
  report = {"model": model_id, "precision": precision, "results": results}
  output = Path(f"results/macos-{precision}.json")
  output.parent.mkdir(parents=True, exist_ok=True)
  output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
  print(json.dumps(report, indent=2))
