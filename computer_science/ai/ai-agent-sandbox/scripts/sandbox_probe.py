from __future__ import annotations

import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

NETWORK_URL = "https://example.com"
WORKSPACE_PROBE_FILE = Path(".sandbox-probe-workspace.txt")
OUTSIDE_PROBE_FILE = Path("/Users/Shared/ai-agent-sandbox-outside-write.txt")
OUTSIDE_READ_FILE = Path("/etc/hosts")


@dataclass(frozen=True)
class ProbeResult:
  name: str
  expected_when_restricted: str
  outcome: str
  detail: str


def read_text(path: Path) -> str:
  return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> str:
  path.write_text(content, encoding="utf-8")
  return str(path)


def run_command(command: list[str]) -> str:
  completed = subprocess.run(
    command,
    check=True,
    capture_output=True,
    text=True,
    timeout=10,
  )
  return completed.stdout.strip() or completed.stderr.strip() or "ok"


def request_url(url: str) -> str:
  with urllib.request.urlopen(url, timeout=5) as response:
    return f"HTTP {response.status}"


def run_probe(
  name: str,
  expected_when_restricted: str,
  action: Callable[[], str],
) -> ProbeResult:
  try:
    detail = action()
    return ProbeResult(name, expected_when_restricted, "allowed", detail)
  except Exception as error:
    error_name = error.__class__.__name__
    return ProbeResult(name, expected_when_restricted, "blocked", f"{error_name}: {error}")


def workspace_read() -> str:
  text = read_text(Path("README.md"))
  return f"README.md {len(text)} bytes"


def workspace_write() -> str:
  return write_text(WORKSPACE_PROBE_FILE, "workspace write probe\n")


def outside_read() -> str:
  text = read_text(OUTSIDE_READ_FILE)
  return f"{OUTSIDE_READ_FILE} {len(text)} bytes"


def outside_write() -> str:
  return write_text(OUTSIDE_PROBE_FILE, "outside workspace write probe\n")


def network_access() -> str:
  return request_url(NETWORK_URL)


def shell_command() -> str:
  return run_command(["uname", "-s"])


def git_status() -> str:
  return run_command(["git", "status", "--short"])


def collect_results() -> list[ProbeResult]:
  return [
    run_probe("workspace file read", "allowed", workspace_read),
    run_probe("workspace file write", "allowed", workspace_write),
    run_probe("outside workspace file read", "profile dependent", outside_read),
    run_probe("outside workspace file write", "blocked", outside_write),
    run_probe("network request", "blocked", network_access),
    run_probe("shell command", "allowed", shell_command),
    run_probe("git status", "allowed", git_status),
  ]


def format_result(result: ProbeResult) -> str:
  return (
    f"{result.name:<30} "
    f"expected={result.expected_when_restricted:<17} "
    f"observed={result.outcome:<7} "
    f"{result.detail}"
  )


def main() -> None:
  print("AI agent sandbox probe")
  print(f"cwd={Path.cwd()}")
  print()

  for result in collect_results():
    print(format_result(result))

  print()
  print("해석: observed 값은 현재 실행 환경의 결과입니다. Codex/Claude 권한 설정이 바뀌면 결과도 달라질 수 있습니다.")


if __name__ == "__main__":
  main()
