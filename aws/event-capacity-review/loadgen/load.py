# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Closed-loop load driver.

Raises concurrency one stage at a time and prints throughput and latency for each
stage, which is how you find the knee of a service instead of guessing it.
"""

import argparse
import http.client
import statistics
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass
class StageResult:
  """Measured result of one concurrency stage."""

  concurrency: int
  rps: float
  p50_ms: float
  p95_ms: float
  p99_ms: float
  errors: int


def percentile(samples: list[float], ratio: float) -> float:
  """Return the value at the given ratio (0.0 - 1.0) of a sorted sample list."""
  if not samples:
    return 0.0
  ordered = sorted(samples)
  index = min(len(ordered) - 1, int(len(ordered) * ratio))
  return ordered[index]


def connect(target: str) -> http.client.HTTPConnection:
  """Open one keep-alive connection to a target base URL."""
  parts = urlparse(target)
  return http.client.HTTPConnection(parts.hostname, parts.port or 80, timeout=30)


def send_once(conn: http.client.HTTPConnection, path: str) -> tuple[float, bool]:
  """Send one request and return its latency in milliseconds and whether it succeeded."""
  started = time.perf_counter()
  conn.request("GET", path)
  response = conn.getresponse()
  response.read()
  elapsed_ms = (time.perf_counter() - started) * 1000
  return elapsed_ms, response.status < 400


def drive(target: str, path: str, deadline: float, out: list[tuple[float, bool]]) -> None:
  """Send requests back to back until the deadline, appending every result."""
  conn = connect(target)
  while time.perf_counter() < deadline:
    try:
      out.append(send_once(conn, path))
    except OSError:
      out.append((0.0, False))
      conn = connect(target)
  conn.close()


def run_stage(targets: list[str], path: str, concurrency: int, seconds: float) -> StageResult:
  """Run one stage at a fixed concurrency, spreading workers over the targets."""
  results: list[tuple[float, bool]] = []
  lock = threading.Lock()
  deadline = time.perf_counter() + seconds
  threads = [
    threading.Thread(target=collect, args=(targets[i % len(targets)], path, deadline, results, lock))
    for i in range(concurrency)
  ]
  started = time.perf_counter()
  for thread in threads:
    thread.start()
  for thread in threads:
    thread.join()
  return summarize(concurrency, results, time.perf_counter() - started)


def collect(target: str, path: str, deadline: float, shared: list, lock: threading.Lock) -> None:
  """Run one worker and merge its samples into the shared list."""
  local: list[tuple[float, bool]] = []
  drive(target, path, deadline, local)
  with lock:
    shared.extend(local)


def summarize(concurrency: int, results: list[tuple[float, bool]], elapsed: float) -> StageResult:
  """Turn raw samples into the numbers that decide scale up or scale out."""
  ok_latencies = [ms for ms, ok in results if ok]
  errors = sum(1 for _, ok in results if not ok)
  return StageResult(
    concurrency=concurrency,
    rps=len(results) / elapsed if elapsed > 0 else 0.0,
    p50_ms=statistics.median(ok_latencies) if ok_latencies else 0.0,
    p95_ms=percentile(ok_latencies, 0.95),
    p99_ms=percentile(ok_latencies, 0.99),
    errors=errors,
  )


def print_header(targets: list[str], path: str) -> None:
  """Print the table header and what is being driven."""
  print(f"targets={','.join(targets)} path={path}")
  print(f"{'conc':>5} {'rps':>9} {'p50 ms':>9} {'p95 ms':>9} {'p99 ms':>9} {'err':>6} {'L=rps*p50':>10}")


def print_row(result: StageResult) -> None:
  """Print one stage, including the Little's law concurrency implied by the numbers."""
  little = result.rps * result.p50_ms / 1000
  print(
    f"{result.concurrency:>5} {result.rps:>9.1f} {result.p50_ms:>9.1f} "
    f"{result.p95_ms:>9.1f} {result.p99_ms:>9.1f} {result.errors:>6} {little:>10.1f}"
  )


def parse_args() -> argparse.Namespace:
  """Parse command line options."""
  parser = argparse.ArgumentParser(description="closed-loop load driver")
  parser.add_argument("--targets", default="http://127.0.0.1:8080", help="comma separated base URLs")
  parser.add_argument("--path", default="/order")
  parser.add_argument("--stages", default="1,2,4,8,16,32,64,128", help="comma separated concurrency levels")
  parser.add_argument("--seconds", type=float, default=5.0, help="duration of each stage")
  return parser.parse_args()


def main() -> None:
  """Run every stage in order and print one row per stage."""
  args = parse_args()
  targets = args.targets.split(",")
  print_header(targets, args.path)
  for stage in [int(value) for value in args.stages.split(",")]:
    print_row(run_stage(targets, args.path, stage, args.seconds))


if __name__ == "__main__":
  main()
