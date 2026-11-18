# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""lab 프로젝트에서 claude -p 세션 1개를 실행하고 도구 호출 수, 토큰, 시간, 답변을 출력한다.

사용: uv run scripts/run_session.py [--no-memory] <lab 디렉터리> "<프롬프트>"
--no-memory는 hook을 무력화하고 MCP 서버를 연결하지 않아 메모리가 없는 기준선을 만든다.
"""

import json
import os
import subprocess
import sys
from collections import Counter

ALLOWED_TOOLS = "Read,Write,Edit,Glob,Grep,Bash(python *),Bash(python3 *),mcp__minimem__search,mcp__minimem__get_observations"
CLAUDE_ARGS = [
  "--model=sonnet",
  "--output-format=stream-json",
  "--verbose",
  "--no-session-persistence",
  "--strict-mcp-config",
  f"--allowedTools={ALLOWED_TOOLS}",
]


def run(lab_dir: str, prompt: str, memory: bool) -> list[dict]:
  """claude를 실행하고 stream-json 이벤트 목록을 반환한다."""
  args = ["claude", "-p", prompt, *CLAUDE_ARGS] + (["--mcp-config", ".mcp.json"] if memory else [])
  env = os.environ if memory else {**os.environ, "MINIMEM_DISABLE": "1"}
  proc = subprocess.run(args, cwd=lab_dir, capture_output=True, text=True, timeout=600, env=env)
  if os.environ.get("RUN_SESSION_LOG"):
    with open(os.environ["RUN_SESSION_LOG"], "w") as f:
      f.write(proc.stdout)
  return [json.loads(line) for line in proc.stdout.splitlines() if line.startswith("{")]


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


def report(events: list[dict]) -> None:
  """세션 지표와 최종 답변을 출력한다."""
  result = next(e for e in events if e.get("type") == "result")
  usage = result["usage"]
  input_tokens = usage["input_tokens"] + usage["cache_creation_input_tokens"] + usage["cache_read_input_tokens"]
  calls = tool_calls(events)
  print(f"session_id: {result['session_id']}")
  print(f"injected_context_chars: {len(init_context(events))}")
  print(f"tool_calls: {sum(calls.values())} {dict(calls)}")
  print(f"turns: {result['num_turns']}  input_tokens: {input_tokens}  output_tokens: {usage['output_tokens']}  duration_s: {result['duration_ms'] / 1000:.1f}")
  print("--- answer ---")
  print(result["result"])


def main() -> None:
  """인자로 받은 디렉터리와 프롬프트로 세션을 실행한다."""
  args = sys.argv[1:]
  memory = args[0] != "--no-memory"
  if not memory:
    args = args[1:]
  report(run(args[0], args[1], memory))


if __name__ == "__main__":
  main()
