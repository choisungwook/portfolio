"""Store tests. No API key and no Redis server needed."""

import tempfile
from pathlib import Path

from store import JsonlStore, MemoryStore, RedisStore


class FakeRedis:
  """Just enough Redis to exercise RedisStore: rpush, lrange, expire."""

  def __init__(self) -> None:
    self.lists: dict[str, list[bytes]] = {}
    self.ttls: dict[str, int] = {}

  def rpush(self, key: str, value: str) -> None:
    self.lists.setdefault(key, []).append(value.encode())

  def lrange(self, key: str, start: int, end: int) -> list[bytes]:
    items = self.lists.get(key, [])
    return items[start:] if end == -1 else items[start : end + 1]

  def expire(self, key: str, seconds: int) -> None:
    self.ttls[key] = seconds


def check_roundtrip(store: object, label: str) -> None:
  """Append two messages and assert load() returns them in order."""
  store.append({"role": "user", "content": "내 이름은 악분이야"})
  store.append({"role": "assistant", "content": "반가워요 악분님"})
  loaded = store.load()
  assert len(loaded) == 2, f"{label}: expected 2, got {len(loaded)}"
  assert loaded[0]["role"] == "user", f"{label}: first message must be the user turn"
  assert "악분" in loaded[1]["content"], f"{label}: non-ascii content must survive"


def test_memory_store_is_isolated_per_instance() -> None:
  """A new MemoryStore starts empty. This is why an in-memory chat forgets on restart."""
  first = MemoryStore()
  check_roundtrip(first, "MemoryStore")
  assert MemoryStore().load() == [], "a fresh process must see an empty history"


def test_jsonl_store_survives_a_new_instance() -> None:
  """Reopening the same file returns the same history, which is what a restart does."""
  with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "session.jsonl"
    check_roundtrip(JsonlStore(path), "JsonlStore")
    assert len(JsonlStore(path).load()) == 2, "history must survive a new instance"
    assert len(path.read_text(encoding="utf-8").strip().splitlines()) == 2


def test_redis_store_sets_a_ttl() -> None:
  """The TTL is what makes a Redis session expire instead of leaking forever."""
  fake = FakeRedis()
  check_roundtrip(RedisStore(fake, "s1", ttl_seconds=60), "RedisStore")
  assert fake.ttls["chat:s1"] == 60, "every append must refresh the session TTL"


def test_redis_store_separates_sessions() -> None:
  """Two session ids must not see each other's messages."""
  fake = FakeRedis()
  RedisStore(fake, "alice").append({"role": "user", "content": "hi"})
  assert RedisStore(fake, "bob").load() == [], "bob must not read alice's history"


if __name__ == "__main__":
  test_memory_store_is_isolated_per_instance()
  test_jsonl_store_survives_a_new_instance()
  test_redis_store_sets_a_ttl()
  test_redis_store_separates_sessions()
  print("ok - all store tests passed")
