"""Shared benchmark measurements and result persistence."""

import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class RequestMetric:
  """Store latency and token measurements for one request."""

  ttft_ms: float
  tpot_ms: float
  e2e_ms: float
  output_tokens: int


def percentile(values: list[float], ratio: float) -> float:
  """Return a linearly interpolated percentile."""
  if not values:
    return 0.0
  ordered = sorted(values)
  position = (len(ordered) - 1) * ratio
  lower = math.floor(position)
  upper = math.ceil(position)
  if lower == upper:
    return ordered[lower]
  weight = position - lower
  return ordered[lower] * (1 - weight) + ordered[upper] * weight


def metric_summary(metrics: list[RequestMetric], elapsed_seconds: float) -> dict[str, float]:
  """Aggregate request metrics into serving indicators."""
  ttft = [metric.ttft_ms for metric in metrics]
  tpot = [metric.tpot_ms for metric in metrics]
  e2e = [metric.e2e_ms for metric in metrics]
  output_tokens = sum(metric.output_tokens for metric in metrics)
  return {
    "ttft_p50_ms": percentile(ttft, 0.50),
    "ttft_p95_ms": percentile(ttft, 0.95),
    "tpot_p50_ms": percentile(tpot, 0.50),
    "tpot_p95_ms": percentile(tpot, 0.95),
    "e2e_p50_ms": percentile(e2e, 0.50),
    "e2e_p95_ms": percentile(e2e, 0.95),
    "rps": len(metrics) / elapsed_seconds,
    "output_tps": output_tokens / elapsed_seconds,
  }


async def wait_for_health(base_url: str, timeout_seconds: float = 600) -> dict[str, Any]:
  """Wait for a model server health endpoint."""
  deadline = time.monotonic() + timeout_seconds
  async with httpx.AsyncClient(timeout=10) as client:
    while time.monotonic() < deadline:
      try:
        response = await client.get(f"{base_url}/health")
        if response.is_success:
          try:
            return response.json()
          except json.JSONDecodeError:
            return {"status": "ok"}
      except httpx.HTTPError:
        pass
      await _pause()
  raise TimeoutError(f"Model server did not become healthy: {base_url}")


async def _pause() -> None:
  """Pause between readiness checks."""
  import asyncio

  await asyncio.sleep(5)


async def stream_completion(
  client: httpx.AsyncClient,
  base_url: str,
  model_name: str,
  prompt: str,
  max_tokens: int,
) -> RequestMetric:
  """Measure one streaming OpenAI-compatible completion request."""
  payload = {
    "model": model_name,
    "prompt": prompt,
    "max_tokens": max_tokens,
    "temperature": 0,
    "stream": True,
    "stream_options": {"include_usage": True},
  }
  started = time.perf_counter()
  first_token_at = None
  output_text = ""
  output_tokens = 0
  async with client.stream("POST", f"{base_url}/v1/completions", json=payload) as response:
    response.raise_for_status()
    async for line in response.aiter_lines():
      if not line.startswith("data: ") or line == "data: [DONE]":
        continue
      event = json.loads(line[6:])
      choices = event.get("choices", [])
      text = choices[0].get("text", "") if choices else ""
      if text and first_token_at is None:
        first_token_at = time.perf_counter()
      output_text += text
      usage = event.get("usage")
      if usage:
        output_tokens = int(usage.get("completion_tokens", 0))
  finished = time.perf_counter()
  first_token_at = first_token_at or finished
  if output_tokens == 0:
    output_tokens = max(1, len(output_text.split()))
  ttft = first_token_at - started
  decode = max(0.0, finished - first_token_at)
  tpot = decode / max(1, output_tokens - 1)
  return RequestMetric(ttft * 1000, tpot * 1000, (finished - started) * 1000, output_tokens)


async def fetch_peak_vram_mib(
  prometheus_url: str,
  started_epoch: float,
  finished_epoch: float,
) -> float | None:
  """Read peak framebuffer usage from DCGM metrics for one benchmark window."""
  params = {
    "query": "DCGM_FI_DEV_FB_USED",
    "start": started_epoch,
    "end": finished_epoch,
    "step": "5s",
  }
  try:
    async with httpx.AsyncClient(timeout=20) as client:
      response = await client.get(f"{prometheus_url}/api/v1/query_range", params=params)
      response.raise_for_status()
      series = response.json()["data"]["result"]
    values = [float(value) for item in series for _, value in item["values"]]
    return max(values) if values else None
  except (httpx.HTTPError, KeyError, TypeError, ValueError):
    return None


def save_json(data: dict[str, Any], path: Path) -> None:
  """Write a stable JSON result file."""
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def metrics_to_dict(metrics: list[RequestMetric]) -> list[dict[str, Any]]:
  """Convert request metric records to JSON objects."""
  return [asdict(metric) for metric in metrics]
