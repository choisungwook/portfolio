"""Claude Code hook 진입점. stdin으로 받은 이벤트 JSON을 처리한다.

사용: minimem-hook <session-start|prompt|tool|stop>
"""

import json
import os
import subprocess
import sys

from minimem import db
from minimem.config import MAX_FIELD_CHARS, is_disabled, project_name
from minimem.context import build_context


def truncate(value: object) -> str:
  """도구 입력·출력을 문자열로 바꾸고 길이를 제한한다."""
  text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
  if len(text) <= MAX_FIELD_CHARS:
    return text
  half = MAX_FIELD_CHARS // 2
  return f"{text[:half]}\n...[{len(text) - MAX_FIELD_CHARS} chars truncated]...\n{text[-half:]}"


def on_session_start(event: dict) -> None:
  """지난 관찰 인덱스를 additionalContext로 출력해 새 세션에 주입한다."""
  conn = db.connect()
  context = build_context(conn, project_name(event["cwd"]))
  if context:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}, ensure_ascii=False))


def on_prompt(event: dict) -> None:
  """세션의 첫 사용자 프롬프트를 기록한다. observer가 작업 의도를 알기 위해 쓴다."""
  conn = db.connect()
  db.upsert_session(conn, event["session_id"], project_name(event["cwd"]), event["cwd"], event.get("prompt", ""))


SKIP_TOOLS = ("mcp__minimem__", "ToolSearch")


def should_skip(tool_name: str) -> bool:
  """메모리를 읽는 도구 호출인지 확인한다. 이것까지 기록하면 '메모리를 조회했다'는 관찰이 쌓인다."""
  return tool_name.startswith(SKIP_TOOLS)


def on_tool(event: dict) -> None:
  """도구 호출 1건을 LLM 없이 원본 그대로 저장한다. hook은 빨리 끝나야 한다."""
  if should_skip(event["tool_name"]):
    return
  conn = db.connect()
  db.insert_event(
    conn,
    event["session_id"],
    project_name(event["cwd"]),
    event["tool_name"],
    truncate(event.get("tool_input", "")),
    truncate(event.get("tool_response", "")),
  )


def on_stop(event: dict) -> None:
  """observer를 분리된 프로세스로 띄우고 바로 반환한다."""
  subprocess.Popen(
    [sys.executable, "-m", "minimem.observer", event["session_id"]],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    start_new_session=True,
    env={**os.environ, "MINIMEM_DISABLE": "1"},
  )


HANDLERS = {"session-start": on_session_start, "prompt": on_prompt, "tool": on_tool, "stop": on_stop}


def main() -> None:
  """hook 이벤트를 읽어 처리한다. 실패해도 exit 0으로 끝내 에이전트 작업을 멈추지 않는다."""
  if is_disabled() or len(sys.argv) < 2:
    return
  try:
    HANDLERS[sys.argv[1]](json.load(sys.stdin))
  except Exception as err:
    print(f"minimem hook error: {err}", file=sys.stderr)


if __name__ == "__main__":
  main()
