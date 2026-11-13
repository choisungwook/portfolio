"""같은 search_tools로 세 가지 검색 호출 방식을 비교한다.

1. litellm.asearch 직접 호출: 1순위 도구 설정만 넘긴다
2. 코드 폴백: gateway.search_fallback.search_with_code_fallback
3. Router 폴백: gateway.search_fallback.search_with_router_fallback

사용법: uv run python scripts/compare_search_fallback.py config/9-search-router.yaml
"""

import asyncio
import sys

import litellm
import yaml

from gateway.search_fallback import (
  search_tool_params,
  search_with_code_fallback,
  search_with_router_fallback,
)


def build_router(config_path: str) -> litellm.Router:
  """config의 search_tools와 router_settings로 Router를 만든다."""
  with open(config_path) as f:
    config = yaml.safe_load(f)
  return litellm.Router(model_list=[], search_tools=config["search_tools"], **config.get("router_settings", {}))


async def run(label: str, call) -> None:
  """검색 하나를 실행하고 답한 도구 또는 오류를 출력한다."""
  try:
    results, answered_by = await call()
    print(f"{label}: {answered_by} -> {results[0]}")
  except Exception as error:  # noqa: BLE001 - 관찰 도구라 어떤 오류든 이름만 출력한다
    print(f"{label}: 오류 {type(error).__name__}")


async def direct_search(router: litellm.Router) -> tuple[list[str], str]:
  response = await litellm.asearch(query="LiteLLM", **search_tool_params(router, "searxng-primary"))
  return [result.snippet for result in response.results], "searxng-primary"


async def main(config_path: str) -> None:
  router = build_router(config_path)
  await run("1. litellm.asearch 직접", lambda: direct_search(router))
  await run("2. 코드 폴백", lambda: search_with_code_fallback("LiteLLM", get_router=lambda: router))
  await run("3. Router 폴백", lambda: search_with_router_fallback("LiteLLM", get_router=lambda: router))


if __name__ == "__main__":
  asyncio.run(main(sys.argv[1]))
