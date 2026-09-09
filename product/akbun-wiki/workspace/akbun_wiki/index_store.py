"""SQLite index: sync state, API keys, and searchable wiki articles.

The files under the data directory are the source of truth. This database
is rebuilt from them on every build, except for API keys and sync state.
"""
import hashlib
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('read','admin')),
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS articles (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(slug UNINDEXED, title, body);
"""

KEY_BYTES = 32


@dataclass(frozen=True)
class ApiKey:
  """A key row without its secret."""

  id: str
  name: str
  role: str
  created_at: str
  revoked_at: str | None


@dataclass(frozen=True)
class Article:
  """One wiki article."""

  slug: str
  title: str
  body: str
  updated_at: str


def now() -> str:
  """UTC timestamp in ISO 8601 with second precision."""
  return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hash_key(key: str) -> str:
  """SHA-256 hex of a secret; the secret itself is never stored."""
  return hashlib.sha256(key.encode("utf-8")).hexdigest()


class IndexStore:
  """Thin wrapper over one SQLite connection."""

  def __init__(self, path: Path | str) -> None:
    self.connection = sqlite3.connect(str(path))
    self.connection.row_factory = sqlite3.Row
    self.connection.executescript(SCHEMA)

  def close(self) -> None:
    """Close the connection."""
    self.connection.close()

  def get_state(self, key: str, default: str = "") -> str:
    """Read one state value."""
    row = self.connection.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    return default if row is None else str(row["value"])

  def set_state(self, key: str, value: str) -> None:
    """Write one state value."""
    with self.connection:
      self.connection.execute("INSERT INTO state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))

  def create_key(self, name: str, role: str) -> tuple[ApiKey, str]:
    """Issue a key and return it with its secret, shown once."""
    if role not in ("read", "admin"):
      raise ValueError("role must be read or admin")
    secret = secrets.token_hex(KEY_BYTES)
    key = ApiKey(id=str(uuid.uuid4()), name=name, role=role, created_at=now(), revoked_at=None)
    with self.connection:
      self.connection.execute("INSERT INTO api_keys(id, name, role, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                              (key.id, key.name, key.role, hash_key(secret), key.created_at))
    return key, secret

  def list_keys(self) -> list[ApiKey]:
    """All keys, newest first, without hashes."""
    rows = self.connection.execute("SELECT id, name, role, created_at, revoked_at FROM api_keys ORDER BY created_at DESC, id").fetchall()
    return [ApiKey(**dict(row)) for row in rows]

  def revoke_key(self, key_id: str) -> bool:
    """Revoke a key; returns False when it does not exist or is already revoked."""
    with self.connection:
      cursor = self.connection.execute("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (now(), key_id))
    return cursor.rowcount == 1

  def authenticate(self, secret: str) -> ApiKey | None:
    """Look up an unrevoked key by its secret."""
    row = self.connection.execute("SELECT id, name, role, created_at, revoked_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
                                  (hash_key(secret),)).fetchone()
    return None if row is None else ApiKey(**dict(row))

  def replace_articles(self, articles: list[Article]) -> None:
    """Swap the whole article index in one transaction."""
    with self.connection:
      self.connection.execute("DELETE FROM articles")
      self.connection.execute("DELETE FROM articles_fts")
      self.connection.executemany("INSERT INTO articles(slug, title, body, updated_at) VALUES (?, ?, ?, ?)",
                                  [(a.slug, a.title, a.body, a.updated_at) for a in articles])
      self.connection.executemany("INSERT INTO articles_fts(slug, title, body) VALUES (?, ?, ?)",
                                  [(a.slug, a.title, a.body) for a in articles])

  def list_articles(self) -> list[Article]:
    """Every article ordered by slug, with body."""
    rows = self.connection.execute("SELECT slug, title, body, updated_at FROM articles ORDER BY slug").fetchall()
    return [Article(**dict(row)) for row in rows]

  def get_article(self, slug: str) -> Article | None:
    """One article by slug."""
    row = self.connection.execute("SELECT slug, title, body, updated_at FROM articles WHERE slug = ?", (slug,)).fetchone()
    return None if row is None else Article(**dict(row))

  def search(self, query: str, limit: int = 20) -> list[tuple[str, str, str]]:
    """Full-text search returning (slug, title, snippet) ordered by rank."""
    quoted = " ".join(f'"{term}"' for term in query.replace('"', " ").split())
    if not quoted:
      return []
    rows = self.connection.execute(
      "SELECT slug, title, snippet(articles_fts, 2, '[', ']', '…', 12) AS snippet FROM articles_fts WHERE articles_fts MATCH ? ORDER BY rank LIMIT ?",
      (quoted, limit)).fetchall()
    return [(str(row["slug"]), str(row["title"]), str(row["snippet"])) for row in rows]
