"""AgentCore Runtime V1/V2 비교용 실험 agent.

모델을 부르지 않는다. 무거운 초기화(INIT_SECONDS 대기, INIT_MEMORY_MB 메모리 적재)를
흉내 낸 뒤 8080 포트를 연다. V2는 이 시점의 프로세스 메모리를 snapshot으로 찍는다.
"""

import gc
import json
import os
import random
import socket
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
INIT_SECONDS = float(os.environ.get("INIT_SECONDS", "0"))
INIT_MEMORY_MB = int(os.environ.get("INIT_MEMORY_MB", "0"))
MB = 1024 * 1024


def touch(size_mb: int) -> bytearray:
  """size_mb만큼 메모리를 잡고 모든 page에 써서 실제로 RSS에 올린다."""
  buf = bytearray(size_mb * MB)
  for offset in range(0, len(buf), 4096):
    buf[offset] = 1
  return buf


def initialize() -> dict:
  """모델 로딩 같은 무거운 시작 작업을 흉내 내고, 시작 시점 값을 기록한다."""
  wall_start = time.time()
  time.sleep(INIT_SECONDS)
  return {
    "init_uuid": str(uuid.uuid4()),
    "init_random": random.random(),
    "init_time": time.time(),
    "init_monotonic": time.monotonic(),
    "init_took_seconds": round(time.time() - wall_start, 2),
  }


STARTUP = initialize()
MODEL_WEIGHTS = touch(INIT_MEMORY_MB)
held: list[bytearray] = []
turns = 0


def rss_mb() -> int:
  """현재 프로세스의 RSS(MB). Linux /proc에서 읽는다."""
  with open("/proc/self/status") as status:
    for line in status:
      if line.startswith("VmRSS:"):
        return int(line.split()[1]) // 1024
  return -1


def info() -> dict:
  """시작 시점 값과 요청 시점 값을 나란히 돌려준다."""
  global turns
  turns += 1
  return {
    **STARTUP,
    "request_uuid": str(uuid.uuid4()),
    "request_random": random.random(),
    "now": time.time(),
    "wall_since_init": round(time.time() - STARTUP["init_time"], 2),
    "monotonic_since_init": round(time.monotonic() - STARTUP["init_monotonic"], 2),
    "hostname": socket.gethostname(),
    "pid": os.getpid(),
    "turns": turns,
    "rss_mb": rss_mb(),
  }


def alloc(size_mb: int) -> dict:
  """size_mb만큼 메모리를 더 잡아 세션이 쓰는 메모리를 늘린다."""
  held.append(touch(size_mb))
  return {"held_mb": len(held) * size_mb, "rss_mb": rss_mb()}


def free() -> dict:
  """alloc으로 잡은 메모리를 OS에 돌려준다."""
  held.clear()
  gc.collect()
  return {"held_mb": 0, "rss_mb": rss_mb()}


def handle(payload: dict) -> dict:
  """action 값에 맞는 함수로 요청을 넘긴다."""
  action = payload.get("action", "info")
  if action == "alloc":
    return alloc(int(payload.get("mb", 512)))
  if action == "free":
    return free()
  return info()


class Handler(BaseHTTPRequestHandler):
  """AgentCore Runtime HTTP 계약: GET /ping, POST /invocations."""

  def do_GET(self) -> None:
    if self.path == "/ping":
      self.reply(200, {"status": "Healthy"})
    else:
      self.reply(404, {"error": "not found"})

  def do_POST(self) -> None:
    if self.path != "/invocations":
      self.reply(404, {"error": "not found"})
      return
    length = int(self.headers.get("Content-Length", 0))
    payload = json.loads(self.rfile.read(length) or b"{}")
    self.reply(200, handle(payload))

  def reply(self, code: int, body: dict) -> None:
    data = json.dumps(body).encode()
    self.send_response(code)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)

  def log_message(self, fmt: str, *args) -> None:
    print(fmt % args, flush=True)


if __name__ == "__main__":
  print(f"initialized: {json.dumps(STARTUP)} rss_mb={rss_mb()}", flush=True)
  ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
