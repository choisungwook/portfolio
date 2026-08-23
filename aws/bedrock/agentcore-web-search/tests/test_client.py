import json

import httpx
import pytest

from agentcore_web_search.client import AgentCoreWebSearchClient


def test_parse_json_response() -> None:
  response = httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}})

  parsed = AgentCoreWebSearchClient._parse_mcp_response(response)

  assert parsed["jsonrpc"] == "2.0"


def test_parse_sse_response() -> None:
  payload = {"jsonrpc": "2.0", "id": 1, "result": {"tools": []}}
  response = httpx.Response(
    200,
    headers={"content-type": "text/event-stream"},
    text=f"event: message\ndata: {json.dumps(payload)}\n\n",
  )

  parsed = AgentCoreWebSearchClient._parse_mcp_response(response)

  assert parsed == payload


def test_parse_search_results() -> None:
  inner = {
    "id": "search-id",
    "results": [
      {
        "text": "검색 결과",
        "url": "https://example.com",
        "title": "예제",
        "publishedDate": "2026-08-23",
      }
    ],
  }
  response = {
    "result": {"content": [{"type": "text", "text": json.dumps(inner, ensure_ascii=False)}]}
  }

  results = AgentCoreWebSearchClient._parse_search_results(response)

  assert results[0].title == "예제"
  assert results[0].url == "https://example.com"


@pytest.mark.parametrize(
  ("query", "max_results"),
  [("", 5), ("가" * 201, 5), ("정상 질의", 0), ("정상 질의", 26)],
)
def test_search_rejects_out_of_range_input(query: str, max_results: int) -> None:
  client = AgentCoreWebSearchClient("https://example.com")

  with pytest.raises(ValueError):
    client.search(query, max_results)
