"""6단계: 분류 체인의 세 경로(프리필터, LLM, 규칙)와 캐시를 fake Router로 확인한다."""

import asyncio
from types import SimpleNamespace

from litellm.proxy._types import UserAPIKeyAuth

from gateway.intent_cache import InMemoryIntentCache, question_key
from gateway.intent_router import IntentRouter


class FakeRouter:
  """정해진 content로 답하거나 delay만큼 늦게 답하는 가짜 Router."""

  def __init__(self, content: str, delay: float = 0) -> None:
    self.content = content
    self.delay = delay
    self.calls = 0

  async def acompletion(self, **kwargs) -> SimpleNamespace:
    self.calls += 1
    await asyncio.sleep(self.delay)
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))])


async def ask(hook: IntentRouter, question: str) -> dict:
  data = {"model": "chat-small", "messages": [{"role": "user", "content": question}]}
  return await hook.async_pre_call_hook(UserAPIKeyAuth(), None, data, "acompletion")


async def test_prefilter_decides_without_llm() -> None:
  router = FakeRouter('{"intent": "heavy"}')
  data = await ask(IntentRouter(InMemoryIntentCache(), lambda: router), "안녕")
  assert data["model"] == "chat-small"
  assert router.calls == 0


async def test_llm_result_is_cached_by_normalized_question() -> None:
  router, cache = FakeRouter('{"intent": "heavy"}'), InMemoryIntentCache()
  hook = IntentRouter(cache, lambda: router)
  await ask(hook, "광합성 원리를 단계별로 설명해줘")
  data = await ask(hook, "광합성  원리를 단계별로 설명해줘 ")
  assert router.calls == 1
  assert data["metadata"]["spend_logs_metadata"]["intent_router"] == "heavy via cache"
  assert await cache.get(question_key("광합성 원리를 단계별로 설명해줘")) == "heavy"


async def test_slow_or_broken_classifier_falls_back_to_rule_without_caching() -> None:
  cache = InMemoryIntentCache()
  slow = IntentRouter(cache, lambda: FakeRouter('{"intent": "heavy"}', delay=1))
  broken = IntentRouter(cache, lambda: FakeRouter("heavy입니다"))
  slow_data = await ask(slow, "광합성 원리를 단계별로 설명해줘")
  broken_data = await ask(broken, "광합성 원리를 단계별로 설명해줘")
  assert slow_data["metadata"]["spend_logs_metadata"]["intent_router"] == "light via rule (TimeoutError)"
  assert broken_data["metadata"]["spend_logs_metadata"]["intent_router"] == "light via rule (JSONDecodeError)"
  assert cache.store == {}
