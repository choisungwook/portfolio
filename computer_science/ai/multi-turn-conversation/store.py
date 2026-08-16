"""Conversation stores.

Same two methods everywhere: load() returns the message list to send to the
model, append() adds one message. Swapping the store never changes the API
call, because the accumulation lives in the application, not in the model.
"""

import json
from pathlib import Path
from typing import Any, Protocol


class Store(Protocol):
  """What the chat loop needs from a store."""

  def load(self) -> list[dict[str, Any]]:
    """Return every message of this session, oldest first."""
    ...

  def append(self, message: dict[str, Any]) -> None:
    """Add one message to the end of the session."""
    ...


class MemoryStore:
  """Holds the list in the process. Gone when the process exits."""

  def __init__(self) -> None:
    self.messages: list[dict[str, Any]] = []

  def load(self) -> list[dict[str, Any]]:
    return list(self.messages)

  def append(self, message: dict[str, Any]) -> None:
    self.messages.append(message)


class JsonlStore:
  """One JSON object per line, appended. This is how Claude Code stores a session."""

  def __init__(self, path: Path) -> None:
    self.path = path
    self.path.parent.mkdir(parents=True, exist_ok=True)

  def load(self) -> list[dict[str, Any]]:
    if not self.path.exists():
      return []
    with self.path.open(encoding="utf-8") as f:
      return [json.loads(line) for line in f if line.strip()]

  def append(self, message: dict[str, Any]) -> None:
    with self.path.open("a", encoding="utf-8") as f:
      f.write(json.dumps(message, ensure_ascii=False) + "\n")


class RedisStore:
  """Keeps the history in a Redis list so separate processes share one session."""

  def __init__(self, client: Any, session_id: str, ttl_seconds: int = 3600) -> None:
    self.client = client
    self.key = f"chat:{session_id}"
    self.ttl_seconds = ttl_seconds

  def load(self) -> list[dict[str, Any]]:
    return [json.loads(raw) for raw in self.client.lrange(self.key, 0, -1)]

  def append(self, message: dict[str, Any]) -> None:
    self.client.rpush(self.key, json.dumps(message, ensure_ascii=False))
    self.client.expire(self.key, self.ttl_seconds)
