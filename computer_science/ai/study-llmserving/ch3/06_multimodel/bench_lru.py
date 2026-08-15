"""Show LRU cache thrashing: same workload, different max_models.

Restart the server with a different MAX_MODELS between runs and compare
hit_rate / cold-start latency.
"""

import argparse
import random
import statistics

import requests

TEXT_MODELS = [
  "550e8400-e29b-41d4-a716-446655440000",
  "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
]
IMAGE_MODEL = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
SAMPLE_TEXT = "This movie was great! I really enjoyed it."


def build_workload(pattern: str, n: int, image_path: str):
  models = TEXT_MODELS + [IMAGE_MODEL]
  payloads = {m: SAMPLE_TEXT for m in TEXT_MODELS}
  payloads[IMAGE_MODEL] = image_path

  if pattern == "round-robin":
    order = [models[i % len(models)] for i in range(n)]
  elif pattern == "skewed":
    order = [random.choices(models, weights=[0.8, 0.15, 0.05])[0] for _ in range(n)]
  else:
    order = [random.choice(models) for _ in range(n)]
  return [(m, payloads[m]) for m in order]


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--url", default="http://localhost:8001")
  parser.add_argument("--requests", type=int, default=18)
  parser.add_argument(
    "--pattern", default="round-robin", choices=["round-robin", "skewed", "random"]
  )
  parser.add_argument("--image", default="06_multimodel/samples/cat.jpg")
  args = parser.parse_args()

  random.seed(42)
  workload = build_workload(args.pattern, args.requests, args.image)

  acquire_times = []
  for i, (model_id, payload) in enumerate(workload, start=1):
    response = requests.post(
      f"{args.url}/predict", json={"model_id": model_id, "input_data": payload}, timeout=300
    )
    response.raise_for_status()
    timing = response.json()["_timing"]
    acquire_times.append(timing["acquire_worker_seconds"])
    marker = "COLD" if timing["acquire_worker_seconds"] > 0.05 else "warm"
    print(f"{i:>3}  {model_id[:8]}  {marker}  acquire={timing['acquire_worker_seconds']:.3f}s")

  stats = requests.get(f"{args.url}/stats", timeout=30).json()
  print()
  print(f"pattern        : {args.pattern}")
  print(f"max_models     : {stats['max_models']}")
  print(f"hit_rate       : {stats['hit_rate']}")
  print(f"misses/evict   : {stats['misses']} / {stats['evictions']}")
  print(f"acquire p50    : {statistics.median(acquire_times):.3f}s")
  print(f"acquire max    : {max(acquire_times):.3f}s")
  print(f"total load time: {stats['load_seconds']:.2f}s")


if __name__ == "__main__":
  main()
