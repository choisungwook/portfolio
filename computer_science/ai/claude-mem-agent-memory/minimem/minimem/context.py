"""SessionStart에 주입할 컨텍스트 블록을 만든다."""

import json
import sqlite3

from minimem import db
from minimem.config import CONTEXT_MAX_CHARS, CONTEXT_OBSERVATION_LIMIT


def index_row(obs: sqlite3.Row) -> str:
  """관찰 1건을 한 줄 인덱스로 만든다. 본문은 넣지 않는다."""
  files = ", ".join(json.loads(obs["files"])[:2])
  return f"#{obs['id']} [{obs['type']}] {obs['title']}" + (f" ({files})" if files else "")


def summary_lines(summary: sqlite3.Row | None) -> list[str]:
  """가장 최근 세션 요약을 몇 줄로 만든다."""
  if summary is None:
    return []
  fields = [("요청", "request"), ("완료", "completed"), ("알게 된 것", "learned"), ("다음 할 일", "next_steps")]
  return ["## 지난 세션 요약"] + [f"- {label}: {summary[key]}" for label, key in fields if summary[key]]


def render(project: str, summary: sqlite3.Row | None, observations: list[sqlite3.Row]) -> str:
  """요약과 관찰 인덱스를 하나의 텍스트로 만든다."""
  lines = [f"# minimem: {project} 프로젝트의 지난 작업 기록", ""]
  lines += summary_lines(summary)
  lines += ["", "## 관찰 인덱스 (최신순, 본문은 mcp__minimem__get_observations로 id를 지정해 조회)"]
  lines += [index_row(o) for o in observations]
  return "\n".join(lines)


def build_context(conn: sqlite3.Connection, project: str, limit: int = CONTEXT_OBSERVATION_LIMIT, max_chars: int = CONTEXT_MAX_CHARS) -> str:
  """요약과 관찰 인덱스를 합친 컨텍스트를 반환한다. 기록이 없으면 빈 문자열이다.

  Claude Code는 hook 출력이 10,000자를 넘으면 앞부분 미리보기만 모델에 넣으므로,
  max_chars를 넘는 동안 가장 오래된 관찰부터 뺀다.
  """
  observations = list(db.recent_observations(conn, project, limit))
  summary = db.latest_summary(conn, project)
  if not observations and summary is None:
    return ""
  text = render(project, summary, observations)
  while len(text) > max_chars and len(observations) > 1:
    observations.pop()
    text = render(project, summary, observations)
  return text
