"""관찰 검색을 MCP stdio 서버로 노출한다. 에이전트는 필요할 때만 본문을 가져온다."""

import os

from mcp.server.mcpserver import MCPServer

from minimem import db, search as memsearch
from minimem.config import project_name

server = MCPServer("minimem")


def current_project() -> str:
  """Claude Code가 넘겨준 프로젝트 디렉터리로 프로젝트 키를 정한다."""
  return project_name(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))


@server.tool()
def search(query: str, limit: int = 10) -> str:
  """지난 세션의 관찰을 검색해 '#id [type] 제목' 한 줄 인덱스로 반환한다.

  공백으로 나눈 단어 중 하나라도 포함하면 결과에 넣고 일치 단어가 많은 순으로 정렬한다. 본문은 get_observations로 조회한다.
  """
  return memsearch.search(db.connect(), current_project(), query, limit)


@server.tool()
def get_observations(ids: list[int]) -> str:
  """search나 SessionStart 인덱스에서 고른 관찰 id의 사실, 서술, 파일 목록을 반환한다. 여러 id를 한 번에 넘긴다."""
  return memsearch.get_observations(db.connect(), ids)


def main() -> None:
  """stdio로 MCP 서버를 실행한다."""
  server.run()


if __name__ == "__main__":
  main()
