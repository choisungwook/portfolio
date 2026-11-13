"""6단계: 문자열 프리필터 → 작은 LLM 분류 → 규칙 판정 순서로 질문 의도를 정하는 훅."""

import asyncio
import json
from collections.abc import Callable

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.intent_cache import InMemoryIntentCache, IntentCache, ValkeyIntentCache, question_key
from gateway.keyword_router import find_keyword, last_user_text
from gateway.metadata_tagger import add_spend_logs_metadata

INTENT_MODELS = {"heavy": "chat-large", "light": "chat-small"}
GREETINGS = ("안녕", "고마워", "감사", "hello", "thanks")
CLASSIFIER_MODEL = "intent-classifier"
CLASSIFIER_TIMEOUT_SECONDS = 0.5
CLASSIFIER_PROMPT = (
  'Q&A 챗봇 질문을 분류한다. 여러 단계 추론이 필요하면 heavy, 아니면 light. '
  '반드시 JSON 한 줄로만 답한다: {"intent": "heavy"} 또는 {"intent": "light"}'
)
RULE_LENGTH_THRESHOLD = 40


def prefilter(question: str) -> str | None:
  """글자만 보고 확신할 수 있을 때만 의도를 돌려준다. 애매하면 None."""
  if find_keyword(question):
    return "heavy"
  if len(question) <= 10 and any(word in question.lower() for word in GREETINGS):
    return "light"
  return None


def parse_intent(content: str | None) -> str:
  """분류 모델의 JSON 한 줄 응답에서 intent를 꺼낸다. 형식이 틀리면 ValueError."""
  intent = json.loads(content or "").get("intent")
  if intent not in INTENT_MODELS:
    raise ValueError(f"unknown intent: {intent!r}")
  return intent


def rule_fallback(question: str) -> str:
  """LLM 분류가 실패했을 때 쓰는 마지막 규칙. 긴 질문을 무겁다고 본다."""
  return "heavy" if len(question) > RULE_LENGTH_THRESHOLD else "light"


def proxy_router():
  """Proxy가 시작할 때 만든 Router. 훅 import 시점에는 아직 없으므로 호출할 때 꺼낸다."""
  from litellm.proxy.proxy_server import llm_router

  return llm_router


class IntentRouter(CustomLogger):
  """질문 의도를 분류해 model을 정하고, 결과를 질문 해시로 캐시한다."""

  def __init__(self, cache: IntentCache, get_router: Callable = proxy_router) -> None:
    super().__init__()
    self.cache = cache
    self.get_router = get_router

  async def classify_with_llm(self, question: str) -> str:
    """작은 분류 모델을 시간 제한 안에서 호출한다. 실패하면 예외를 그대로 올린다."""
    response = await asyncio.wait_for(
      self.get_router().acompletion(
        model=CLASSIFIER_MODEL,
        messages=[{"role": "system", "content": CLASSIFIER_PROMPT}, {"role": "user", "content": question}],
      ),
      timeout=CLASSIFIER_TIMEOUT_SECONDS,
    )
    return parse_intent(response.choices[0].message.content)

  async def classify(self, question: str) -> tuple[str, str]:
    """(intent, 판정 출처)를 돌려준다. 출처는 prefilter, llm, rule 중 하나."""
    intent = prefilter(question)
    if intent:
      return intent, "prefilter"
    try:
      return await self.classify_with_llm(question), "llm"
    except Exception as error:  # noqa: BLE001 - timeout, 연결 실패, JSON 형식 오류를 모두 규칙으로 흡수한다
      return rule_fallback(question), f"rule ({type(error).__name__})"

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """캐시를 먼저 보고, 없으면 분류 체인을 돌려 model을 정한다."""
    question = last_user_text(data.get("messages", []))
    key = question_key(question)
    intent = await self.cache.get(key)
    source = "cache"
    if intent is None:
      intent, source = await self.classify(question)
      if source == "llm":  # 프리필터는 다시 해도 싸고, 규칙 판정은 일시 장애의 결과라 캐시하지 않는다
        await self.cache.set(key, intent)
    data["model"] = INTENT_MODELS[intent]
    return add_spend_logs_metadata(data, {"intent_router": f"{intent} via {source}"})


intent_router_memory = IntentRouter(cache=InMemoryIntentCache())
intent_router_valkey = IntentRouter(cache=ValkeyIntentCache())
