"""8단계: custom provider가 검색 결과를 붙여 실제 모델을 부르고, 스트림 첫 청크로 상태를 보내는지 확인한다."""

import json
from types import SimpleNamespace

from gateway.search_provider import ANSWER_MODEL, GatewaySearchLLM

QUESTION = [{"role": "user", "content": "LiteLLM 최신 버전"}]


class FakeRouter:
  """받은 호출을 기록하고, stream이면 정해진 조각을 청크로 흘려보내는 가짜 Router."""

  def __init__(self, events: list[str]) -> None:
    self.events = events
    self.calls: list[dict] = []

  async def acompletion(self, **kwargs):
    self.calls.append(kwargs)
    self.events.append("router")
    if kwargs.get("stream"):
      return self.stream(["답", "변"])
    return "non-stream-response"

  async def stream(self, pieces: list[str]):
    for piece in pieces:
      yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=piece))])


def build(events: list[str]) -> tuple[GatewaySearchLLM, FakeRouter]:
  async def search(query: str) -> list[str]:
    events.append("search")
    return [f"result for {query}"], "fake"

  router = FakeRouter(events)
  return GatewaySearchLLM(search=search, get_router=lambda: router), router


async def test_acompletion_calls_answer_model_with_search_context() -> None:
  provider, router = build([])
  response = await provider.acompletion("search", QUESTION)
  assert response == "non-stream-response"
  assert router.calls[0]["model"] == ANSWER_MODEL
  assert router.calls[0]["messages"][0]["role"] == "system"
  assert "result for LiteLLM 최신 버전" in router.calls[0]["messages"][0]["content"]


async def test_astreaming_sends_status_before_search_then_relays() -> None:
  events: list[str] = []
  provider, _ = build(events)
  chunks = []
  async for chunk in provider.astreaming("search", QUESTION):
    events.append("chunk")
    chunks.append(chunk)
  assert events[:2] == ["chunk", "search"]  # 상태 청크가 검색보다 먼저 나간다
  assert json.loads(chunks[0]["tool_use"]["function"]["arguments"])["status"] == "searching"
  assert [chunk["text"] for chunk in chunks[1:]] == ["답", "변", ""]
  assert chunks[-1]["is_finished"] and chunks[-1]["finish_reason"] == "stop"
