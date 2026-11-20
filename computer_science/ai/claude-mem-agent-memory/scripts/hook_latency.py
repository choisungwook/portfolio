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
EVENT = {"session_id": "bench", "cwd": "/tmp/bench/shop", "tool_name": "Bash", "tool_input": {"command": "ls"}, "tool_response": {"stdout": "a b c"}}


def elapsed_ms(args: list[str], env: dict, event: dict) -> float:
  """명령 1회 실행 시간을 밀리초로 반환한다."""
  start = time.perf_counter()
  subprocess.run(args, input=json.dumps(event), text=True, capture_output=True, env=env)
  return (time.perf_counter() - start) * 1000


def measure(name: str, args: list[str], env: dict, event: dict = EVENT, runs: int = 10) -> None:
  """같은 명령을 여러 번 실행하고 중앙값과 최댓값을 출력한다."""
  samples = [elapsed_ms(args, env, event) for _ in range(runs)]
  print(f"{name}: median {statistics.median(samples):.0f} ms, max {max(samples):.0f} ms")


def main() -> None:
  """uv run 경유와 venv 직접 실행의 PostToolUse hook, 그리고 Stop hook을 측정한다."""
  with tempfile.TemporaryDirectory() as home:
    env = {**os.environ, "MINIMEM_HOME": home}
    venv_hook = str(MINIMEM / ".venv" / "bin" / "minimem-hook")
    measure("PostToolUse, uv run 경유", ["uv", "run", "--quiet", "--project", str(MINIMEM), "minimem-hook", "tool"], env)
    measure("PostToolUse, venv 직접 실행", [venv_hook, "tool"], env)
    # 이벤트가 없는 세션으로 Stop을 보내 observer가 claude를 호출하지 않고 바로 끝나게 한다.
    measure("Stop, observer 분리 실행", [venv_hook, "stop"], env, {**EVENT, "session_id": "bench-stop"}, runs=3)
    time.sleep(3)


if __name__ == "__main__":
  main()
