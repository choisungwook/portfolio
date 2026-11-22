# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "httpx>=0.28.0",
# ]
# ///
"""LiteLLM에 비스트리밍과 SSE 요청을 보내 첫 텍스트와 완료 시각을 비교한다."""

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
  call_id: str
  ttfb_ms: float
  ttft_ms: float
  chunk_gap_ms: float | None
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
  """비스트리밍 요청을 보내고 헤더 및 본문 수신 시각을 측정한다."""
  print("\n=== [1] 비스트리밍 (stream: false) ===")
  print("요청 전송 후 전체 답변이 완성될 때까지 화면이 멈춘 채 대기합니다...")
  start = time.perf_counter()
  with client.stream(
    "POST",
    f"{BASE_URL}/v1/chat/completions",
    headers={"x-litellm-tags": "sse-lab-non-stream"},
    json=build_payload(stream=False),
  ) as resp:
    resp.raise_for_status()
    ttfb_ms = (time.perf_counter() - start) * 1000
    body = resp.read()
    e2e_ms = (time.perf_counter() - start) * 1000
    content_type = resp.headers.get("content-type", "")
    call_id = resp.headers.get("x-litellm-call-id", "-")

  data = json.loads(body)
  text = data["choices"][0]["message"]["content"]
  print(f"\n[응답 도착 ({e2e_ms:.0f} ms 만에 한 번에 수신)]\n{text}\n")
  return RunMetrics(
    mode="비스트리밍 (stream: false)",
    content_type=content_type,
    call_id=call_id,
    ttfb_ms=ttfb_ms,
    ttft_ms=e2e_ms,
    chunk_gap_ms=None,
    e2e_ms=e2e_ms,
    chunk_count=1,
  )


def extract_delta_text(line: str) -> str | None:
  """Chat Completions의 SSE data 한 줄에서 텍스트를 추출한다."""
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
  print("도착한 텍스트 조각을 바로 출력합니다.\n")
  start = time.perf_counter()
  chunk_times: list[float] = []
  done_received = False

  with client.stream(
    "POST",
    f"{BASE_URL}/v1/chat/completions",
    headers={"x-litellm-tags": "sse-lab-stream"},
    json=build_payload(stream=True),
  ) as resp:
    resp.raise_for_status()
    ttfb_ms = (time.perf_counter() - start) * 1000
    content_type = resp.headers.get("content-type", "")
    call_id = resp.headers.get("x-litellm-call-id", "-")
    for line in resp.iter_lines():
      if line.startswith("data:") and line[5:].strip() == "[DONE]":
        done_received = True
      delta = extract_delta_text(line)
      if delta is None:
        continue
      chunk_times.append((time.perf_counter() - start) * 1000)
      sys.stdout.write(delta)
      sys.stdout.flush()
    e2e_ms = (time.perf_counter() - start) * 1000

  print("\n")
  if not done_received:
    raise RuntimeError("SSE 응답이 [DONE] 없이 종료됐습니다.")
  if not chunk_times:
    raise RuntimeError("SSE 응답에 텍스트 청크가 없습니다.")
  chunk_gap_ms = (chunk_times[-1] - chunk_times[0]) / (len(chunk_times) - 1) if len(chunk_times) > 1 else None
  return RunMetrics(
    mode="SSE (stream: true)",
    content_type=content_type,
    call_id=call_id,
    ttfb_ms=ttfb_ms,
    ttft_ms=chunk_times[0],
    chunk_gap_ms=chunk_gap_ms,
    e2e_ms=e2e_ms,
    chunk_count=len(chunk_times),
  )


def print_summary(http_m: RunMetrics, sse_m: RunMetrics) -> None:
  """두 모드의 핵심 지표를 표 형태로 출력한다."""
  print("=== 비교 요약 ===")
  header = f"{'지표':<20} | {http_m.mode:<24} | {sse_m.mode:<24}"
  print(header)
  print("-" * len(header))
  print(f"{'Content-Type':<20} | {http_m.content_type:<24} | {sse_m.content_type:<24}")
  print(f"{'TTFB (헤더 도착)':<20} | {http_m.ttfb_ms:>21.1f} ms | {sse_m.ttfb_ms:>21.1f} ms")
  print(f"{'TTFT (첫 텍스트)':<20} | {http_m.ttft_ms:>21.1f} ms | {sse_m.ttft_ms:>21.1f} ms")
  gap_str = f"{sse_m.chunk_gap_ms:.1f} ms" if sse_m.chunk_gap_ms is not None else "N/A"
  print(f"{'평균 청크 간격':<20} | {'N/A':>24} | {gap_str:>24}")
  print(f"{'E2E (전체 완료)':<20} | {http_m.e2e_ms:>21.1f} ms | {sse_m.e2e_ms:>21.1f} ms")
  print(f"{'텍스트 조각 수':<20} | {http_m.chunk_count:>24} | {sse_m.chunk_count:>24}")
  print(f"Call ID (비스트리밍)  {http_m.call_id}")
  print(f"Call ID (SSE)         {sse_m.call_id}")


def main() -> None:
  """비스트리밍과 SSE 요청을 순차 실행해 지표를 비교한다."""
  with httpx.Client(headers={"Authorization": f"Bearer {API_KEY}"}, timeout=120.0) as client:
    http_metrics = run_non_streaming(client)
    sse_metrics = run_streaming(client)
  print_summary(http_metrics, sse_metrics)
  pushgateway_url = os.environ.get("PROMETHEUS_PUSHGATEWAY_URL")
  if pushgateway_url:
    push_comparison(pushgateway_url, http_metrics, sse_metrics)


def push_comparison(pushgateway_url: str, http_m: RunMetrics, sse_m: RunMetrics) -> None:
  """두 응답의 측정값을 한 번에 Pushgateway에 저장한다."""
  metric_fields = {
    "header_seconds": "ttfb_ms",
    "first_text_seconds": "ttft_ms",
    "complete_seconds": "e2e_ms",
    "chunk_gap_seconds": "chunk_gap_ms",
  }
  lines = []
  for name, field in metric_fields.items():
    metric = f"sse_lab_response_{name}"
    lines.append(f"# TYPE {metric} gauge")
    for mode, result in (("HTTP JSON", http_m), ("HTTP SSE", sse_m)):
      value_ms = getattr(result, field)
      if value_ms is not None:
        lines.append(f'{metric}{{mode="{mode}"}} {value_ms / 1000}')

  publish_metrics(pushgateway_url, "model_response_comparison", lines)


def publish_metrics(pushgateway_url: str, group: str, lines: list[str]) -> None:
  """Prometheus 텍스트 메트릭으로 Pushgateway의 그룹을 교체한다."""
  response = httpx.put(
    f"{pushgateway_url.rstrip('/')}/metrics/job/{group}",
    content="\n".join(lines) + "\n",
    headers={"Content-Type": "text/plain; version=0.0.4"},
    timeout=5,
  )
  response.raise_for_status()


if __name__ == "__main__":
  main()
