"""8단계: 가짜 모델 이름(gateway-search) 뒤에서 검색 후 실제 모델로 답하는 custom provider."""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

from litellm import ModelResponse
from litellm.llms.custom_llm import CustomLLM
from litellm.types.utils import GenericStreamingChunk

from gateway.decision_trail import record_from_provider
from gateway.intent_router import proxy_router
from gateway.keyword_router import last_user_text
from gateway.search_fallback import search_with_code_fallback, search_with_router_fallback

ANSWER_MODEL = "chat-small"
FAKE_SEARCH_SECONDS = 0.5  # 검색 지연을 흉내 낸다
SearchFn = Callable[[str], Awaitable[tuple[list[str], str]]]  # (검색 결과, 답한 검색 도구)


async def fake_search(query: str) -> tuple[list[str], str]:
  """8단계용 가짜 검색. 9단계에서 search_tools 기반 검색으로 바꾼다."""
  await asyncio.sleep(FAKE_SEARCH_SECONDS)
  return [f"[fake] '{query}'에 대한 검색 결과 1", f"[fake] '{query}'에 대한 검색 결과 2"], "fake"


def with_search_context(messages: list[dict], results: list[str]) -> list[dict]:
  """검색 결과를 system 메시지로 앞에 붙인 새 messages를 만든다."""
  context = "다음 검색 결과만 근거로 답한다.\n" + "\n".join(f"- {result}" for result in results)
  return [{"role": "system", "content": context}, *messages]


def status_chunk(query: str) -> GenericStreamingChunk:
  """클라이언트에 '검색 중'임을 먼저 알리는 첫 청크. 내용 대신 tool_calls 자리에 상태를 싣는다."""
  return GenericStreamingChunk(
    text="",
    tool_use={
      "id": f"call_{uuid.uuid4().hex[:12]}",
      "type": "function",
      "function": {"name": "web_search", "arguments": json.dumps({"query": query, "status": "searching"}, ensure_ascii=False)},
      "index": 0,
    },
    is_finished=False,
    finish_reason="",
    usage=None,
    index=0,
  )


def text_chunk(text: str, finished: bool = False) -> GenericStreamingChunk:
  """실제 모델의 텍스트 조각을 GenericStreamingChunk로 감싼다."""
  return GenericStreamingChunk(
    text=text, tool_use=None, is_finished=finished, finish_reason="stop" if finished else "", usage=None, index=0
  )


class GatewaySearchLLM(CustomLLM):
  """검색을 먼저 하고, 검색 결과를 붙여 Proxy Router의 실제 모델을 다시 부른다."""

  def __init__(self, search: SearchFn = fake_search, get_router: Callable = proxy_router) -> None:
    super().__init__()
    self.search = search
    self.get_router = get_router

  async def prepare(self, messages: list[dict]) -> tuple[str, list[dict]]:
    """질문을 꺼내 검색하고, (답한 검색 도구, 검색 결과가 붙은 messages)를 돌려준다."""
    results, answered_by = await self.search(last_user_text(messages))
    return answered_by, with_search_context(messages, results)

  async def acompletion(self, model: str, messages: list, *args, **kwargs) -> ModelResponse:
    """비스트리밍: 검색 후 실제 모델의 응답을 그대로 돌려준다."""
    answered_by, augmented = await self.prepare(messages)
    record_from_provider(kwargs, {"search_provider": f"{answered_by} -> {ANSWER_MODEL}"})
    return await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented)

  async def astreaming(self, model: str, messages: list, *args, **kwargs) -> AsyncIterator[GenericStreamingChunk]:
    """스트리밍: 상태 청크를 먼저 보내고, 실제 모델 스트림을 청크 단위로 중계한다."""
    query = last_user_text(messages)
    yield status_chunk(query)
    answered_by, augmented = await self.prepare(messages)
    record_from_provider(kwargs, {"search_provider": f"{answered_by} -> {ANSWER_MODEL}"})
    stream = await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented, stream=True)
    async for chunk in stream:
      yield text_chunk(chunk.choices[0].delta.content or "")
    yield text_chunk("", finished=True)


gateway_search = GatewaySearchLLM()
gateway_search_code_fallback = GatewaySearchLLM(search=search_with_code_fallback)
gateway_search_router_fallback = GatewaySearchLLM(search=search_with_router_fallback)
