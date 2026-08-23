import argparse
import os

from openai import OpenAI
from openai.types.responses import Response

from .output import print_response

DEFAULT_QUERY = "오늘 며칠이야? 그리고 서울의 날씨는?"
DEFAULT_MODEL = "openai-search-agent"
LITELLM_SEARCH_TOOL = "litellm_web_search"


def parse_args() -> argparse.Namespace:
  """Parse an optional AgentCore Web Search query."""
  parser = argparse.ArgumentParser()
  parser.add_argument("query", nargs="?", default=DEFAULT_QUERY)
  return parser.parse_args()


def create_client() -> OpenAI:
  """Point the OpenAI SDK at the local LiteLLM proxy."""
  port = os.getenv("LITELLM_PORT", "4001")
  return OpenAI(
    base_url=f"http://localhost:{port}/v1",
    api_key=os.environ["LITELLM_MASTER_KEY"],
  )


def search(client: OpenAI, query: str, model: str = DEFAULT_MODEL) -> Response:
  """Send one OpenAI Responses request with the native web_search tool."""
  return client.responses.create(
    model=model,
    input=query,
    tools=[{"type": "web_search"}],
  )


def print_interception(response: Response) -> None:
  """Show that LiteLLM ran the search loop instead of the client."""
  tool_names = [getattr(tool, "name", tool.type) for tool in response.tools]
  client_tool_calls = [item for item in response.output if item.type == "function_call"]
  print(f"LiteLLM이 모델에 보낸 도구: {tool_names}")
  print(f"클라이언트가 처리한 tool call: {len(client_tool_calls)}건")
  if LITELLM_SEARCH_TOOL not in tool_names:
    raise SystemExit("web_search interception 미적용: litellm/config.yaml의 callbacks 확인")


def main() -> None:
  """Run AgentCore Web Search through LiteLLM's OpenAI Responses endpoint."""
  args = parse_args()
  response = search(create_client(), args.query)
  print_response(response)
  print_interception(response)


if __name__ == "__main__":
  main()
