import json
import urllib.request
from typing import Any

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.session import Session

DEFAULT_TOOL_NAME = "web-search-tool___WebSearch"
DEFAULT_MAX_RESULTS = 5
MCP_PROTOCOL_VERSION = "2025-03-26"
MAX_QUERY_LENGTH = 200


def build_search_request(
  query: str,
  max_results: int = DEFAULT_MAX_RESULTS,
  tool_name: str = DEFAULT_TOOL_NAME,
) -> dict[str, Any]:
  """Build the MCP tools/call body for the Web Search connector target."""
  return {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": tool_name,
      "arguments": {"query": query[:MAX_QUERY_LENGTH], "maxResults": max_results},
    },
  }


def sign_headers(gateway_url: str, body: str, region: str) -> dict[str, str]:
  """SigV4-sign the MCP request for an AWS_IAM gateway."""
  headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  }
  request = AWSRequest(method="POST", url=gateway_url, data=body, headers=headers)
  SigV4Auth(Session().get_credentials(), "bedrock-agentcore", region).add_auth(request)
  return dict(request.headers)


def parse_search_results(payload: dict[str, Any]) -> list[dict[str, str]]:
  """Unwrap the JSON-RPC envelope into the connector's search result list."""
  if "error" in payload:
    raise RuntimeError(f"AgentCore Gateway 오류: {payload['error']}")
  result = payload["result"]
  if result.get("isError"):
    raise RuntimeError(f"Web Search connector 오류: {result['content']}")
  return json.loads(result["content"][0]["text"])["results"]


def search_web(
  gateway_url: str,
  query: str,
  region: str,
  max_results: int = DEFAULT_MAX_RESULTS,
  tool_name: str = DEFAULT_TOOL_NAME,
) -> list[dict[str, str]]:
  """Call the AgentCore Gateway Web Search tool directly, without LiteLLM."""
  body = json.dumps(build_search_request(query, max_results, tool_name))
  headers = sign_headers(gateway_url, body, region)
  request = urllib.request.Request(gateway_url, data=body.encode(), headers=headers)
  # tools/call answers with application/json; the MCP SSE transport is not used here.
  try:
    with urllib.request.urlopen(request) as response:
      return parse_search_results(json.loads(response.read()))
  except urllib.error.HTTPError as error:
    raise RuntimeError(f"Gateway 호출 실패 {error.code} {error.reason}") from error
