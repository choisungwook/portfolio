"""Compare cost-optimized and latency-optimized designs on the same workload."""

import argparse
import random
import statistics

import requests

MODELS = [
  "550e8400-e29b-41d4-a716-446655440000",
  "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
]
SAMPLE_TEXT = "This movie was great! I really enjoyed it."


def run(url: str, pattern: str, n: int):
  random.seed(7)
  if pattern == "round-robin":
    order = [MODELS[i % len(MODELS)] for i in range(n)]
  else:
    order = [random.choices(MODELS, weights=[0.85, 0.15])[0] for _ in range(n)]

  latencies = []
  cold = 0
  for model_id in order:
    response = requests.post(
      f"{url}/predict", json={"model_id": model_id, "input_data": SAMPLE_TEXT}, timeout=300
    )
    response.raise_for_status()
    body = response.json()
    latencies.append(body["_timing"]["total_seconds"])
    if body["_timing"]["acquire_worker_seconds"] > 0.05:
      cold += 1

  latencies.sort()
  return {
    "requests": n,
    "cold_starts": cold,
    "p50": latencies[len(latencies) // 2],
    "p95": latencies[int(len(latencies) * 0.95) - 1],
    "max": latencies[-1],
    "mean": statistics.mean(latencies),
  }


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--cost-url", default="http://localhost:30080")
  parser.add_argument("--latency-url", default="http://localhost:30081")
  parser.add_argument("--requests", type=int, default=30)
  parser.add_argument("--pattern", default="round-robin", choices=["round-robin", "skewed"])
  args = parser.parse_args()

  print(f"pattern={args.pattern} requests={args.requests}")
  print(f"{'design':>10} {'cold':>6} {'p50(s)':>9} {'p95(s)':>9} {'max(s)':>9} {'mean(s)':>9}")
  for name, url in (("cost", args.cost_url), ("latency", args.latency_url)):
    if not url:
      continue
    r = run(url, args.pattern, args.requests)
    print(
      f"{name:>10} {r['cold_starts']:>6} {r['p50']:>9.3f} {r['p95']:>9.3f} "
      f"{r['max']:>9.3f} {r['mean']:>9.3f}"
    )


if __name__ == "__main__":
  main()
