# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""관찰 제목을 FTS5 토크나이저별로 색인하고 한국어 검색어의 적중 수를 비교한다.

사용: uv run scripts/tokenizer_compare.py [--db]
인자가 없으면 고정 문장 4개를 쓰고, --db를 주면 minimem DB의 관찰을 쓴다.
"""

import os
import sqlite3
import sys
from pathlib import Path

QUERIES = ["방문객", "방문", "직원", "입장", "집계", "확정", "놀이공원", "폐장"]
SAMPLE = [
  (1, "놀이공원 방문객을 137명으로 기록했다", "", ""),
  (2, "직원은 방문객 집계에서 제외한다", "", ""),
  (3, "입장을 마치면 오후 6시에 방문객 수를 확정한다", "", ""),
  (4, "폐장 안내는 출입구에 붙인다", "", ""),
]
TOKENIZERS = ["unicode61", "trigram"]


def load_rows(path: Path) -> list[tuple]:
  """관찰의 id, 제목, 사실, 서술을 읽는다."""
  with sqlite3.connect(path) as conn:
    return conn.execute("SELECT id, title, facts, narrative FROM observations").fetchall()


def build_index(rows: list[tuple], tokenizer: str) -> sqlite3.Connection:
  """메모리 DB에 지정한 토크나이저로 FTS5 색인을 만든다."""
  conn = sqlite3.connect(":memory:")
  conn.execute(f"CREATE VIRTUAL TABLE fts USING fts5(title, facts, narrative, tokenize='{tokenizer}')")
  conn.executemany("INSERT INTO fts(rowid, title, facts, narrative) VALUES (?, ?, ?, ?)", rows)
  return conn


def match_count(conn: sqlite3.Connection, query: str) -> int:
  """MATCH로 찾은 관찰 수를 반환한다."""
  return conn.execute("SELECT COUNT(*) FROM fts WHERE fts MATCH ?", (f'"{query}"',)).fetchone()[0]


def like_count(rows: list[tuple], query: str) -> int:
  """부분 문자열 포함 여부로 센 정답 개수를 반환한다."""
  return sum(1 for r in rows if any(query in str(col) for col in r[1:]))


def minimem_count(indexes: dict, rows: list[tuple], query: str) -> int:
  """minimem 방식: 3글자 이상은 trigram, 미만은 LIKE로 센다."""
  return match_count(indexes["trigram"], query) if len(query) >= 3 else like_count(rows, query)


def main() -> None:
  """검색어마다 정답 수와 토크나이저별 적중 수를 표로 출력한다."""
  db = Path(os.environ.get("MINIMEM_HOME", Path.home() / ".minimem")) / "memory.db"
  rows = load_rows(db) if "--db" in sys.argv else SAMPLE
  indexes = {t: build_index(rows, t) for t in TOKENIZERS}
  print(f"관찰 {len(rows)}건")
  print("| 검색어 | 부분 문자열 정답 | " + " | ".join(TOKENIZERS) + " | minimem(trigram+LIKE) |")
  print("| --- | --- | " + " | ".join("---" for _ in TOKENIZERS) + " | --- |")
  for q in QUERIES:
    counts = " | ".join(str(match_count(indexes[t], q)) for t in TOKENIZERS)
    print(f"| {q} | {like_count(rows, q)} | {counts} | {minimem_count(indexes, rows, q)} |")


if __name__ == "__main__":
  main()
