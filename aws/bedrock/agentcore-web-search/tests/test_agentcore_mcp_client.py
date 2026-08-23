import json
import urllib.error
from unittest.mock import Mock, patch

import pytest

from agentcore_web_search.agentcore_mcp_client import (
  build_search_request,
  parse_search_results,
  search_web,
)

RESULTS = [{"title": "AWS News", "url": "https://example.com", "text": "snippet"}]
PAYLOAD = {
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "isError": False,
    "content": [{"type": "text", "text": json.dumps({"id": "1", "results": RESULTS})}],
  },
}


def test_build_search_request() -> None:
  request = build_search_request("query", max_results=3)

  assert request["method"] == "tools/call"
  assert request["params"]["name"] == "web-search-tool___WebSearch"
  assert request["params"]["arguments"] == {"query": "query", "maxResults": 3}


def test_build_search_request_truncates_long_query() -> None:
  request = build_search_request("가" * 300)

  assert len(request["params"]["arguments"]["query"]) == 200


def test_parse_search_results() -> None:
  assert parse_search_results(PAYLOAD) == RESULTS


def test_parse_search_results_raises_on_connector_error() -> None:
  payload = {"result": {"isError": True, "content": [{"type": "text", "text": "boom"}]}}

  with pytest.raises(RuntimeError):
    parse_search_results(payload)


def test_parse_search_results_raises_on_jsonrpc_error() -> None:
  with pytest.raises(RuntimeError):
    parse_search_results({"error": {"code": -32001, "message": "Invalid credentials"}})


@patch("agentcore_web_search.agentcore_mcp_client.urllib.request.urlopen")
@patch(
  "agentcore_web_search.agentcore_mcp_client.sign_headers",
  return_value={"Authorization": "AWS4"},
)
def test_search_web(sign_headers: Mock, urlopen: Mock) -> None:
  urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(PAYLOAD).encode()

  results = search_web("https://gateway.example.com/mcp", "query", "us-east-1")

  assert results == RESULTS
  assert sign_headers.call_args.args[0] == "https://gateway.example.com/mcp"


@patch("agentcore_web_search.agentcore_mcp_client.urllib.request.urlopen")
@patch(
  "agentcore_web_search.agentcore_mcp_client.sign_headers",
  return_value={"Authorization": "AWS4"},
)
def test_search_web_raises_readable_http_error(sign_headers: Mock, urlopen: Mock) -> None:
  urlopen.side_effect = urllib.error.HTTPError(
    "https://gateway.example.com/mcp", 401, "Unauthorized", {}, None
  )

  with pytest.raises(RuntimeError, match="401"):
    search_web("https://gateway.example.com/mcp", "query", "us-east-1")
