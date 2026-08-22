"""Benchmark vLLM scheduler settings with a short fixed workload."""

import asyncio

from benchmark.performance import Workload, run_workload


def main() -> None:
  """Measure latency and throughput across fixed concurrency levels."""
  workload = Workload(
    name="vllm-batching",
    prompt_body="Explain continuous batching in one short sentence.",
    max_tokens=64,
  )
  asyncio.run(run_workload(workload))


if __name__ == "__main__":
  main()
