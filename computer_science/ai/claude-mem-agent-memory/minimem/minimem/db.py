"""SQLite 스키마와 읽기·쓰기 함수."""

import json
import sqlite3
import time
from pathlib import Path

from minimem.config import db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  cwd TEXT NOT NULL,
  user_prompt TEXT,
  started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input TEXT NOT NULL,
  tool_output TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  facts TEXT NOT NULL,
  narrative TEXT NOT NULL,
  files TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  request TEXT,
  learned TEXT,
  completed TEXT,
  next_steps TEXT,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, facts, narrative,
  content='observations', content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, facts, narrative)
  VALUES (new.id, new.title, new.facts, new.narrative);
END;
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
  """DB에 연결하고 스키마를 보장한다."""
  target = path or db_path()
  target.parent.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(target, timeout=10)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA journal_mode=WAL")
  conn.executescript(SCHEMA)
  return conn


def now() -> int:
  """현재 시각을 epoch 초로 반환한다."""
  return int(time.time())


def upsert_session(conn: sqlite3.Connection, session_id: str, project: str, cwd: str, prompt: str) -> None:
  """세션의 첫 프롬프트와 작업 디렉터리를 기록한다. 이미 있으면 그대로 둔다."""
  conn.execute(
    "INSERT OR IGNORE INTO sessions(session_id, project, cwd, user_prompt, started_at) VALUES (?, ?, ?, ?, ?)",
    (session_id, project, cwd, prompt, now()),
  )
  conn.commit()


def insert_event(conn: sqlite3.Connection, session_id: str, project: str, tool: str, tool_input: str, tool_output: str) -> None:
  """PostToolUse로 받은 도구 호출 1건을 원본 그대로 저장한다."""
  conn.execute(
    "INSERT INTO events(session_id, project, tool_name, tool_input, tool_output, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    (session_id, project, tool, tool_input, tool_output, now()),
  )
  conn.commit()


def pending_events(conn: sqlite3.Connection, session_id: str) -> list[sqlite3.Row]:
  """observer가 아직 처리하지 않은 이벤트를 시간순으로 반환한다."""
  return conn.execute("SELECT * FROM events WHERE session_id = ? AND processed = 0 ORDER BY id", (session_id,)).fetchall()


def mark_processed(conn: sqlite3.Connection, event_ids: list[int]) -> None:
  """처리한 이벤트를 표시해 다음 observer 실행이 다시 압축하지 않게 한다."""
  conn.executemany("UPDATE events SET processed = 1 WHERE id = ?", [(i,) for i in event_ids])
  conn.commit()


def insert_observation(conn: sqlite3.Connection, session_id: str, project: str, obs: dict) -> int:
  """observer가 만든 관찰 1건을 저장하고 id를 반환한다."""
  cur = conn.execute(
    "INSERT INTO observations(session_id, project, type, title, facts, narrative, files, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    (
      session_id,
      project,
      obs["type"],
      obs["title"],
      json.dumps(obs["facts"], ensure_ascii=False),
      obs["narrative"],
      json.dumps(obs["files"], ensure_ascii=False),
      now(),
    ),
  )
  conn.commit()
  return cur.lastrowid


def upsert_summary(conn: sqlite3.Connection, session_id: str, project: str, summary: dict) -> None:
  """세션 요약을 저장한다. 같은 세션의 요약은 마지막 것으로 덮어쓴다."""
  conn.execute(
    "INSERT OR REPLACE INTO summaries(session_id, project, request, learned, completed, next_steps, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    (session_id, project, summary.get("request"), summary.get("learned"), summary.get("completed"), summary.get("next_steps"), now()),
  )
  conn.commit()


def session_info(conn: sqlite3.Connection, session_id: str) -> tuple[str, str]:
  """세션을 시작한 사용자 프롬프트와 작업 디렉터리를 반환한다."""
  row = conn.execute("SELECT user_prompt, cwd FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
  return (row["user_prompt"], row["cwd"]) if row else ("", "")


def recent_observations(conn: sqlite3.Connection, project: str, limit: int) -> list[sqlite3.Row]:
  """프로젝트의 최근 관찰을 최신순으로 반환한다."""
  return conn.execute("SELECT * FROM observations WHERE project = ? ORDER BY id DESC LIMIT ?", (project, limit)).fetchall()


def latest_summary(conn: sqlite3.Connection, project: str) -> sqlite3.Row | None:
  """프로젝트의 가장 최근 세션 요약을 반환한다."""
  return conn.execute("SELECT * FROM summaries WHERE project = ? ORDER BY id DESC LIMIT 1", (project,)).fetchone()


def observations_by_ids(conn: sqlite3.Connection, ids: list[int]) -> list[sqlite3.Row]:
  """id 목록에 해당하는 관찰 전체를 반환한다."""
  marks = ",".join("?" for _ in ids)
  return conn.execute(f"SELECT * FROM observations WHERE id IN ({marks}) ORDER BY id", ids).fetchall()
