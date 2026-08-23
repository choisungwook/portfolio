import json
from dataclasses import dataclass
from typing import Any

import boto3
import httpx
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import ReadOnlyCredentials


@dataclass(frozen=True)
class SearchResult:
  """Represent one structured result returned by AgentCore Web Search."""

  text: str
  url: str | None
  title: str | None
  published_date: str | None


class AgentCoreWebSearchClient:
  """Discover and invoke AgentCore Web Search through its MCP gateway."""

  def __init__(
    self,
    gateway_url: str,
    region: str = "us-east-1",
    timeout_seconds: float = 30,
  ) -> None:
    self.gateway_url = gateway_url
    self.region = region
    self.timeout_seconds = timeout_seconds

  def list_tools(self) -> list[dict[str, Any]]:
    """Return tools exposed by the configured AgentCore gateway."""
    response = self._call_rpc("tools/list", {})
    return response["result"]["tools"]

  def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
    """Search the web and return parsed structured observations."""
    if not 1 <= len(query) <= 200:
      raise ValueError("검색어 길이는 1자 이상 200자 이하여야 한다")
    if not 1 <= max_results <= 25:
      raise ValueError("검색 결과 개수는 1 이상 25 이하여야 한다")
    tool_name = self._find_web_search_tool()
    response = self._call_rpc(
      "tools/call",
      {"name": tool_name, "arguments": {"query": query, "maxResults": max_results}},
    )
    return self._parse_search_results(response)

  def _find_web_search_tool(self) -> str:
    for tool in self.list_tools():
      if tool["name"].endswith("WebSearch"):
        return str(tool["name"])
    raise LookupError("Gateway에서 WebSearch 도구를 찾지 못했다")

  def _call_rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = self._signed_headers(body)
    response = httpx.post(
      self.gateway_url,
      content=body.encode(),
      headers=headers,
      timeout=self.timeout_seconds,
    )
    response.raise_for_status()
    return self._parse_mcp_response(response)

  def _signed_headers(self, body: str) -> dict[str, str]:
    credentials = self._credentials()
    headers = {
      "Accept": "application/json, text/event-stream",
      "Content-Type": "application/json",
    }
    request = AWSRequest(method="POST", url=self.gateway_url, data=body, headers=headers)
    SigV4Auth(credentials, "bedrock-agentcore", self.region).add_auth(request)
    return dict(request.headers.items())

  def _credentials(self) -> ReadOnlyCredentials:
    credentials = boto3.Session().get_credentials()
    if credentials is None:
      raise RuntimeError("AWS 자격 증명을 찾지 못했다. 먼저 aws login을 실행한다")
    return credentials.get_frozen_credentials()

  @staticmethod
  def _parse_mcp_response(response: httpx.Response) -> dict[str, Any]:
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" not in content_type:
      return response.json()
    for line in response.text.splitlines():
      if line.startswith("data:"):
        return json.loads(line.removeprefix("data:").strip())
    raise ValueError("MCP SSE 응답에서 data 이벤트를 찾지 못했다")

  @staticmethod
  def _parse_search_results(response: dict[str, Any]) -> list[SearchResult]:
    if "error" in response:
      raise RuntimeError(json.dumps(response["error"], ensure_ascii=False))
    content = response["result"]["content"]
    text_block = next((block for block in content if block["type"] == "text"), None)
    if text_block is None:
      raise ValueError("MCP 응답에서 text content block을 찾지 못했다")
    document = json.loads(text_block["text"])
    return [
      SearchResult(
        text=item["text"],
        url=item.get("url"),
        title=item.get("title"),
        published_date=item.get("publishedDate"),
      )
      for item in document["results"]
    ]
