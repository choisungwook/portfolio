"""9단계: 코드 폴백과 Router 폴백이 답한 검색 도구를 올바르게 알려 주는지 fake로 확인한다."""

from types import SimpleNamespace

import litellm
import pytest

from gateway import search_fallback
from gateway.search_fallback import SearchUnavailableError, search_with_code_fallback, search_with_router_fallback

TOOLS = [
  {"search_tool_name": "searxng-primary", "litellm_params": {"search_provider": "searxng", "api_base": "http://down"}},
  {"search_tool_name": "searxng-backup", "litellm_params": {"search_provider": "searxng", "api_base": "http://up"}},
]


def search_response(snippet: str, **hidden) -> SimpleNamespace:
  return SimpleNamespace(results=[SimpleNamespace(snippet=snippet)], _hidden_params=hidden)


class FakeRouter:
  """search_tools 설정과 asearch만 가진 가짜 Router."""

  def settings(self) -> SimpleNamespace:
    return SimpleNamespace(search_tools=TOOLS)

  async def asearch(self, search_tool_name: str, query: str) -> SimpleNamespace:
    return search_response("from router", additional_headers={"x-litellm-model-group": "searxng-backup"})


def fake_asearch(up_bases: set[str]):
  """api_base가 up_bases에 있을 때만 성공하는 litellm.asearch 대역."""

  async def asearch(query: str, search_provider: str, api_base: str):
    if api_base not in up_bases:
      raise litellm.APIConnectionError(message="down", llm_provider=search_provider, model="")
    return search_response(f"{api_base}: {query}")

  return asearch


async def test_code_fallback_moves_to_next_tool(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(search_fallback.litellm, "asearch", fake_asearch({"http://up"}))
  results, answered_by = await search_with_code_fallback("q", get_router=FakeRouter)
  assert (results, answered_by) == (["http://up: q"], "searxng-backup")


async def test_code_fallback_raises_when_every_tool_fails(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(search_fallback.litellm, "asearch", fake_asearch(set()))
  with pytest.raises(SearchUnavailableError, match="searxng-primary.*searxng-backup"):
    await search_with_code_fallback("q", get_router=FakeRouter)


async def test_router_fallback_reports_model_group_header() -> None:
  results, answered_by = await search_with_router_fallback("q", get_router=FakeRouter)
  assert (results, answered_by) == (["from router"], "searxng-backup")
