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

QUERIES = ["할인", "할인율", "버그", "쿠폰", "중복", "적용", "pytest", "테스트"]
SAMPLE = [
  (1, "apply_discount에서 할인율을 100으로 나누지 않던 버그 수정", "", ""),
  (2, "쿠폰 중복 적용을 막는 apply_coupons 구현", "", ""),
  (3, "현재 환경에는 pytest가 없어 unittest로 테스트를 실행함", "", ""),
  (4, "할인 금액은 정수 나눗셈으로 계산한다", "", ""),
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
