import argparse
import os

from agentcore_web_search import create_bedrock_client, print_response, search_with_bedrock

DEFAULT_QUERY = "What were the key announcements at AWS re:Invent 2025?"


def parse_args() -> argparse.Namespace:
  """Parse an optional Web Search query."""
  parser = argparse.ArgumentParser()
  parser.add_argument("query", nargs="?", default=DEFAULT_QUERY)
  return parser.parse_args()


def main() -> None:
  """Run Bedrock Web Search with the OpenAI Responses SDK."""
  args = parse_args()
  region = os.getenv("AWS_REGION", "us-east-1")
  model = os.getenv("BEDROCK_MODEL", "openai.gpt-5.6-luna")
  client = create_bedrock_client(region)
  response = search_with_bedrock(client, args.query, model)
  print_response(response)


if __name__ == "__main__":
  main()
