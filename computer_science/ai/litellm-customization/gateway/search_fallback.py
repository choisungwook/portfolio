"""9단계: search_tools에 등록한 검색 도구를 순서대로 시도하는 두 방식.

- search_with_code_fallback: provider 코드가 litellm.asearch를 직접 부르며 직접 다음 도구로 넘어간다.
- search_with_router_fallback: Router.asearch에 맡기고 router_settings.fallbacks로 넘어간다.
"""

from collections.abc import Callable

import litellm

from gateway.intent_router import proxy_router

SEARCH_ORDER = ("searxng-primary", "searxng-backup")


class SearchUnavailableError(Exception):
  """등록한 검색 도구가 모두 실패했다."""


def search_tool_params(router, name: str) -> dict:
  """Router에 등록된 search_tools에서 이름으로 litellm_params를 찾는다."""
  for tool in router.settings().search_tools:
    if tool["search_tool_name"] == name:
      return dict(tool["litellm_params"])
  raise KeyError(f"search tool not registered: {name}")


def snippets(response) -> list[str]:
  """SearchResponse에서 snippet 목록만 꺼낸다."""
  return [result.snippet for result in response.results]


async def search_with_code_fallback(
  query: str, order: tuple[str, ...] = SEARCH_ORDER, get_router: Callable = proxy_router
) -> tuple[list[str], str]:
  """order 순서대로 litellm.asearch를 직접 부른다. (snippet 목록, 답한 도구 이름)을 돌려준다."""
  errors = []
  for name in order:
    try:
      response = await litellm.asearch(query=query, **search_tool_params(get_router(), name))
      return snippets(response), name
    except Exception as error:  # noqa: BLE001 - 연결 실패, 4xx/5xx 모두 다음 도구로 넘긴다
      errors.append(f"{name}: {type(error).__name__}")
  raise SearchUnavailableError("; ".join(errors))


async def search_with_router_fallback(
  query: str, first: str = SEARCH_ORDER[0], get_router: Callable = proxy_router
) -> tuple[list[str], str]:
  """Router.asearch로 첫 도구를 부르고, 실패 시 router_settings.fallbacks에 맡긴다."""
  response = await get_router().asearch(search_tool_name=first, query=query)
  answered_by = response._hidden_params.get("additional_headers", {}).get("x-litellm-model-group", first)
  return snippets(response), answered_by
