"""Run a 20-sample GSM8K evaluation under three minutes."""

import asyncio
import json
import os
import time
import urllib.request
from pathlib import Path

import httpx

from benchmark.accuracy_common import answer_question, bounded_gather, extract_last_number
from benchmark.common import save_json, wait_for_health

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_LABEL = os.getenv("MODEL_LABEL", "unknown")
DATASET_URL = (
  "https://raw.githubusercontent.com/openai/grade-school-math/"
  "master/grade_school_math/data/test.jsonl"
)
SAMPLE_COUNT = 20
CONCURRENCY = 4


def load_samples() -> list[dict[str, str]]:
  """Download the official GSM8K test set and return a stable prefix."""
  with urllib.request.urlopen(DATASET_URL, timeout=30) as response:
    lines = response.read().decode("utf-8").splitlines()
  return [json.loads(line) for line in lines[:SAMPLE_COUNT]]


async def run() -> dict[str, object]:
  """Evaluate GSM8K against an already warm model endpoint."""
  await wait_for_health(BASE_URL)
  samples = await asyncio.to_thread(load_samples)
  semaphore = asyncio.Semaphore(CONCURRENCY)
  async with httpx.AsyncClient(timeout=150) as client:

    async def evaluate(sample: dict[str, str]) -> dict[str, object]:
      async with semaphore:
        response = await answer_question(
          client,
          BASE_URL,
          MODEL_NAME,
          sample["question"],
          max_tokens=256,
        )
        expected = sample["answer"].split("####")[-1].strip().replace(",", "")
        predicted = extract_last_number(response)
        return {
          "question": sample["question"],
          "expected": expected,
          "predicted": predicted,
          "response": response,
          "correct": predicted == expected,
        }

    started = time.perf_counter()
    items, timed_out = await bounded_gather(
      [evaluate(sample) for sample in samples],
      timeout_seconds=180,
    )
    elapsed = time.perf_counter() - started
  correct = sum(bool(item["correct"]) for item in items)
  report = {
    "model": MODEL_LABEL,
    "evaluation": "gsm8k-20",
    "completed": len(items),
    "total": SAMPLE_COUNT,
    "correct": correct,
    "accuracy": correct / len(items) if items else None,
    "elapsed_seconds": elapsed,
    "timed_out": timed_out,
    "valid_comparison": not timed_out and len(items) == SAMPLE_COUNT,
    "items": items,
  }
  save_json(report, Path(f"results/accuracy-gsm8k-{MODEL_LABEL}.json"))
  print(report)
  return report


def main() -> None:
  """Run the bounded GSM8K evaluation."""
  asyncio.run(run())


if __name__ == "__main__":
  main()
