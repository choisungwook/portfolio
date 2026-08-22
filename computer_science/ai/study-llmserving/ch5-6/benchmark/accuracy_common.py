"""Shared OpenAI-compatible accuracy evaluation helpers."""

import asyncio
import re
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class AccuracyItem:
  """Store one evaluated answer."""

  question: str
  expected: str
  response: str
  correct: bool


async def answer_question(
  client: httpx.AsyncClient,
  base_url: str,
  model_name: str,
  question: str,
  max_tokens: int,
) -> str:
  """Request one deterministic short answer."""
  payload = {
    "model": model_name,
    "messages": [
      {
        "role": "user",
        "content": f"{question}\nReturn only the final answer without explanation.",
      }
    ],
    "temperature": 0,
    "max_tokens": max_tokens,
  }
  response = await client.post(f"{base_url}/v1/chat/completions", json=payload)
  response.raise_for_status()
  return response.json()["choices"][0]["message"]["content"].strip()


def normalize_answer(value: str) -> str:
  """Normalize a short answer for the smoke accuracy gate."""
  return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def matches_answer(response: str, expected_answers: list[str]) -> bool:
  """Return whether one expected answer appears as a normalized phrase."""
  normalized = normalize_answer(response)
  return any(normalize_answer(expected) in normalized for expected in expected_answers)


def extract_last_number(value: str) -> str | None:
  """Extract the last numeric answer from generated text."""
  matches = re.findall(r"-?\d+(?:,\d{3})*(?:\.\d+)?", value)
  return matches[-1].replace(",", "") if matches else None


async def bounded_gather(coroutines: list, timeout_seconds: float) -> tuple[list, bool]:
  """Gather completed evaluations under a hard wall-time budget."""
  completed = []

  async def capture(coroutine):
    result = await coroutine
    completed.append(result)

  tasks = [asyncio.create_task(capture(coroutine)) for coroutine in coroutines]
  try:
    await asyncio.wait_for(asyncio.gather(*tasks), timeout=timeout_seconds)
    return completed, False
  except TimeoutError:
    for task in tasks:
      task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    return completed, True
