"""4단계: 판정 모델의 응답으로 model을 바꾸고, 판정이 실패하면 요청 모델을 유지하는지 fake Router로 확인한다."""

import asyncio
from types import SimpleNamespace

import pytest

from gateway.ai_router import JUDGE_MODEL, AiRouter, parse_choice


class FakeRouter:
  """정해진 content로 답하고 받은 호출을 기록하는 가짜 Router."""

  def __init__(self, content: str, delay: float = 0.0) -> None:
    self.content = content
    self.delay = delay
    self.calls: list[dict] = []

  async def acompletion(self, **kwargs) -> SimpleNamespace:
    self.calls.append(kwargs)
    await asyncio.sleep(self.delay)
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))])


def request(question: str) -> dict:
  return {"model": "claude", "messages": [{"role": "user", "content": question}]}


async def route(router: FakeRouter, timeout: float = 1.0) -> dict:
  hook = AiRouter(get_router=lambda: router, timeout=timeout)
  return await hook.async_pre_call_hook(None, None, request("오늘 점심 메뉴 추천해줘"), "completion")


async def test_judge_choice_replaces_model_and_is_recorded() -> None:
  router = FakeRouter('{"model": "gemini"}')
  data = await route(router)
  assert data["model"] == "gemini"
  assert data["metadata"]["spend_logs_metadata"]["ai_router"].startswith("claude->gemini in ")
  assert router.calls[0]["model"] == JUDGE_MODEL


async def test_unknown_choice_keeps_requested_model() -> None:
  data = await route(FakeRouter('{"model": "gpt"}'))
  assert data["model"] == "claude"
  assert "claude kept (ValueError)" in data["metadata"]["spend_logs_metadata"]["ai_router"]


async def test_slow_judge_keeps_requested_model() -> None:
  data = await route(FakeRouter('{"model": "gemini"}', delay=0.2), timeout=0.05)
  assert data["model"] == "claude"
  assert "claude kept (TimeoutError)" in data["metadata"]["spend_logs_metadata"]["ai_router"]


def test_parse_choice_rejects_non_json() -> None:
  with pytest.raises(ValueError):
    parse_choice("gemini")
