"""observer: 원본 도구 이벤트를 구조화된 관찰과 세션 요약으로 압축한다.

사용: python -m minimem.observer <session_id>
"""

import json
import os
import re
import subprocess
import sys
import tempfile

from minimem import db

OBSERVER_MODEL = os.environ.get("MINIMEM_OBSERVER_MODEL", "haiku")
OBS_TYPES = ("bugfix", "feature", "decision", "discovery", "change")

INSTRUCTIONS = f"""너는 다른 코딩 에이전트의 작업을 옆에서 지켜보는 기록 담당이다. 너 자신은 작업하지 않는다.
아래 <events>는 그 에이전트가 실행한 도구 호출이다. 다음 세션의 에이전트가 같은 파일을 다시 읽지 않아도 되도록,
나중에 다시 쓸 가치가 있는 사실만 관찰로 남겨라. 단순 조회나 실패 후 재시도는 기록하지 않는다.
모든 내용은 한국어로 쓰고, 함수 이름은 원문 그대로, 파일 경로는 <project_root> 기준 상대 경로로 쓴다. 도구 호출을 하지 말고 아래 XML만 출력한다.

<observation>
  <type>{" | ".join(OBS_TYPES)} 중 하나</type>
  <title>한 줄 제목</title>
  <facts><fact>검증 가능한 사실 하나</fact></facts>
  <narrative>무엇을 왜 했는지 2~3문장</narrative>
  <files><file>관련 파일 경로</file></files>
</observation>
(관찰은 0개 이상)
<summary>
  <request>사용자가 요청한 것</request>
  <learned>알게 된 것</learned>
  <completed>끝낸 것</completed>
  <next_steps>남은 일</next_steps>
</summary>
"""


def build_prompt(user_prompt: str, project_root: str, events: list) -> str:
  """observer에게 보낼 사용자 메시지를 만든다. 지시문은 system prompt로 따로 보낸다."""
  lines = [f"<project_root>{project_root}</project_root>", f"<user_request>{user_prompt}</user_request>", "<events>"]
  for e in events:
    lines.append(f'<event tool="{e["tool_name"]}">\n<input>{e["tool_input"]}</input>\n<output>{e["tool_output"]}</output>\n</event>')
  lines.append("</events>")
  return "\n".join(lines)


OBSERVER_FLAGS = [
  "--tools=",
  "--setting-sources=",
  "--strict-mcp-config",
  "--no-session-persistence",
  "--output-format=json",
]


def call_llm(prompt: str) -> str:
  """도구, 설정, MCP를 모두 끈 claude CLI를 프로젝트 밖 임시 디렉터리에서 호출하고 응답 텍스트를 반환한다."""
  with tempfile.TemporaryDirectory() as workdir:
    result = subprocess.run(
      ["claude", "-p", "--model", OBSERVER_MODEL, "--system-prompt", INSTRUCTIONS, *OBSERVER_FLAGS],
      input=prompt,
      capture_output=True,
      text=True,
      cwd=workdir,
      timeout=300,
      env={**os.environ, "MINIMEM_DISABLE": "1"},
    )
  result.check_returncode()
  return json.loads(result.stdout)["result"]


def tag(block: str, name: str) -> str:
  """XML 조각에서 첫 번째 태그 값을 꺼낸다. 형식이 깨져도 동작하도록 정규식을 쓴다."""
  match = re.search(rf"<{name}>(.*?)</{name}>", block, re.DOTALL)
  return match.group(1).strip() if match else ""


def tags(block: str, name: str) -> list[str]:
  """XML 조각에서 같은 이름의 태그 값을 모두 꺼낸다."""
  return [v.strip() for v in re.findall(rf"<{name}>(.*?)</{name}>", block, re.DOTALL) if v.strip()]


def parse_observations(text: str) -> list[dict]:
  """observer 응답에서 관찰 목록을 파싱한다. type이 허용 목록에 없으면 change로 둔다."""
  result = []
  for block in re.findall(r"<observation>(.*?)</observation>", text, re.DOTALL):
    obs_type = tag(block, "type")
    result.append(
      {
        "type": obs_type if obs_type in OBS_TYPES else "change",
        "title": tag(block, "title"),
        "facts": tags(block, "fact"),
        "narrative": tag(block, "narrative"),
        "files": tags(block, "file"),
      }
    )
  return [o for o in result if o["title"]]


def parse_summary(text: str) -> dict:
  """observer 응답에서 세션 요약을 파싱한다."""
  block = tag(text, "summary")
  return {key: tag(block, key) for key in ("request", "learned", "completed", "next_steps")}


def observe(session_id: str) -> int:
  """세션의 미처리 이벤트를 압축해 저장하고, 저장한 관찰 개수를 반환한다."""
  conn = db.connect()
  events = db.pending_events(conn, session_id)
  if not events:
    return 0
  project = events[0]["project"]
  user_prompt, project_root = db.session_info(conn, session_id)
  response = call_llm(build_prompt(user_prompt, project_root, events))
  observations = parse_observations(response)
  for obs in observations:
    db.insert_observation(conn, session_id, project, obs)
  db.upsert_summary(conn, session_id, project, parse_summary(response))
  db.mark_processed(conn, [e["id"] for e in events])
  return len(observations)


if __name__ == "__main__":
  print(observe(sys.argv[1]))
