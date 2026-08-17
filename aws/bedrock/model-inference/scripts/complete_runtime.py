#!/usr/bin/env python3
"""Generate text through the AWS-native Bedrock Runtime endpoint."""

import argparse
import os

import boto3

from bedrock_examples.runtime_api import complete_text


def parse_args() -> argparse.Namespace:
  """Parse the model, prompt, and AWS Region."""
  parser = argparse.ArgumentParser()
  parser.add_argument("prompt")
  parser.add_argument(
    "--model-id",
    default=os.getenv("BEDROCK_RUNTIME_TEXT_MODEL", "amazon.nova-micro-v1:0"),
  )
  parser.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
  return parser.parse_args()


def main() -> None:
  """Print a Bedrock Converse response."""
  args = parse_args()
  client = boto3.client("bedrock-runtime", region_name=args.region)
  print(complete_text(client, args.model_id, args.prompt))


if __name__ == "__main__":
  main()
