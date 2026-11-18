"""관찰 검색. 단어마다 FTS5 trigram(3글자 이상) 또는 LIKE(3글자 미만)로 찾고 일치 수로 정렬한다."""

import json
import sqlite3

from minimem import db
from minimem.context import index_row

TRIGRAM_MIN_CHARS = 3


def term_ids(conn: sqlite3.Connection, project: str, term: str) -> set[int]:
  """검색어 1개에 맞는 관찰 id 집합을 반환한다. 3글자 이상은 FTS5 trigram, 그보다 짧으면 LIKE를 쓴다."""
  if len(term) >= TRIGRAM_MIN_CHARS:
    sql = "SELECT o.id FROM observations o JOIN observations_fts f ON f.rowid = o.id WHERE o.project = ? AND observations_fts MATCH ?"
    param = '"' + term.replace('"', '""') + '"'
  else:
    sql = "SELECT id FROM observations WHERE project = ? AND (title || facts || narrative) LIKE ?"
    param = f"%{term}%"
  return {row[0] for row in conn.execute(sql, (project, param))}


def search_ids(conn: sqlite3.Connection, project: str, query: str, limit: int, mode: str = "or") -> list[int]:
  """검색어에 맞는 관찰 id를 반환한다.

  mode가 and면 모든 단어를 포함한 관찰만, or면 한 단어라도 포함한 관찰을 고른다.
  일치한 단어 수가 많은 순, 같으면 최신순으로 정렬한다.
  """
  hits = [term_ids(conn, project, t) for t in query.split()]
  scores: dict[int, int] = {}
  for ids in hits:
    for obs_id in ids:
      scores[obs_id] = scores.get(obs_id, 0) + 1
  required = len(hits) if mode == "and" else 1
  matched = [i for i, score in scores.items() if score >= required]
  return sorted(matched, key=lambda i: (-scores[i], -i))[:limit]


def search(conn: sqlite3.Connection, project: str, query: str, limit: int = 10, mode: str = "or") -> str:
  """1단계: 검색 결과를 관련도순 한 줄 인덱스로 반환한다."""
  ids = search_ids(conn, project, query, limit, mode)
  rows = {r["id"]: r for r in db.observations_by_ids(conn, ids)} if ids else {}
  return "\n".join(index_row(rows[i]) for i in ids) or "검색 결과 없음"


def full_text(row: sqlite3.Row) -> str:
  """관찰 1건의 전체 내용을 만든다."""
  facts = "\n".join(f"- {f}" for f in json.loads(row["facts"]))
  files = ", ".join(json.loads(row["files"]))
  return f"#{row['id']} [{row['type']}] {row['title']}\n{facts}\n{row['narrative']}\nfiles: {files}"


def get_observations(conn: sqlite3.Connection, ids: list[int]) -> str:
  """2단계: 고른 id의 전체 내용을 반환한다."""
  return "\n\n".join(full_text(r) for r in db.observations_by_ids(conn, ids)) or "해당 id 없음"
