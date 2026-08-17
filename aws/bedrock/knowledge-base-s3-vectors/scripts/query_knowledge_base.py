#!/usr/bin/env python3
import argparse
import json
import subprocess


def parse_args() -> argparse.Namespace:
  """Parse command-line arguments for a Knowledge Base query."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--knowledge-base-id", required=True)
  parser.add_argument("--model-arn", required=True)
  parser.add_argument("--region", default="ap-northeast-2")
  parser.add_argument("--question", required=True)
  return parser.parse_args()


def retrieve_and_generate_payload(args: argparse.Namespace) -> dict:
  """Build a RetrieveAndGenerate AWS CLI payload."""
  return {
    "input": {
      "text": args.question,
    },
    "retrieveAndGenerateConfiguration": {
      "type": "KNOWLEDGE_BASE",
      "knowledgeBaseConfiguration": {
        "knowledgeBaseId": args.knowledge_base_id,
        "modelArn": args.model_arn,
      },
    },
  }


def main() -> None:
  """Call Amazon Bedrock Knowledge Bases through the AWS CLI."""
  args = parse_args()
  command = [
    "aws",
    "bedrock-agent-runtime",
    "retrieve-and-generate",
    "--region",
    args.region,
    "--cli-input-json",
    json.dumps(retrieve_and_generate_payload(args)),
  ]
  subprocess.run(command, check=True)


if __name__ == "__main__":
  main()
