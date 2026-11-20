# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""minimem hook 실행 시간을 측정한다. 임시 MINIMEM_HOME을 써서 실습 DB를 건드리지 않고, claude는 호출하지 않는다.

사용: uv run scripts/hook_latency.py
"""

import json
import os
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

MINIMEM = Path(__file__).resolve().parent.parent / "minimem"
EVENT = {
  "session_id": "bench",
  "cwd": "/tmp/bench/park",
  "tool_name": "Write",
  "tool_input": {"file_path": "attendance.txt", "content": "137\n"},
  "tool_response": "파일을 만들었습니다.",
}


def elapsed_ms(args: list[str], env: dict, event: dict) -> float:
  """명령 1회 실행 시간을 밀리초로 반환한다."""
  start = time.perf_counter()
  subprocess.run(args, input=json.dumps(event), text=True, stdout=subprocess.DEVNULL, env=env, check=True)
  return (time.perf_counter() - start) * 1000


def measure(name: str, args: list[str], env: dict, event: dict = EVENT, runs: int = 10) -> None:
  """같은 명령을 여러 번 실행하고 중앙값과 최댓값을 출력한다."""
  samples = [elapsed_ms(args, env, event) for _ in range(runs)]
  print(f"{name}: median {statistics.median(samples):.0f} ms, max {max(samples):.0f} ms")


def main() -> None:
  """uv run 경유와 venv 직접 실행의 PostToolUse hook을 측정한다."""
  with tempfile.TemporaryDirectory() as home:
    env = {**os.environ, "MINIMEM_HOME": home, "UV_PROJECT_ENVIRONMENT": ".venv"}
    venv_hook = str(MINIMEM / ".venv" / "bin" / "minimem-hook")
    measure("PostToolUse, uv run 경유", ["uv", "run", "--quiet", "--project", str(MINIMEM), "minimem-hook", "tool"], env)
    measure("PostToolUse, venv 직접 실행", [venv_hook, "tool"], env)


if __name__ == "__main__":
  main()
