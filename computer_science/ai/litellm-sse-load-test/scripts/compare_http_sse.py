# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "httpx>=0.28.0",
# ]
# ///
"""LiteLLM Proxy에 일반 HTTP(stream: false)와 SSE(stream: true) 요청을 보내 체감 지표 차이를 비교한다."""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass

import httpx

BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://localhost:4000")
API_KEY = os.environ.get("LITELLM_API_KEY", "sk-local-litellm-test")
MODEL = os.environ.get("LITELLM_MODEL", "local-qwen")
PROMPT = os.environ.get(
  "PROMPT",
  "Server-Sent Events(SSE)와 일반 HTTP 응답의 차이를 4문장으로 설명해 주세요.",
)
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "120"))


@dataclass
class RunMetrics:
  """단일 요청에서 측정한 클라이언트 관점 지표."""

  mode: str
  content_type: str
  ttfb_ms: float
  ttft_ms: float
  tpot_ms: float | None
  e2e_ms: float
  chunk_count: int


def build_payload(stream: bool) -> dict[str, object]:
  """OpenAI 호환 chat completions 요청 본문을 만든다."""
  return {
    "model": MODEL,
    "messages": [{"role": "user", "content": PROMPT}],
    "max_tokens": MAX_TOKENS,
    "temperature": 0.2,
    "stream": stream,
  }


def run_non_streaming(client: httpx.Client) -> RunMetrics:
  """stream: false 일반 HTTP 요청을 보내고 완료 시점까지의 지표를 측정한다."""
  print("\n=== [1] 일반 HTTP (stream: false) ===")
  print("요청 전송 후 전체 답변이 완성될 때까지 화면이 멈춘 채 대기합니다...")
  start = time.perf_counter()
  with client.stream(
    "POST",
    f"{BASE_URL}/v1/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json=build_payload(stream=False),
  ) as resp:
    resp.raise_for_status()
    ttfb_ms = (time.perf_counter() - start) * 1000
    body = resp.read()
    e2e_ms = (time.perf_counter() - start) * 1000
    content_type = resp.headers.get("content-type", "")

  data = json.loads(body)
  text = data["choices"][0]["message"]["content"]
  print(f"\n[응답 도착 ({e2e_ms:.0f} ms 만에 한 번에 수신)]\n{text}\n")
  return RunMetrics(
    mode="HTTP (stream: false)",
    content_type=content_type,
    ttfb_ms=ttfb_ms,
    ttft_ms=e2e_ms,
    tpot_ms=None,
    e2e_ms=e2e_ms,
    chunk_count=1,
  )


def extract_delta_text(line: str) -> str | None:
  """SSE data 라인에서 실제 텍스트 토큰 델타를 추출한다."""
  if not line.startswith("data:"):
    return None
  raw = line[len("data:") :].strip()
  if not raw or raw == "[DONE]":
    return None
  chunk = json.loads(raw)
  choices = chunk.get("choices") or []
  if not choices:
    return None
  return choices[0].get("delta", {}).get("content") or None


def run_streaming(client: httpx.Client) -> RunMetrics:
  """stream: true SSE 요청을 보내고 청크 단위 도착 시각을 측정한다."""
  print("=== [2] Chat SSE (stream: true) ===")
  print("토큰이 생성되는 즉시 실시간으로 출력됩니다:\n")
  start = time.perf_counter()
  token_times: list[float] = []

  with client.stream(
    "POST",
    f"{BASE_URL}/v1/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json=build_payload(stream=True),
  ) as resp:
    resp.raise_for_status()
    ttfb_ms = (time.perf_counter() - start) * 1000
    content_type = resp.headers.get("content-type", "")
    for line in resp.iter_lines():
      delta = extract_delta_text(line)
      if delta is None:
        continue
      token_times.append((time.perf_counter() - start) * 1000)
      sys.stdout.write(delta)
      sys.stdout.flush()
    e2e_ms = (time.perf_counter() - start) * 1000

  print("\n")
  ttft_ms = token_times[0] if token_times else e2e_ms
  tpot_ms = (token_times[-1] - token_times[0]) / (len(token_times) - 1) if len(token_times) > 1 else None
  return RunMetrics(
    mode="SSE (stream: true)",
    content_type=content_type,
    ttfb_ms=ttfb_ms,
    ttft_ms=ttft_ms,
    tpot_ms=tpot_ms,
    e2e_ms=e2e_ms,
    chunk_count=len(token_times),
  )


def print_summary(http_m: RunMetrics, sse_m: RunMetrics) -> None:
  """두 모드의 핵심 지표를 표 형태로 출력한다."""
  print("=== 비교 요약 ===")
  header = f"{'지표':<20} | {'HTTP (stream: false)':<24} | {'SSE (stream: true)':<24}"
  print(header)
  print("-" * len(header))
  print(f"{'Content-Type':<20} | {http_m.content_type:<24} | {sse_m.content_type:<24}")
  print(f"{'TTFB (헤더 도착)':<20} | {http_m.ttfb_ms:>21.1f} ms | {sse_m.ttfb_ms:>21.1f} ms")
  print(f"{'TTFT (첫 글자)':<20} | {http_m.ttft_ms:>21.1f} ms | {sse_m.ttft_ms:>21.1f} ms")
  tpot_str = f"{sse_m.tpot_ms:>21.1f} ms" if sse_m.tpot_ms is not None else f"{'N/A':>24}"
  print(f"{'TPOT (토큰 간격)':<20} | {'측정 불가 (N/A)':>24} | {tpot_str}")
  print(f"{'E2E (전체 완료)':<20} | {http_m.e2e_ms:>21.1f} ms | {sse_m.e2e_ms:>21.1f} ms")
  print(f"{'수신 청크 수':<20} | {http_m.chunk_count:>24} | {sse_m.chunk_count:>24}")


def main() -> None:
  """일반 HTTP와 SSE 요청을 순차 실행해 지표를 비교한다."""
  with httpx.Client(timeout=120.0) as client:
    http_metrics = run_non_streaming(client)
    sse_metrics = run_streaming(client)
  print_summary(http_metrics, sse_metrics)


if __name__ == "__main__":
  main()
