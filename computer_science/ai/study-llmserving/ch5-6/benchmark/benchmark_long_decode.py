"""Benchmark a short prefill and long decode workload."""

import asyncio

from benchmark.performance import Workload, run_workload


def main() -> None:
  """Run the workload that emphasizes TPOT and decode bandwidth."""
  workload = Workload(
    name="long-decode",
    prompt_body="Explain why LLM decode is memory-bandwidth-bound using a concrete analogy.",
    max_tokens=256,
  )
  asyncio.run(run_workload(workload))


if __name__ == "__main__":
  main()
