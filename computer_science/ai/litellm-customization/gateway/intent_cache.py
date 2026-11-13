"""6단계: 질문 해시를 key로 분류 결과를 저장하는 캐시 두 종류."""

import hashlib
import os
from typing import Protocol

import redis.asyncio as redis

CACHE_PREFIX = "intent:"
CACHE_TTL_SECONDS = 3600


def question_key(question: str) -> str:
  """공백과 대소문자를 정규화한 질문의 sha256으로 캐시 key를 만든다. 원문은 key에 남지 않는다."""
  normalized = " ".join(question.lower().split())
  return CACHE_PREFIX + hashlib.sha256(normalized.encode()).hexdigest()


class IntentCache(Protocol):
  """분류 결과 캐시가 지켜야 할 인터페이스."""

  async def get(self, key: str) -> str | None: ...

  async def set(self, key: str, intent: str) -> None: ...


class InMemoryIntentCache:
  """Proxy 프로세스 메모리의 dict. 재시작하면 비고, replica끼리 공유되지 않는다."""

  def __init__(self) -> None:
    self.store: dict[str, str] = {}  # ponytail: 크기 제한 없음, 운영이면 TTL·LRU 또는 Valkey

  async def get(self, key: str) -> str | None:
    return self.store.get(key)

  async def set(self, key: str, intent: str) -> None:
    self.store[key] = intent


class ValkeyIntentCache:
  """Valkey(Redis 호환)에 TTL과 함께 저장한다. 연결은 첫 사용 때 만든다."""

  def __init__(self, url_env: str = "REDIS_URL") -> None:
    self.url_env = url_env
    self.client: redis.Redis | None = None

  def connection(self) -> redis.Redis:
    """REDIS_URL로 클라이언트를 한 번만 만든다."""
    if self.client is None:
      self.client = redis.from_url(os.environ[self.url_env], decode_responses=True)
    return self.client

  async def get(self, key: str) -> str | None:
    return await self.connection().get(key)

  async def set(self, key: str, intent: str) -> None:
    await self.connection().set(key, intent, ex=CACHE_TTL_SECONDS)
