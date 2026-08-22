"""Run the three-minute fixed-question accuracy gate."""

import asyncio
import json
import os
import time
from pathlib import Path

import httpx

from benchmark.accuracy_common import AccuracyItem, answer_question, bounded_gather, matches_answer
from benchmark.common import save_json, wait_for_health

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_LABEL = os.getenv("MODEL_LABEL", "unknown")
CONCURRENCY = 4


async def run() -> dict[str, object]:
  """Evaluate the same 20 short questions under a three-minute budget."""
  await wait_for_health(BASE_URL)
  questions = json.loads(Path("benchmark/data/smoke_questions.json").read_text(encoding="utf-8"))
  semaphore = asyncio.Semaphore(CONCURRENCY)
  async with httpx.AsyncClient(timeout=90) as client:

    async def evaluate(item: dict[str, object]) -> AccuracyItem:
      async with semaphore:
        response = await answer_question(
          client,
          BASE_URL,
          MODEL_NAME,
          str(item["question"]),
          max_tokens=32,
        )
        expected = [str(value) for value in item["answers"]]
        return AccuracyItem(
          question=str(item["question"]),
          expected=" | ".join(expected),
          response=response,
          correct=matches_answer(response, expected),
        )

    started = time.perf_counter()
    items, timed_out = await bounded_gather(
      [evaluate(item) for item in questions],
      timeout_seconds=180,
    )
    elapsed = time.perf_counter() - started
  correct = sum(item.correct for item in items)
  report = {
    "model": MODEL_LABEL,
    "evaluation": "accuracy-smoke",
    "completed": len(items),
    "total": len(questions),
    "correct": correct,
    "accuracy": correct / len(items) if items else None,
    "elapsed_seconds": elapsed,
    "timed_out": timed_out,
    "valid_comparison": not timed_out and len(items) == len(questions),
    "items": [item.__dict__ for item in items],
  }
  save_json(report, Path(f"results/accuracy-smoke-{MODEL_LABEL}.json"))
  print(report)
  return report


def main() -> None:
  """Run the smoke accuracy evaluation."""
  asyncio.run(run())


if __name__ == "__main__":
  main()
