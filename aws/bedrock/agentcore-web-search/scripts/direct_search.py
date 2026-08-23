import argparse
import json
import os

from agentcore_web_search import AgentCoreWebSearchClient


def parse_args() -> argparse.Namespace:
  """Parse the query and result count from command-line arguments."""
  parser = argparse.ArgumentParser()
  parser.add_argument("query")
  parser.add_argument("--max-results", type=int, default=5)
  return parser.parse_args()


def main() -> None:
  """Run one direct AgentCore Web Search query and print JSON."""
  args = parse_args()
  gateway_url = os.environ["AGENTCORE_GATEWAY_URL"]
  client = AgentCoreWebSearchClient(gateway_url, region=os.getenv("AWS_REGION", "us-east-1"))
  results = client.search(args.query, args.max_results)
  print(json.dumps([result.__dict__ for result in results], ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
