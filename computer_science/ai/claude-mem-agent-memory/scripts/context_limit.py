# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""SessionStart hook의 additionalContext 길이별로 끝부분 문자열이 모델에 전달되는지 확인한다.

사용: uv run scripts/context_limit.py [--ko] [길이 ...]   (기본 9900 10100)
--ko는 채움 문자를 x 대신 한글 '가'로 바꿔 한도가 글자 수 기준인지 바이트 기준인지 확인한다.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

MARKER = "MARKER-BLUE-FALCON-7"
GENERATOR = f"""import json, sys
n, fill = int(sys.argv[1]), sys.argv[2]
body = fill * (n - {len(MARKER) + 1}) + "\\n{MARKER}"
print(json.dumps({{"hookSpecificOutput": {{"hookEventName": "SessionStart", "additionalContext": body}}}}))
"""
PROMPT = "세션 시작 컨텍스트 맨 끝에 있는 MARKER로 시작하는 문자열을 그대로 출력해. 도구는 쓰지 마. 보이지 않으면 '없음'이라고 답해."


def write_project(root: Path, length: int, fill: str) -> None:
  """fill 문자로 채운 길이 length의 additionalContext를 출력하는 SessionStart hook을 설정한다."""
  (root / "gen.py").write_text(GENERATOR)
  hook = {"type": "command", "command": f"python3 {root / 'gen.py'} {length} {fill}"}
  (root / ".claude").mkdir(exist_ok=True)
  (root / ".claude" / "settings.json").write_text(json.dumps({"hooks": {"SessionStart": [{"hooks": [hook]}]}}))


def ask(root: Path) -> str:
  """새 세션을 열어 MARKER를 물어보고 답을 반환한다."""
  args = ["claude", "-p", PROMPT, "--model", "haiku", "--tools=", "--no-session-persistence"]
  return subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=120).stdout.strip()


def main() -> None:
  """길이마다 MARKER 전달 여부를 출력한다."""
  fill = "가" if "--ko" in sys.argv else "x"
  lengths = [int(a) for a in sys.argv[1:] if a != "--ko"] or [9900, 10100]
  for length in lengths:
    with tempfile.TemporaryDirectory() as tmp:
      write_project(Path(tmp), length, fill)
      answer = ask(Path(tmp))
    print(f"additionalContext {length}자({fill}): marker {'전달됨' if MARKER in answer else '전달 안 됨'}")


if __name__ == "__main__":
  main()
