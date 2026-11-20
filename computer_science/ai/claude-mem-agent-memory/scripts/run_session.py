# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""lab 프로젝트에서 claude -p 세션 1개를 실행하고 도구 호출 수, 토큰, 시간, 답변을 출력한다.

사용: python3 scripts/run_session.py --help
"""

import argparse
import json
import os
import subprocess
import time
from collections import Counter

ALLOWED_TOOLS = "Read,Write,Edit,Glob,Grep,Bash(python *),Bash(python3 *),mcp__minimem__search,mcp__minimem__get_observations"
CLAUDE_ARGS = [
  "--model=haiku",
  "--output-format=stream-json",
  "--verbose",
  "--no-session-persistence",
  "--strict-mcp-config",
  f"--allowedTools={ALLOWED_TOOLS}",
]
TIMEOUT_S = 60


def run(options: argparse.Namespace) -> list[dict]:
  """claude를 실행하고 stream-json 이벤트 목록을 반환한다."""
  args = ["claude", "-p", options.prompt, *CLAUDE_ARGS]
  if options.tools is not None:
    args.append(f"--tools={options.tools}")
  if not options.no_memory and not options.no_mcp:
    args.extend(["--mcp-config", ".mcp.json"])
  env = {**os.environ, "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
  if options.no_memory:
    env["MINIMEM_DISABLE"] = "1"
  proc = subprocess.run(args, cwd=options.lab_dir, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
  if os.environ.get("RUN_SESSION_LOG"):
    with open(os.environ["RUN_SESSION_LOG"], "w") as f:
      f.write(proc.stdout)
  events = [json.loads(line) for line in proc.stdout.splitlines() if line.startswith("{")]
  if not any(e.get("type") == "result" for e in events):
    raise SystemExit(proc.stderr.strip() or f"Claude Code가 결과 없이 종료됐습니다 (exit {proc.returncode}).")
  return events


def tool_calls(events: list[dict]) -> Counter:
  """assistant 메시지에서 tool_use 블록을 도구 이름별로 센다."""
  counter: Counter = Counter()
  for e in events:
    if e.get("type") == "assistant":
      counter.update(b["name"] for b in e["message"]["content"] if b.get("type") == "tool_use")
  return counter


def init_context(events: list[dict]) -> str:
  """SessionStart hook이 주입한 컨텍스트가 있으면 반환한다."""
  for e in events:
    if e.get("type") == "system" and e.get("subtype") == "hook_response" and "additionalContext" in e.get("stdout", ""):
      return json.loads(e["stdout"])["hookSpecificOutput"]["additionalContext"]
  return ""


def report(events: list[dict], wall_s: float) -> None:
  """세션 지표와 최종 답변을 출력한다."""
  result = next(e for e in events if e.get("type") == "result")
  if result.get("is_error"):
    raise SystemExit(result.get("result") or "\n".join(result.get("errors", [])) or "Claude Code 세션 실행에 실패했습니다.")
  usage = result["usage"]
  input_tokens = usage["input_tokens"] + usage["cache_creation_input_tokens"] + usage["cache_read_input_tokens"]
  calls = tool_calls(events)
  print(f"session_id: {result['session_id']}")
  print(f"injected_context_chars: {len(init_context(events))}")
  print(f"tool_calls: {sum(calls.values())} {dict(calls)}")
  print(f"turns: {result['num_turns']}  input_tokens: {input_tokens}  output_tokens: {usage['output_tokens']}  duration_s: {result['duration_ms'] / 1000:.1f}")
  print(f"wall_s: {wall_s:.1f}")
  print("--- answer ---")
  print(result["result"])


def main() -> None:
  """인자로 받은 디렉터리와 프롬프트로 세션을 실행한다."""
  parser = argparse.ArgumentParser(description="Claude Code 실습 세션을 실행하고 지표를 출력합니다.")
  parser.add_argument("--no-memory", action="store_true", help="minimem hook과 MCP 서버를 비활성화합니다.")
  parser.add_argument("--no-mcp", action="store_true", help="minimem hook을 유지하고 MCP 서버만 건너뜁니다.")
  parser.add_argument("--tools", help='사용할 기본 도구 이름. 빈 문자열("")은 기본 도구를 모두 끕니다.')
  parser.add_argument("lab_dir")
  parser.add_argument("prompt")
  start = time.perf_counter()
  try:
    events = run(parser.parse_args())
  except subprocess.TimeoutExpired as err:
    raise SystemExit(f"Claude Code에서 {TIMEOUT_S}초 안에 응답을 받지 못했습니다.") from err
  report(events, time.perf_counter() - start)


if __name__ == "__main__":
  main()
