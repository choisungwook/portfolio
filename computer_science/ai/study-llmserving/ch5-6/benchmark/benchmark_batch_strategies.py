"""Compare request admission strategies in front of one vLLM server."""

import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

from benchmark.common import (
  RequestMetric,
  fetch_peak_vram_mib,
  metric_summary,
  percentile,
  save_json,
  stream_completion,
  wait_for_health,
)

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_LABEL = os.getenv("MODEL_LABEL", "bf16")
MAX_NUM_SEQS = int(os.getenv("VLLM_MAX_NUM_SEQS", "8"))
MAX_NUM_BATCHED_TOKENS = int(os.getenv("VLLM_MAX_NUM_BATCHED_TOKENS", "4096"))
REQUEST_COUNT = 24
BATCH_SIZE = 8
MAX_DELAY_MS = 20
ARRIVAL_INTERVAL_MS = 5
OUTPUT_LENGTHS = [32, 128, 64, 256, 48, 192, 96, 224]


@dataclass(frozen=True)
class RequestSpec:
  """Describe one logical request and its arrival time."""

  index: int
  namespace: str
  arrival_ms: int
  max_tokens: int


@dataclass(frozen=True)
class MeasuredRequest:
  """Store serving latency with client-side admission delay."""

  request: RequestSpec
  admission_ms: float
  completed_ms: float
  metric: RequestMetric


@dataclass(frozen=True)
class BatchPlan:
  """Describe when a dynamic admission batch is released."""

  dispatch_ms: int
  requests: tuple[RequestSpec, ...]


Dispatcher = Callable[
  [httpx.AsyncClient, list[RequestSpec], float],
  Awaitable[list[MeasuredRequest]],
]


def build_requests(namespace: str) -> list[RequestSpec]:
  """Build a deterministic heterogeneous arrival stream."""
  return [
    RequestSpec(
      index=index,
      namespace=namespace,
      arrival_ms=index * ARRIVAL_INTERVAL_MS,
      max_tokens=OUTPUT_LENGTHS[index % len(OUTPUT_LENGTHS)],
    )
    for index in range(REQUEST_COUNT)
  ]


def build_dynamic_plans(
  requests: list[RequestSpec],
  batch_size: int,
  max_delay_ms: int,
) -> list[BatchPlan]:
  """Group arrivals by maximum batch size or maximum waiting time."""
  plans = []
  pending: list[RequestSpec] = []
  for request in requests:
    if pending and request.arrival_ms > pending[0].arrival_ms + max_delay_ms:
      plans.append(BatchPlan(pending[0].arrival_ms + max_delay_ms, tuple(pending)))
      pending = []
    pending.append(request)
    if len(pending) == batch_size:
      plans.append(BatchPlan(request.arrival_ms, tuple(pending)))
      pending = []
  if pending:
    plans.append(BatchPlan(pending[0].arrival_ms + max_delay_ms, tuple(pending)))
  return plans


async def run_static(
  client: httpx.AsyncClient,
  requests: list[RequestSpec],
  started: float,
) -> list[MeasuredRequest]:
  """Release fixed cohorts and wait at a barrier between cohorts."""
  measured = []
  for offset in range(0, len(requests), BATCH_SIZE):
    batch = requests[offset : offset + BATCH_SIZE]
    await _wait_until(started, batch[-1].arrival_ms)
    measured.extend(
      await asyncio.gather(*[_request(client, request, started) for request in batch])
    )
  return measured


async def run_dynamic(
  client: httpx.AsyncClient,
  requests: list[RequestSpec],
  started: float,
) -> list[MeasuredRequest]:
  """Release queued requests when size or delay reaches its limit."""
  plans = build_dynamic_plans(requests, BATCH_SIZE, MAX_DELAY_MS)
  batches = await asyncio.gather(*[_run_plan(client, plan, started) for plan in plans])
  return [request for batch in batches for request in batch]


async def run_continuous(
  client: httpx.AsyncClient,
  requests: list[RequestSpec],
  started: float,
) -> list[MeasuredRequest]:
  """Admit each arrival immediately while keeping sequence slots full."""
  semaphore = asyncio.Semaphore(MAX_NUM_SEQS)

  async def admit(request: RequestSpec) -> MeasuredRequest:
    await _wait_until(started, request.arrival_ms)
    async with semaphore:
      return await _request(client, request, started)

  return list(await asyncio.gather(*[admit(request) for request in requests]))


