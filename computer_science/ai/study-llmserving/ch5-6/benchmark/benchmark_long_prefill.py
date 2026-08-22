"""Benchmark a long prefill and short decode workload."""

import asyncio

from benchmark.performance import Workload, run_workload

CONTEXT = "Kubernetes schedules Pods while the serving system manages model execution. " * 140


def main() -> None:
  """Run the workload that emphasizes TTFT and prefill compute."""
  workload = Workload(
    name="long-prefill",
    prompt_body=f"Read this context and summarize it in one sentence: {CONTEXT}",
    max_tokens=32,
  )
  asyncio.run(run_workload(workload))


if __name__ == "__main__":
  main()
