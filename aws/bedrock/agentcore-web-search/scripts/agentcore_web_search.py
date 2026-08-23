import argparse
import os

from agentcore_web_search import create_agentcore_client, print_response, search_with_agentcore

DEFAULT_QUERY = "2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 한국어로 설명해줘"


def parse_args() -> argparse.Namespace:
  """Parse an optional AgentCore Web Search query."""
  parser = argparse.ArgumentParser()
  parser.add_argument("query", nargs="?", default=DEFAULT_QUERY)
  return parser.parse_args()


def main() -> None:
  """Run AgentCore Web Search through LiteLLM's OpenAI Responses endpoint."""
  args = parse_args()
  port = os.getenv("LITELLM_PORT", "4001")
  api_key = os.environ["LITELLM_MASTER_KEY"]
  client = create_agentcore_client(f"http://localhost:{port}", api_key)
  response = search_with_agentcore(client, args.query)
  print_response(response)


if __name__ == "__main__":
  main()
