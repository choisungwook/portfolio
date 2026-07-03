import os
import time

import httpx


def get_sse_url() -> str:
  return os.getenv("SSE_URL", "http://localhost:8000/events?limit=5&interval=1")


def wait_for_server(url: str) -> None:
  origin = url.split("/events", maxsplit=1)[0]
  health_url = f"{origin}/healthz"

  for _ in range(20):
    try:
      response = httpx.get(health_url, timeout=2)
      response.raise_for_status()
      return
    except httpx.HTTPError:
      time.sleep(0.5)

  raise RuntimeError(f"server is not ready: {health_url}")


def print_event_stream(url: str) -> None:
  with httpx.stream("GET", url, timeout=30) as response:
    response.raise_for_status()
    for line in response.iter_lines():
      if line:
        print(line)


def main() -> None:
  url = get_sse_url()
  wait_for_server(url)
  print_event_stream(url)


if __name__ == "__main__":
  main()
