#!/usr/bin/env python3
"""List text-output models from the AWS-native Bedrock control endpoint."""

import argparse
import os

import boto3

from bedrock_examples.runtime_api import list_text_models


def parse_args() -> argparse.Namespace:
  """Parse the AWS Region."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
  return parser.parse_args()


def main() -> None:
  """Print text-output foundation model IDs."""
  args = parse_args()
  client = boto3.client("bedrock", region_name=args.region)
  for model_id in list_text_models(client):
    print(model_id)


if __name__ == "__main__":
  main()
