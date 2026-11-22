# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "httpx>=0.28.0",
# ]
# ///
"""같은 동시 사용자 수로 HTTP JSON과 SSE 응답 지연을 측정한다."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import sys
import time
from collections.abc import Awaitable, Callable, Iterator

import httpx

from compare_http_sse import API_KEY, BASE_URL, MODEL, extract_delta_text, publish_metrics

type ReadResponse = Callable[[httpx.Response, float], Awaitable[float]]
type Sample = tuple[float, float]


async def read_json(response: httpx.Response, started: float) -> float:
  """완성된 JSON 답변을 읽고 첫 텍스트가 보이기까지 걸린 시간을 반환한다."""
  data = json.loads(await response.aread())
  if not data["choices"][0]["message"]["content"]:
    raise ValueError("JSON 응답에 생성된 텍스트가 없습니다.")
  return time.perf_counter() - started


async def read_sse(response: httpx.Response, started: float) -> float:
  """첫 텍스트 지연을 측정하며 Chat Completions의 종료 이벤트를 확인한다."""
  first_text = None
  done_received = False
  async for line in response.aiter_lines():
    if line.startswith("data:") and line[5:].strip() == "[DONE]":
      done_received = True
    if first_text is None and extract_delta_text(line):
      first_text = time.perf_counter() - started
  if not done_received or first_text is None:
    raise ValueError("SSE 응답에 첫 텍스트 또는 [DONE]이 없습니다.")
  return first_text


async def run_user(client: httpx.AsyncClient, requests: Iterator[dict[str, object]], read_response: ReadResponse) -> list[Sample]:
  """가상 사용자 한 명의 순차 요청에서 성공한 응답의 지연을 반환한다."""
  samples = []
  for payload in requests:
    started = time.perf_counter()
    try:
      async with client.stream("POST", f"{BASE_URL}/v1/chat/completions", json=payload) as response:
        response.raise_for_status()
        first_text = await read_response(response, started)
      samples.append((first_text, time.perf_counter() - started))
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
      print(f"요청 실패: {error}", file=sys.stderr)
  return samples


def build_requests(count: int, stream: bool) -> Iterator[dict[str, object]]:
  """두 응답 모드에 같은 요청 목록을 제공한다."""
  for index in range(1, count + 1):
    yield {
      "model": MODEL,
      "messages": [{"role": "user", "content": f"Case {index}. List five examples of safe outdoor activities."}],
      "max_tokens": 32,
      "temperature": 0,
      "stream": stream,
    }


def p95(values: list[float]) -> float:
  """가장 가까운 순위 방식으로 성공 요청의 P95를 계산한다."""
  return sorted(values)[math.ceil(0.95 * len(values)) - 1]


async def run_load(count: int, vus: int, mode: str, stream: bool, read_response: ReadResponse) -> list[str]:
  """정해진 가상 사용자 수로 한 모드의 부하를 실행하고 Prometheus 샘플을 만든다."""
  requests = build_requests(count, stream)
  async with httpx.AsyncClient(headers={"Authorization": f"Bearer {API_KEY}"}, timeout=120) as client:
    start = time.perf_counter()
    results = await asyncio.gather(*(run_user(client, requests, read_response) for _ in range(vus)))
    elapsed = time.perf_counter() - start
  samples = [sample for user in results for sample in user]
  failures = count - len(samples)
  metrics = {"requests_per_second": count / elapsed, "failed_ratio": failures / count}
  if samples:
    metrics["first_text_p95_seconds"] = p95([first for first, _ in samples])
    metrics["complete_p95_seconds"] = p95([end for _, end in samples])
  print(f"{mode} | VU {vus} | {len(samples)}/{count} 성공 | {elapsed:.2f}s | {metrics}", flush=True)
  labels = f'mode="{mode}",requests="{count}"'
  return [f"sse_lab_load_{name}{{{labels}}} {value}" for name, value in metrics.items()]


async def main() -> None:
  """모든 부하 비교를 실행하고 같은 동시성의 결과를 한 번에 게시한다."""
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--vus", type=int, default=4)
  parser.add_argument("--requests", nargs="+", type=int, choices=[10, 100], default=[10, 100])
  args = parser.parse_args()
  counts = list(dict.fromkeys(args.requests))
  if not 1 <= args.vus <= min(counts):
    parser.error("--vus must be between 1 and the smallest request count")

  lines = []
  scenarios = [("HTTP JSON", False, read_json), ("HTTP SSE", True, read_sse)]
  for count in counts:
    for mode, stream, read_response in scenarios:
      lines.extend(await run_load(count, args.vus, mode, stream, read_response))
  url = os.environ.get("PROMETHEUS_PUSHGATEWAY_URL", "http://localhost:9091")
  publish_metrics(url, f"model_response_load/vus/{args.vus}", lines)


if __name__ == "__main__":
  asyncio.run(main())