async def run_benchmark() -> dict[str, object]:
  """Measure all admission strategies against the same vLLM server."""
  await wait_for_health(BASE_URL)
  await _warm_up()
  results = []
  async with httpx.AsyncClient(timeout=300) as client:
    for name, dispatcher in [
      ("static", run_static),
      ("dynamic", run_dynamic),
      ("continuous", run_continuous),
    ]:
      requests = build_requests(name)
      result = await _measure(name, dispatcher, client, requests)
      results.append(result)
      print(result)
  report = {
    "model": MODEL_LABEL,
    "workload": "batch-strategies",
    "scope": "client admission strategies in front of vLLM continuous batching",
    "server_scheduler": {
      "max_num_seqs": MAX_NUM_SEQS,
      "max_num_batched_tokens": MAX_NUM_BATCHED_TOKENS,
    },
    "arrival_interval_ms": ARRIVAL_INTERVAL_MS,
    "batch_size": BATCH_SIZE,
    "dynamic_max_delay_ms": MAX_DELAY_MS,
    "dynamic_plan": [
      {
        "dispatch_ms": plan.dispatch_ms,
        "request_indexes": [request.index for request in plan.requests],
      }
      for plan in build_dynamic_plans(build_requests("plan"), BATCH_SIZE, MAX_DELAY_MS)
    ],
    "results": results,
  }
  output = Path(f"results/batch-strategies-{MODEL_LABEL}")
  save_json(report, output.with_suffix(".json"))
  output.with_suffix(".md").write_text(
    "# Batch strategy results\n\n" + render_strategy_table(results),
    encoding="utf-8",
  )
  return report


def render_strategy_table(results: list[dict[str, object]]) -> str:
  """Render strategy results as a compact Markdown table."""
  lines = [
    "| Strategy | Admission p95 ms | TTFT p95 ms | E2E p95 ms | RPS | Output TPS | Peak VRAM MiB |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for result in results:
    peak_vram = result["peak_vram_mib"]
    peak_text = "N/A" if peak_vram is None else f"{float(peak_vram):.1f}"
    lines.append(
      "| "
      f"{result['strategy']} | "
      f"{float(result['admission_p95_ms']):.1f} | "
      f"{float(result['ttft_p95_ms']):.1f} | "
      f"{float(result['e2e_p95_ms']):.1f} | "
      f"{float(result['rps']):.2f} | "
      f"{float(result['output_tps']):.1f} | "
      f"{peak_text} |"
    )
  return "\n".join(lines) + "\n"


async def _measure(
  name: str,
  dispatcher: Dispatcher,
  client: httpx.AsyncClient,
  requests: list[RequestSpec],
) -> dict[str, object]:
  """Measure one admission strategy."""
  started_epoch = time.time()
  started = time.perf_counter()
  measured = await dispatcher(client, requests, started)
  elapsed = time.perf_counter() - started
  finished_epoch = time.time()
  metrics = [request.metric for request in measured]
  admissions = [request.admission_ms for request in measured]
  summary = metric_summary(metrics, elapsed)
  summary["admission_p50_ms"] = percentile(admissions, 0.50)
  summary["admission_p95_ms"] = percentile(admissions, 0.95)
  summary["peak_vram_mib"] = await fetch_peak_vram_mib(
    PROMETHEUS_URL,
    started_epoch,
    finished_epoch,
  )
  return {
    "strategy": name,
    "elapsed_seconds": elapsed,
    **summary,
    "completion_order": [
      request.request.index for request in sorted(measured, key=lambda item: item.completed_ms)
    ],
    "requests": [
      {
        "index": request.request.index,
        "arrival_ms": request.request.arrival_ms,
        "max_tokens": request.request.max_tokens,
        "admission_ms": request.admission_ms,
        "completed_ms": request.completed_ms,
        **asdict(request.metric),
      }
      for request in measured
    ],
  }


async def _run_plan(
  client: httpx.AsyncClient,
  plan: BatchPlan,
  started: float,
) -> list[MeasuredRequest]:
  """Release one planned dynamic batch."""
  await _wait_until(started, plan.dispatch_ms)
  return list(
    await asyncio.gather(*[_request(client, request, started) for request in plan.requests])
  )


async def _request(
  client: httpx.AsyncClient,
  request: RequestSpec,
  started: float,
) -> MeasuredRequest:
  """Measure admission delay and server latency for one request."""
  ready_at = started + request.arrival_ms / 1000
  admission_ms = max(0.0, (time.perf_counter() - ready_at) * 1000)
  prompt = (
    f"unique-{request.namespace}-request-{request.index} "
    f"Repeat the word GPU exactly {request.max_tokens} times, separated by spaces."
  )
  metric = await stream_completion(
    client,
    BASE_URL,
    MODEL_NAME,
    prompt,
    request.max_tokens,
  )
  adjusted = RequestMetric(
    ttft_ms=metric.ttft_ms + admission_ms,
    tpot_ms=metric.tpot_ms,
    e2e_ms=metric.e2e_ms + admission_ms,
    output_tokens=metric.output_tokens,
  )
  completed_ms = (time.perf_counter() - started) * 1000
  return MeasuredRequest(request, admission_ms, completed_ms, adjusted)


async def _wait_until(started: float, offset_ms: int) -> None:
  """Wait until one logical arrival or dispatch time."""
  remaining = started + offset_ms / 1000 - time.perf_counter()
  if remaining > 0:
    await asyncio.sleep(remaining)


async def _warm_up() -> None:
  """Warm the model before comparing strategies."""
  async with httpx.AsyncClient(timeout=300) as client:
    await stream_completion(
      client,
      BASE_URL,
      MODEL_NAME,
      "warmup Explain one benefit of continuous batching.",
      32,
    )


def main() -> None:
  """Run the batch strategy comparison."""
  asyncio.run(run_benchmark())


if __name__ == "__main__":
  main()
